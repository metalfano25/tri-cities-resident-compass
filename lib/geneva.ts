import type {
  CommunityLiveResult,
  LiveEvent,
  LiveItemKind,
  LiveNotice,
  LiveSourceStatus,
} from "./live-types";

export type GenevaFeedKind = "city-news" | "traffic" | "event";

const BASE_URL = "https://www.geneva.il.us";
const REQUEST_TIMEOUT_MS = 7_000;
const MAX_RESPONSE_BYTES = 1_000_000;
const USER_AGENT =
  "TriCitiesResidentCompass/1.0 (+https://www.geneva.il.us/; public RSS reader)";

const FEEDS: Record<
  GenevaFeedKind,
  { id: string; name: string; url: string; itemKind: LiveItemKind }
> = {
  "city-news": {
    id: "geneva-city-news",
    name: "City of Geneva — City News",
    url: `${BASE_URL}/RSSFeed.aspx?CID=City-News-1&ModID=1`,
    itemKind: "city-news",
  },
  traffic: {
    id: "geneva-road-construction",
    name: "City of Geneva — Road Construction",
    url: `${BASE_URL}/RSSFeed.aspx?CID=Road-Construction-17&ModID=1`,
    itemKind: "traffic",
  },
  event: {
    id: "geneva-special-events",
    name: "City of Geneva — Special Events",
    url: `${BASE_URL}/RSSFeed.aspx?CID=Geneva-Special-Events-Calendar-22&ModID=58`,
    itemKind: "event",
  },
};

type ParsedItem = {
  title: string;
  description: string;
  link: string;
  guid: string;
  publishedAt?: string;
  startAt?: string;
  endAt?: string;
  dateLabel: string;
  timeLabel: string;
  location: string;
};

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] !== "#") return named[code.toLowerCase()] ?? entity;
    const radix = code[1]?.toLowerCase() === "x" ? 16 : 10;
    const digits = radix === 16 ? code.slice(2) : code.slice(1);
    const point = Number.parseInt(digits, radix);
    return Number.isFinite(point) && point >= 0 && point <= 0x10ffff
      ? String.fromCodePoint(point)
      : entity;
  });
}

function unwrapXml(value: string): string {
  return decodeEntities(value.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1").trim());
}

function stripHtml(value: string): string {
  return decodeEntities(
    value
      .replace(/<\s*(?:br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, "\n")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function tag(xml: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i"));
  return match ? unwrapXml(match[1]) : "";
}

function firstTag(xml: string, names: string[]): string {
  for (const name of names) {
    const value = tag(xml, name);
    if (value) return value;
  }
  return "";
}

function normalizeOfficialLink(value: string, fallback: string): string {
  const candidate = stripHtml(value).trim();
  if (!candidate) return fallback;
  try {
    const url = new URL(candidate, BASE_URL);
    const hostname = url.hostname.toLowerCase();
    if (hostname !== "geneva.il.us" && hostname !== "www.geneva.il.us") return fallback;
    url.protocol = "https:";
    url.hostname = "www.geneva.il.us";
    url.hash = "";
    return url.toString();
  } catch {
    return fallback;
  }
}

function isoDate(value: string): string | undefined {
  const cleaned = stripHtml(value)
    .replace(/^(?:date|event date|published|starts?)\s*:\s*/i, "")
    .trim();
  if (!cleaned) return undefined;
  const timestamp = Date.parse(cleaned);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function lineValue(text: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lineMatch = text.match(new RegExp(`(?:^|\\n)${escaped}\\s*:\\s*([^\\n]+)`, "i"));
  if (lineMatch) return lineMatch[1].trim();
  const inlineMatch = text.match(
    new RegExp(`${escaped}\\s*:\\s*(.*?)(?=\\s+(?:Date|Time|Location|Address|Cost)\\s*:|$)`, "i"),
  );
  return inlineMatch?.[1]?.trim() ?? "";
}

function shorten(value: string, max = 280): string {
  const oneLine = value.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max - 1).trimEnd()}…`;
}

function stableId(prefix: string, value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`;
}

function parseItem(itemXml: string, feed: (typeof FEEDS)[GenevaFeedKind]): ParsedItem {
  const title = shorten(stripHtml(tag(itemXml, "title")), 180) || "Geneva update";
  const rawDescription = firstTag(itemXml, ["content:encoded", "description"]);
  const description = stripHtml(rawDescription);
  const fallbackUrl = feed.url;
  const link = normalizeOfficialLink(tag(itemXml, "link"), fallbackUrl);
  const guid = stripHtml(tag(itemXml, "guid")) || link || title;
  const publishedAt = isoDate(firstTag(itemXml, ["pubDate", "dc:date", "published"]));
  const explicitDate = stripHtml(
    firstTag(itemXml, ["calendarEvent:EventDates", "event:date", "date"]),
  );
  const dateLabel =
    lineValue(description, "Event date") ||
    lineValue(description, "Event dates") ||
    lineValue(description, "Date") ||
    explicitDate;
  const timeLabel =
    lineValue(description, "Event Time") ||
    lineValue(description, "Time") ||
    stripHtml(firstTag(itemXml, ["calendarEvent:EventTimes", "event:time", "time"]));
  const location =
    lineValue(description, "Location") ||
    lineValue(description, "Address") ||
    stripHtml(firstTag(itemXml, ["calendarEvent:Location", "event:location", "location"]));
  const explicitStart = firstTag(itemXml, [
    "event:startdate",
    "event:startDate",
    "startdate",
    "startDate",
    "dtstart",
  ]);
  const explicitEnd = firstTag(itemXml, [
    "event:enddate",
    "event:endDate",
    "enddate",
    "endDate",
    "dtend",
  ]);
  const combinedDate = dateLabel && timeLabel ? `${dateLabel} ${timeLabel.split("-")[0].trim()}` : dateLabel;

  return {
    title,
    description,
    link,
    guid,
    publishedAt,
    // CivicPlus calendar feeds sometimes use pubDate for the occurrence date.
    // Prefer explicit event metadata, but retain that documented RSS fallback.
    startAt: isoDate(explicitStart || combinedDate) || publishedAt,
    endAt: isoDate(explicitEnd),
    dateLabel,
    timeLabel,
    location,
  };
}

function statusFor(
  kind: GenevaFeedKind,
  fetchedAt: string,
  state: LiveSourceStatus["state"],
  itemCount: number,
  message?: string,
): LiveSourceStatus {
  const feed = FEEDS[kind];
  return {
    id: feed.id,
    sourceId: feed.id,
    communityId: "geneva",
    name: feed.name,
    url: feed.url,
    state,
    itemCount,
    checkedAt: fetchedAt,
    ...(message ? { message } : {}),
  };
}

export function parseGenevaRss(
  xml: string,
  kind: GenevaFeedKind,
  fetchedAt: string,
): CommunityLiveResult {
  const feed = FEEDS[kind];
  const itemXml = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map(
    (match) => match[1],
  );
  const parsed = itemXml.map((item) => parseItem(item, feed));

  if (kind === "event") {
    const cutoff = Date.parse(fetchedAt);
    const events: LiveEvent[] = parsed
      .filter((item) => {
        const start = item.startAt ? Date.parse(item.startAt) : Number.NaN;
        const end = item.endAt ? Date.parse(item.endAt) : start;
        return Number.isFinite(start) && Number.isFinite(end) && (!Number.isFinite(cutoff) || end >= cutoff - 86_400_000);
      })
      .sort((a, b) => Date.parse(a.startAt ?? "") - Date.parse(b.startAt ?? ""))
      .slice(0, 4)
      .map((item) => ({
        id: stableId("geneva-event", item.guid),
        sourceId: feed.id,
        communityId: "geneva",
        title: item.title,
        summary: shorten(item.description) || "See the official City of Geneva listing for details.",
        canonicalUrl: item.link,
        sourceName: feed.name,
        ...(item.startAt ? { startAt: item.startAt } : {}),
        ...(item.endAt ? { endAt: item.endAt } : {}),
        dateLabel: item.dateLabel || "See official listing",
        timeLabel: item.timeLabel || "See official listing",
        location: item.location || "Geneva, Illinois",
        category: "event",
        fetchedAt,
      }));
    return {
      notices: [],
      events,
      sources: [
        statusFor(
          kind,
          fetchedAt,
          itemXml.length === 0 || (itemXml.length > 0 && events.length === 0) ? "partial" : "ok",
          events.length,
          itemXml.length === 0
            ? "The feed contained no items."
            : events.length === 0
              ? "No current or future events with a parseable date were found."
              : undefined,
        ),
      ],
    };
  }

  const notices: LiveNotice[] = parsed.slice(0, 4).map((item) => ({
    id: stableId(`geneva-${kind}`, item.guid),
    sourceId: feed.id,
    communityId: "geneva",
    kind: feed.itemKind,
    title: item.title,
    summary: shorten(item.description) || "See the official City of Geneva notice for details.",
    canonicalUrl: item.link,
    sourceName: feed.name,
    ...(item.publishedAt ? { publishedAt: item.publishedAt } : {}),
    fetchedAt,
  }));

  return {
    notices,
    events: [],
    sources: [
      statusFor(
        kind,
        fetchedAt,
        itemXml.length === 0 ? "partial" : "ok",
        notices.length,
        itemXml.length === 0 ? "The feed contained no items." : undefined,
      ),
    ],
  };
}

async function fetchFeed(kind: GenevaFeedKind, fetchedAt: string): Promise<CommunityLiveResult> {
  const feed = FEEDS[kind];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(feed.url, {
      headers: {
        Accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8",
        "User-Agent": USER_AGENT,
      },
      credentials: "omit",
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const declaredSize = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredSize) && declaredSize > MAX_RESPONSE_BYTES) {
      throw new Error("Response exceeded the 1 MB limit");
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_RESPONSE_BYTES) throw new Error("Response exceeded the 1 MB limit");

    return parseGenevaRss(new TextDecoder().decode(bytes), kind, fetchedAt);
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Request timed out after 7 seconds."
        : error instanceof Error
          ? error.message
          : "Unknown source error";
    return {
      notices: [],
      events: [],
      sources: [statusFor(kind, fetchedAt, "failed", 0, message)],
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchGenevaData(): Promise<CommunityLiveResult> {
  const fetchedAt = new Date().toISOString();
  const results = await Promise.all(
    (["city-news", "traffic", "event"] as const).map((kind) => fetchFeed(kind, fetchedAt)),
  );

  const notices = results
    .flatMap((result) => result.notices)
    .sort((a, b) => Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? ""))
    .slice(0, 4);
  const events = results
    .flatMap((result) => result.events)
    .sort((a, b) => Date.parse(a.startAt ?? "") - Date.parse(b.startAt ?? ""))
    .slice(0, 4);

  return { notices, events, sources: results.flatMap((result) => result.sources) };
}
