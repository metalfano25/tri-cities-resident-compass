import type {
  CommunityLiveResult,
  LiveEvent,
  LiveItemKind,
  LiveNotice,
  LiveSourceStatus,
} from "./live-types";

const EVENTS_URL = "https://www.stcharlesil.gov/News-Events/City-Events";
const NEWS_URL = "https://www.stcharlesil.gov/News-Events/City-News-Alerts";
const EVENTS_SOURCE_ID = "st-charles-events";
const NEWS_SOURCE_ID = "st-charles-news";
const SOURCE_NAME = "City of St. Charles";
const USER_AGENT =
  "TriCitiesResidentCompass/1.0 (+https://github.com/metalfano25/tri-cities-resident-compass; official-public-data-reader)";
const TIMEOUT_MS = 7_000;
const MAX_HTML_BYTES = 1_500_000;

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    hellip: "…",
    lt: "<",
    nbsp: " ",
    ndash: "–",
    quot: '"',
    rsquo: "’",
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] === "#") {
      const hexadecimal = code[1]?.toLowerCase() === "x";
      const parsed = Number.parseInt(code.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : entity;
    }
    return named[code.toLowerCase()] ?? entity;
  });
}

function text(value: string | undefined): string {
  return decodeEntities(
    (value ?? "")
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function excerpt(value: string, maximum = 320): string {
  if (value.length <= maximum) return value;
  const shortened = value.slice(0, maximum - 1).replace(/\s+\S*$/, "").trimEnd();
  return `${shortened}…`;
}

function capture(source: string, pattern: RegExp): string {
  return pattern.exec(source)?.[1] ?? "";
}

function itemBlocks(html: string): string[] {
  return Array.from(
    html.matchAll(
      /<div\b[^>]*class=["'][^"']*\blist-item-container\b[^"']*["'][^>]*>([\s\S]*?<\/article>)\s*<\/div>/gi,
    ),
    (match) => match[1],
  );
}

function canonicalUrl(block: string): string {
  const href = decodeEntities(
    capture(block, /<article\b[^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']+)["']/i),
  ).trim();
  if (!href) return "";
  try {
    const url = new URL(href, "https://www.stcharlesil.gov");
    if (
      url.protocol !== "https:" ||
      !["stcharlesil.gov", "www.stcharlesil.gov"].includes(url.hostname.toLowerCase())
    ) {
      return "";
    }
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function identifier(url: string, suffix?: string): string {
  let base = url;
  try {
    base = new URL(url).pathname;
  } catch {
    // Keep the supplied value as a deterministic fallback.
  }
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `st-charles-${slug || "item"}${suffix ? `-${suffix}` : ""}`;
}

function titleFrom(block: string): string {
  return text(capture(block, /<h2\b[^>]*class=["'][^"']*\blist-item-title\b[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i));
}

function classText(block: string, className: string): string {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const paragraph = capture(
    block,
    new RegExp(
      `<p\\b[^>]*class=["'][^"']*\\b${escaped}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/p>`,
      "i",
    ),
  );
  if (paragraph) return text(paragraph);
  return text(
    capture(
      block,
      new RegExp(
        `<span\\b[^>]*class=["'][^"']*\\b${escaped}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/span>`,
        "i",
      ),
    ),
  );
}

function monthNumber(month: string): string | undefined {
  const index = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ].indexOf(month.slice(0, 3).toLowerCase());
  return index < 0 ? undefined : String(index + 1).padStart(2, "0");
}

export function parseStCharlesEvents(html: string, fetchedAt: string): LiveEvent[] {
  const parsed: LiveEvent[] = [];
  const referenceTime = Date.parse(fetchedAt);

  for (const block of itemBlocks(html)) {
    const canonical = canonicalUrl(block);
    const title = titleFrom(block);
    const day = text(capture(block, /class=["'][^"']*\bpart-date\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i));
    const month = text(capture(block, /class=["'][^"']*\bpart-month\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i));
    const year = text(capture(block, /class=["'][^"']*\bpart-year\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i));
    const monthValue = monthNumber(month);
    if (!canonical || !title || !/^\d{1,2}$/.test(day) || !/^\d{4}$/.test(year) || !monthValue) {
      continue;
    }

    const date = `${year}-${monthValue}-${day.padStart(2, "0")}`;
    const occurrenceTime = Date.parse(`${date}T23:59:59-05:00`);
    if (Number.isFinite(referenceTime) && occurrenceTime < referenceTime - 86_400_000) {
      continue;
    }
    const categoryText = classText(block, "tagged-as-list");
    const meeting = /\bmeetings?\b/i.test(categoryText);
    const summary = excerpt(classText(block, "list-item-block-desc"));
    const location = classText(block, "list-item-address");

    parsed.push({
      id: identifier(canonical, date),
      sourceId: EVENTS_SOURCE_ID,
      communityId: "st-charles",
      title,
      summary,
      canonicalUrl: canonical,
      sourceName: SOURCE_NAME,
      startAt: date,
      dateLabel: `${month.slice(0, 3)} ${Number(day)}, ${year}`,
      timeLabel: "See official event details",
      location: location || "St. Charles, IL",
      category: meeting ? "meeting" : "event",
      fetchedAt,
    });
  }

  return parsed;
}

function noticeKind(title: string, summary: string): LiveItemKind {
  const combined = `${title} ${summary}`;
  if (/\b(event|festival|parade|concert|newsletter|city news)\b/i.test(combined)) return "community";
  if (/\b(traffic|road closure|street closure|lane closure|parking restriction|closed|detour)\b/i.test(combined)) {
    return "traffic";
  }
  if (/\b(utility|utilities|outage|water|sewer|refuse|recycling|hydrant|service)\b/i.test(combined)) {
    return "service";
  }
  return "city-news";
}

function newsSummary(block: string): string {
  for (const match of block.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi)) {
    const attributes = match[1];
    if (/class=["'][^"']*(?:published-on|tagged-as-list|oc-thumbnail-image)/i.test(attributes)) continue;
    const candidate = text(match[2]);
    if (candidate) return excerpt(candidate);
  }
  return "Read the latest official update from the City of St. Charles.";
}

export function parseStCharlesNews(html: string, fetchedAt: string): LiveNotice[] {
  const parsed: LiveNotice[] = [];

  for (const block of itemBlocks(html)) {
    const canonical = canonicalUrl(block);
    const title = titleFrom(block);
    if (!canonical || !title) continue;

    const summary = newsSummary(block);
    const publishedLabel = classText(block, "published-on").replace(/^Published on\s+/i, "");
    const timestamp = Date.parse(publishedLabel);

    parsed.push({
      id: identifier(canonical),
      sourceId: NEWS_SOURCE_ID,
      communityId: "st-charles",
      kind: noticeKind(title, summary),
      title,
      summary,
      canonicalUrl: canonical,
      sourceName: SOURCE_NAME,
      publishedAt: Number.isNaN(timestamp) ? undefined : new Date(timestamp).toISOString(),
      fetchedAt,
    });
  }

  return parsed;
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": USER_AGENT,
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_HTML_BYTES) {
      throw new Error("response exceeded the configured size limit");
    }

    const html = await response.text();
    if (new TextEncoder().encode(html).byteLength > MAX_HTML_BYTES) {
      throw new Error("response exceeded the configured size limit");
    }
    return html;
  } finally {
    clearTimeout(timeout);
  }
}

function sourceStatus(
  id: string,
  name: string,
  url: string,
  checkedAt: string,
  result: PromiseSettledResult<LiveNotice[] | LiveEvent[]>,
): LiveSourceStatus {
  if (result.status === "rejected") {
    const reason = result.reason instanceof Error ? result.reason.message : "source request failed";
    return {
      id,
      sourceId: id,
      communityId: "st-charles",
      name,
      url,
      state: "failed",
      itemCount: 0,
      checkedAt,
      message: reason,
    };
  }

  return {
    id,
    sourceId: id,
    communityId: "st-charles",
    name,
    url,
    state: result.value.length > 0 ? "ok" : "partial",
    itemCount: result.value.length,
    checkedAt,
    message: result.value.length > 0 ? undefined : "The source responded but no usable items were found.",
  };
}

export async function fetchStCharlesData(): Promise<CommunityLiveResult> {
  const fetchedAt = new Date().toISOString();
  const [eventsResult, newsResult] = await Promise.allSettled([
    fetchHtml(EVENTS_URL).then((html) => parseStCharlesEvents(html, fetchedAt)),
    fetchHtml(NEWS_URL).then((html) => parseStCharlesNews(html, fetchedAt)),
  ]);

  const events = eventsResult.status === "fulfilled" ? eventsResult.value.slice(0, 6) : [];
  const notices = newsResult.status === "fulfilled" ? newsResult.value.slice(0, 4) : [];

  return {
    notices,
    events,
    sources: [
      sourceStatus(EVENTS_SOURCE_ID, "St. Charles City Events", EVENTS_URL, fetchedAt, eventsResult),
      sourceStatus(NEWS_SOURCE_ID, "St. Charles City News & Alerts", NEWS_URL, fetchedAt, newsResult),
    ],
  };
}
