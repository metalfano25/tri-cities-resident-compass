import type {
  CommunityLiveResult,
  LiveEvent,
  LiveItemKind,
  LiveNotice,
  LiveSourceStatus,
} from "./live-types";

const COMMUNITY_ID = "batavia" as const;
const USER_AGENT =
  "Tri-Cities-Resident-Compass/1.0 (+https://github.com/metalfano25/tri-cities-resident-compass; public-community-data)";
const MAX_RESPONSE_BYTES = 2_000_000;
const REQUEST_TIMEOUT_MS = 7_000;
const DEFAULT_TIMED_EVENT_DURATION_MS = 3 * 60 * 60 * 1_000;

const CITY_EVENTS = {
  id: "batavia-city-events",
  sourceName: "City of Batavia Events",
  sourceUrl:
    "https://thrillshare-cmsv2.services.thrillshare.com/api/v4/o/26914/cms/events/generate_ical?filter_ids=&section_ids=",
};

const PARK_EVENTS = {
  id: "batavia-park-events",
  sourceName: "Batavia Park District",
  sourceUrl: "https://bataviaparks.org/events/list/?ical=1",
};

const CITY_LIVE_FEED = {
  id: "batavia-city-live-feed",
  sourceName: "City of Batavia Live Feed",
  sourceUrl: "https://www.bataviail.gov/live-feed/",
};

const OFFICIAL_LINK_HOSTS = new Set([
  "bataviail.gov",
  "www.bataviail.gov",
  "bataviaparks.org",
  "www.bataviaparks.org",
  "thrillshare-cmsv2.services.thrillshare.com",
]);

export interface IcsSourceMetadata {
  id?: string;
  sourceName: string;
  sourceUrl: string;
}

interface IcsDate {
  iso?: string;
  timestamp?: number;
  allDay: boolean;
}

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

function decodeHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&apos;|&#39;|&#x27;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([\da-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/\s+/g, " ")
    .trim();
}

function cleanText(value: string, maximum = 280): string {
  const cleaned = decodeHtml(value).replace(/^[-–—|\s]+|[-–—|\s]+$/g, "");
  if (cleaned.length <= maximum) return cleaned;
  return `${cleaned.slice(0, maximum - 1).trimEnd()}…`;
}

function unescapeIcs(value: string): string {
  return value
    .replace(/\\[nN]/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function timezoneOffsetMs(date: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const represented = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second),
    );
    return represented - date.getTime();
  } catch {
    return 0;
  }
}

function parseIcsDate(rawValue: string, parameters: string): IcsDate {
  const value = rawValue.trim();
  if (/^\d{8}$/.test(value) || /VALUE=DATE/i.test(parameters)) {
    const year = value.slice(0, 4);
    const month = value.slice(4, 6);
    const day = value.slice(6, 8);
    const iso = `${year}-${month}-${day}`;
    return { iso, timestamp: Date.parse(`${iso}T00:00:00Z`), allDay: true };
  }

  const match = value.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/,
  );
  if (!match) return { allDay: false };

  const [, year, month, day, hour, minute, second = "00", utcMarker] = match;
  const utcGuess = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  let timestamp = utcGuess;
  if (!utcMarker) {
    const zone = parameters.match(/TZID=(?:"([^"]+)"|([^;:]+))/i)?.slice(1).find(Boolean);
    const timeZone = zone || "America/Chicago";
    timestamp = utcGuess - timezoneOffsetMs(new Date(utcGuess), timeZone);
    timestamp = utcGuess - timezoneOffsetMs(new Date(timestamp), timeZone);
  }
  return {
    iso: new Date(timestamp).toISOString(),
    timestamp,
    allDay: false,
  };
}

function chicagoMidnight(isoDate: string, dayOffset = 0): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return undefined;
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  const compact = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}T000000`;
  return parseIcsDate(compact, "TZID=America/Chicago").timestamp;
}

function eventDateLabels(start: IcsDate): { dateLabel: string; timeLabel: string } {
  if (!start.iso || start.timestamp === undefined) {
    return { dateLabel: "See source", timeLabel: "See source" };
  }
  const date = new Date(start.timestamp);
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: start.allDay ? "UTC" : "America/Chicago",
  }).format(date);
  const timeLabel = start.allDay
    ? "All day"
    : new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/Chicago",
      }).format(date);
  return { dateLabel, timeLabel };
}

/** Parse a public RFC 5545 calendar into normalized Batavia events. */
export function parseIcsEvents(
  text: string,
  source: IcsSourceMetadata,
  fetchedAt: string,
): LiveEvent[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const blocks = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/gi) ?? [];
  const referenceTime = Number.isFinite(Date.parse(fetchedAt))
    ? Date.parse(fetchedAt)
    : Date.now();

  const parsed = blocks.flatMap((block): LiveEvent[] => {
    const properties = new Map<string, Array<{ parameters: string; value: string }>>();
    for (const line of block.split(/\r?\n/)) {
      const separator = line.indexOf(":");
      if (separator < 1) continue;
      const left = line.slice(0, separator);
      const semicolon = left.indexOf(";");
      const name = (semicolon < 0 ? left : left.slice(0, semicolon)).toUpperCase();
      const parameters = semicolon < 0 ? "" : left.slice(semicolon + 1);
      const entries = properties.get(name) ?? [];
      entries.push({ parameters, value: line.slice(separator + 1) });
      properties.set(name, entries);
    }

    const first = (name: string) => properties.get(name)?.[0];
    const summary = cleanText(unescapeIcs(first("SUMMARY")?.value ?? ""), 140);
    if (!summary) return [];
    const startEntry = first("DTSTART");
    if (!startEntry) return [];
    const start = parseIcsDate(startEntry.value, startEntry.parameters);
    const endEntry = first("DTEND");
    const end = endEntry
      ? parseIcsDate(endEntry.value, endEntry.parameters)
      : { allDay: start.allDay };
    const futureBoundary = end.iso && end.allDay
      ? chicagoMidnight(end.iso)
      : end.timestamp ?? (
          start.iso && start.allDay
            ? chicagoMidnight(start.iso, 1)
            : start.timestamp === undefined
              ? undefined
              : start.timestamp + DEFAULT_TIMED_EVENT_DURATION_MS
        );
    if (futureBoundary === undefined || futureBoundary < referenceTime - 60_000) return [];

    const description = cleanText(unescapeIcs(first("DESCRIPTION")?.value ?? ""));
    const location = cleanText(unescapeIcs(first("LOCATION")?.value ?? ""), 120);
    const suppliedUrl = unescapeIcs(first("URL")?.value ?? "");
    let canonicalUrl = source.sourceUrl;
    if (/^https:\/\//i.test(suppliedUrl)) {
      try {
        const candidate = new URL(suppliedUrl);
        if (OFFICIAL_LINK_HOSTS.has(candidate.hostname.toLowerCase())) {
          candidate.hash = "";
          canonicalUrl = candidate.toString();
        }
      } catch {
        // Fall back to the configured official feed URL.
      }
    }
    const uid = unescapeIcs(first("UID")?.value ?? "");
    const labels = eventDateLabels(start);
    const category = /\b(meeting|council|committee|commission|board)\b/i.test(summary)
      ? "meeting"
      : "event";

    return [
      {
        id: `${source.id ?? "batavia-ics"}-${hash(uid || `${summary}|${start.iso}`)}`,
        sourceId: source.id ?? "batavia-ics",
        communityId: COMMUNITY_ID,
        title: summary,
        summary: description || `See the official listing for ${summary}.`,
        canonicalUrl,
        sourceName: source.sourceName,
        startAt: start.iso,
        endAt: end.iso,
        endAtExclusive: Boolean(endEntry && start.allDay && end.allDay),
        dateLabel: labels.dateLabel,
        timeLabel: labels.timeLabel,
        location: location || "See official listing",
        category,
        fetchedAt,
      },
    ];
  });

  return parsed
    .sort((left, right) => Date.parse(left.startAt ?? "") - Date.parse(right.startAt ?? ""))
    .filter(
      (event, index, events) =>
        events.findIndex((candidate) => candidate.id === event.id) === index,
    )
    .slice(0, 4);
}

function noticeKind(text: string): LiveItemKind {
  if (/\b(meeting|council|committee|commission|agenda)\b/i.test(text)) {
    return "meeting";
  }
  if (/\b(traffic|road|street|lane|bridge|detour|construction)\b/i.test(text)) {
    return "traffic";
  }
  if (/\b(refuse|recycl|collection|utility|water|power|electric|office|service)\b/i.test(text)) {
    return "service";
  }
  return "city-news";
}

function usefulNotice(text: string): boolean {
  return /\b(traffic|road|street|lane|bridge|closure|closed|detour|construction|refuse|recycl|collection|utility|water|power|electric|outage|office|service|parking|maintenance|meeting|council|committee|commission|agenda|cooling center|warming center)\b/i.test(
    text,
  );
}

function titleFromNotice(text: string): string {
  const firstLine = text.split(/(?:\.|!|\?|\n)\s+/)[0]?.trim() ?? text;
  return cleanText(firstLine, 105) || "City of Batavia update";
}

/** Extract useful resident notices from the public, server-rendered City live feed. */
export function parseBataviaLiveFeedHtml(html: string, fetchedAt: string): LiveNotice[] {
  const hydrationCandidates: LiveNotice[] = [];
  const hydrationPattern = /[,}](\d{6,}),"((?:\\.|[^"\\]){35,})"[\s\S]{0,1200}?"(\d{4}-\d{2}-\d{2}T[^"\\]+)"/g;
  const hydrationSeen = new Set<string>();
  for (const match of html.matchAll(hydrationPattern)) {
    const [, id, encodedContent, rawPublishedAt] = match;
    if (hydrationSeen.has(id)) continue;
    let content = encodedContent;
    try {
      content = JSON.parse(`"${encodedContent}"`) as string;
    } catch {
      // The DOM fallback below can still recover items if hydration changes.
    }
    const noticeText = cleanText(content, 900);
    if (noticeText.length < 35 || !usefulNotice(noticeText)) continue;
    const publishedAt = Number.isFinite(Date.parse(rawPublishedAt))
      ? new Date(rawPublishedAt).toISOString()
      : undefined;
    hydrationSeen.add(id);
    hydrationCandidates.push({
      id: `batavia-live-${id}`,
      sourceId: CITY_LIVE_FEED.id,
      communityId: COMMUNITY_ID,
      kind: noticeKind(noticeText),
      title: titleFromNotice(noticeText),
      summary: cleanText(noticeText, 360),
      canonicalUrl: `https://www.bataviail.gov/live_feeds/${id}`,
      sourceName: CITY_LIVE_FEED.sourceName,
      publishedAt,
      fetchedAt,
    });
  }

  if (hydrationCandidates.length > 0) {
    return hydrationCandidates
      .sort(
        (left, right) =>
          Date.parse(right.publishedAt ?? right.fetchedAt) -
          Date.parse(left.publishedAt ?? left.fetchedAt),
      )
      .slice(0, 4);
  }

  const withoutNoise = html
    .replace(/<(script|style|svg|nav|footer|header)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ");
  const linkMatches = [
    ...withoutNoise.matchAll(/href=["'](?:https?:\/\/www\.bataviail\.gov)?\/live_feeds\/(\d+)[^"']*["']/gi),
  ];
  const candidates: LiveNotice[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < linkMatches.length; index += 1) {
    const match = linkMatches[index];
    const id = match[1];
    if (seen.has(id) || match.index === undefined) continue;
    const previous = index > 0 ? (linkMatches[index - 1].index ?? 0) : 0;
    const next = linkMatches[index + 1]?.index ?? withoutNoise.length;
    const start = Math.max(previous, match.index - 700);
    const end = Math.min(next, match.index + 4_500);
    let text = cleanText(withoutNoise.slice(start, end), 900);
    text = text
      .replace(/^(?:image\s*:?\s*)+/i, "")
      .replace(/\b(?:read more|view image)\b.*$/i, "")
      .trim();
    if (text.length < 35 || !usefulNotice(text)) continue;

    const timeTag = withoutNoise
      .slice(start, end)
      .match(/<time\b[^>]*datetime=["']([^"']+)["']/i)?.[1];
    const publishedAt = timeTag && Number.isFinite(Date.parse(timeTag))
      ? new Date(timeTag).toISOString()
      : undefined;
    seen.add(id);
    candidates.push({
      id: `batavia-live-${id}`,
      sourceId: CITY_LIVE_FEED.id,
      communityId: COMMUNITY_ID,
      kind: noticeKind(text),
      title: titleFromNotice(text),
      summary: cleanText(text, 360),
      canonicalUrl: `https://www.bataviail.gov/live_feeds/${id}`,
      sourceName: CITY_LIVE_FEED.sourceName,
      publishedAt,
      fetchedAt,
    });
  }

  return candidates
    .filter(
      (notice, index, notices) =>
        notices.findIndex(
          (candidate) => candidate.summary.toLowerCase() === notice.summary.toLowerCase(),
        ) === index,
    )
    .slice(0, 4);
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: "text/calendar,text/html;q=0.9,*/*;q=0.5",
      "User-Agent": USER_AGENT,
    },
    redirect: "follow",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const declaredSize = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredSize) && declaredSize > MAX_RESPONSE_BYTES) {
    throw new Error("Response exceeded size limit");
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) throw new Error("Response exceeded size limit");
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

function sourceStatus(
  source: { id: string; sourceName: string; sourceUrl: string },
  checkedAt: string,
  state: LiveSourceStatus["state"],
  itemCount: number,
  message?: string,
): LiveSourceStatus {
  return {
    id: source.id,
    sourceId: source.id,
    communityId: COMMUNITY_ID,
    name: source.sourceName,
    url: source.sourceUrl,
    state,
    itemCount,
    checkedAt,
    ...(message ? { message } : {}),
  };
}

function safeMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "TimeoutError") return "Request timed out";
  if (error instanceof Error) return cleanText(error.message, 120);
  return "Source could not be loaded";
}

function calendarStatus(text: string, itemCount: number): Pick<LiveSourceStatus, "state" | "message"> {
  const recognizedCalendar = /BEGIN:VCALENDAR\b/i.test(text) && /END:VCALENDAR\b/i.test(text);
  if (!recognizedCalendar) {
    return { state: "partial", message: "Calendar response format was not recognized" };
  }
  return itemCount > 0
    ? { state: "ok" }
    : { state: "ok", message: "Source loaded successfully; no upcoming events" };
}

/** Fetch all currently supported official Batavia sources independently. */
export async function fetchBataviaData(): Promise<CommunityLiveResult> {
  const fetchedAt = new Date().toISOString();
  const events: LiveEvent[] = [];
  const notices: LiveNotice[] = [];
  const sources: LiveSourceStatus[] = [];

  // Only one request is made to the Park District host, honoring its crawl-delay
  // without introducing a needless delay between requests to unrelated hosts.
  const results = await Promise.allSettled([
    fetchText(CITY_EVENTS.sourceUrl),
    fetchText(PARK_EVENTS.sourceUrl),
    fetchText(CITY_LIVE_FEED.sourceUrl),
  ]);

  const cityEventsResult = results[0];
  if (cityEventsResult.status === "fulfilled") {
    const items = parseIcsEvents(cityEventsResult.value, CITY_EVENTS, fetchedAt);
    const status = calendarStatus(cityEventsResult.value, items.length);
    events.push(...items);
    sources.push(
      sourceStatus(
        CITY_EVENTS,
        fetchedAt,
        status.state,
        items.length,
        status.message,
      ),
    );
  } else {
    sources.push(sourceStatus(CITY_EVENTS, fetchedAt, "failed", 0, safeMessage(cityEventsResult.reason)));
  }

  const parkEventsResult = results[1];
  if (parkEventsResult.status === "fulfilled") {
    const items = parseIcsEvents(parkEventsResult.value, PARK_EVENTS, fetchedAt);
    const status = calendarStatus(parkEventsResult.value, items.length);
    events.push(...items);
    sources.push(
      sourceStatus(
        PARK_EVENTS,
        fetchedAt,
        status.state,
        items.length,
        status.message,
      ),
    );
  } else {
    sources.push(sourceStatus(PARK_EVENTS, fetchedAt, "failed", 0, safeMessage(parkEventsResult.reason)));
  }

  const liveFeedResult = results[2];
  if (liveFeedResult.status === "fulfilled") {
    const items = parseBataviaLiveFeedHtml(liveFeedResult.value, fetchedAt);
    notices.push(...items);
    sources.push(
      sourceStatus(
        CITY_LIVE_FEED,
        fetchedAt,
        items.length > 0 ? "ok" : "partial",
        items.length,
        items.length > 0 ? undefined : "Feed loaded but no current service notices were identified",
      ),
    );
  } else {
    sources.push(sourceStatus(CITY_LIVE_FEED, fetchedAt, "failed", 0, safeMessage(liveFeedResult.reason)));
  }

  return { notices, events, sources };
}
