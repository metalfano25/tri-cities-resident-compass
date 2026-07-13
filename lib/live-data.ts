import { fetchBataviaData } from "./batavia";
import { fetchGenevaData } from "./geneva";
import { fetchStCharlesData } from "./stcharles";
import type {
  CommunityLiveResult,
  LiveDataPayload,
  LiveEvent,
  LiveLifecycle,
  LiveNotice,
} from "./live-types";

const EMPTY_RESULT: CommunityLiveResult = { notices: [], events: [], sources: [] };
const RECENT_NOTICE_WINDOW_MS = 21 * 86_400_000;
const UPCOMING_EVENT_WINDOW_MS = 14 * 86_400_000;
const ENDING_SOON_WINDOW_MS = 3 * 86_400_000;
const DEFAULT_TIMED_EVENT_DURATION_MS = 3 * 60 * 60 * 1_000;
const MONTHS = new Map([
  ["jan", 0], ["january", 0], ["feb", 1], ["february", 1],
  ["mar", 2], ["march", 2], ["apr", 3], ["april", 3],
  ["may", 4], ["jun", 5], ["june", 5], ["jul", 6], ["july", 6],
  ["aug", 7], ["august", 7], ["sep", 8], ["sept", 8],
  ["september", 8], ["oct", 9], ["october", 9], ["nov", 10],
  ["november", 10], ["dec", 11], ["december", 11],
]);
const MONTH_PATTERN = "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";
const HIGH_RISK_NOTICE_PATTERN = /\b(?:emergency|evacuat|shelter in place|shooting|armed|police activity|missing person|fire|tornado|severe weather|flash flood|flood warning|hazmat|gas leak|contaminat|boil order|public health alert|immediate danger)\b/i;
const CANCELLED_PATTERN = /\b(?:cancelled|canceled)\b/i;
const EXPLICITLY_ENDED_PATTERN = /\b(?:expired|has ended|is over|concluded|resolved|lifted|has reopened|is reopened|service (?:has been )?restored|all clear)\b/i;

interface TextDate {
  year: number;
  month: number;
  day: number;
}

function normalizedNoticeText(item: Pick<LiveNotice, "title" | "summary">): string {
  return `${item.title} ${item.summary}`
    .replace(/\b(?:the\s+)?fourth of july\b/gi, "July 4")
    .replace(/\bindependence day\b/gi, "July 4");
}

function textDates(text: string, referenceIso: string): TextDate[] {
  const reference = new Date(referenceIso);
  const referenceYear = Number.isFinite(reference.getTime())
    ? reference.getUTCFullYear()
    : new Date().getUTCFullYear();
  const dates: TextDate[] = [];
  const pattern = new RegExp(`\\b(${MONTH_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, "gi");
  for (const match of text.matchAll(pattern)) {
    const month = MONTHS.get(match[1].toLowerCase());
    const day = Number(match[2]);
    const year = Number(match[3] || referenceYear);
    if (month === undefined || day < 1 || day > 31) continue;
    const validation = new Date(Date.UTC(year, month, day));
    if (validation.getUTCFullYear() !== year || validation.getUTCMonth() !== month || validation.getUTCDate() !== day) continue;
    dates.push({ year, month, day });
  }
  return dates;
}

function conservativeEndOfLocalDay(date: TextDate): number {
  return chicagoTimestamp({ ...date, day: date.day + 1 }, 0, 0);
}

function inferredNoticeEnd(item: LiveNotice): number | undefined {
  const text = normalizedNoticeText(item);
  if (HIGH_RISK_NOTICE_PATTERN.test(text) && !EXPLICITLY_ENDED_PATTERN.test(text)) return undefined;
  if (!/\b(?:through|until|ends?|ending|effective|on|for|closed|closure|holiday|resumes?|reopens?|scheduled|from)\b/i.test(text)) return undefined;
  const dates = textDates(text, item.publishedAt ?? item.fetchedAt);
  if (dates.length === 0) return undefined;
  const end = Math.max(...dates.map(conservativeEndOfLocalDay));
  return Number.isFinite(end) ? end : undefined;
}

function withNoticeLifecycle(item: LiveNotice, now: number): LiveNotice {
  const text = normalizedNoticeText(item);
  if (CANCELLED_PATTERN.test(text)) return { ...item, lifecycle: "cancelled" };
  const inferredEnd = inferredNoticeEnd(item);
  if (EXPLICITLY_ENDED_PATTERN.test(text) && (inferredEnd === undefined || inferredEnd < now)) {
    return { ...item, lifecycle: "expired" };
  }
  if (inferredEnd !== undefined) {
    const dates = textDates(text, item.publishedAt ?? item.fetchedAt);
    const firstDay = dates.length > 0
      ? chicagoTimestamp(dates[0], 0, 0)
      : inferredEnd;
    return {
      ...item,
      effectiveEndAt: new Date(inferredEnd).toISOString(),
      lifecycle: inferredEnd < now ? "expired" : firstDay > now ? "upcoming" : "active",
    };
  }
  // Publication recency is not evidence that a notice remains in effect.
  return { ...item, lifecycle: "unknown" };
}

function eventBoundary(value: string | undefined, endOfDay: boolean): number {
  if (!value) return Number.NaN;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return endOfDay
      ? chicagoTimestamp({ year, month: month - 1, day: day + 1 }, 0, 0)
      : chicagoTimestamp({ year, month: month - 1, day }, 0, 0);
  }
  return Date.parse(value);
}

function formatChicagoDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Chicago",
  }).format(new Date(timestamp));
}

function dateOnly(value: string): TextDate | undefined {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
}

function eventEndBoundary(item: LiveEvent, start: number): number {
  if (!item.endAt) {
    return /^\d{4}-\d{2}-\d{2}$/.test(item.startAt ?? "")
      ? eventBoundary(item.startAt, true)
      : start + DEFAULT_TIMED_EVENT_DURATION_MS;
  }
  const date = dateOnly(item.endAt);
  if (!date) return eventBoundary(item.endAt, false);
  return item.endAtExclusive
    ? chicagoTimestamp(date, 0, 0)
    : chicagoTimestamp({ ...date, day: date.day + 1 }, 0, 0);
}

function eventEndLabel(item: LiveEvent, end: number): string | undefined {
  if (!item.endAt) return undefined;
  const date = dateOnly(item.endAt);
  if (!date) return formatChicagoDate(end);
  const labelDate = item.endAtExclusive
    ? new Date(Date.UTC(date.year, date.month, date.day - 1, 12))
    : new Date(Date.UTC(date.year, date.month, date.day, 12));
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  }).format(labelDate);
}

function withEventLifecycle(item: LiveEvent, now: number): LiveEvent {
  const text = `${item.title} ${item.summary}`;
  if (CANCELLED_PATTERN.test(text)) return { ...item, lifecycle: "cancelled" };
  const start = eventBoundary(item.startAt, false);
  const end = eventEndBoundary(item, start);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { ...item, lifecycle: "unknown" };
  if (end < now) return { ...item, lifecycle: "expired" };
  if (start > now) return { ...item, lifecycle: "upcoming" };
  const lifecycle: LiveLifecycle = end - now <= ENDING_SOON_WINDOW_MS ? "ending-soon" : "active";
  const endLabel = eventEndLabel(item, end);
  const timingLabel = endLabel
    ? `Ongoing through ${endLabel}`
    : "Ongoing now";
  return { ...item, lifecycle, timingLabel };
}

function chicagoTimestamp(date: TextDate, hour: number, minute: number): number {
  const utcGuess = Date.UTC(date.year, date.month, date.day, hour, minute);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(utcGuess));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const represented = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute));
  const first = utcGuess - (represented - utcGuess);
  const adjustedParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(first));
  const adjusted = Object.fromEntries(adjustedParts.map((part) => [part.type, part.value]));
  const adjustedRepresentation = Date.UTC(Number(adjusted.year), Number(adjusted.month) - 1, Number(adjusted.day), Number(adjusted.hour), Number(adjusted.minute));
  return utcGuess - (adjustedRepresentation - first);
}

function meetingFromNotice(item: LiveNotice, now: number): LiveEvent | undefined {
  if (item.kind !== "meeting") return undefined;
  const text = normalizedNoticeText(item);
  if (/\b(?:cancelled|canceled|postponed)\b/i.test(text)) return undefined;
  const dates = textDates(text, item.publishedAt ?? item.fetchedAt);
  const time = text.match(/(?:\bat\s+|@\s*|(?:,|[-–—])\s*)(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/i);
  if (dates.length === 0 || !time) return undefined;
  let date = dates[0];
  let hour = Number(time[1]);
  const minute = Number(time[2] || 0);
  const meridiem = time[3].toLowerCase().startsWith("p") ? "pm" : "am";
  if (hour < 1 || hour > 12 || minute > 59) return undefined;
  if (meridiem === "pm" && hour !== 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  let start = chicagoTimestamp(date, hour, minute);
  if (start < now && !new RegExp(`\\b${date.year}\\b`).test(text)) {
    const nextYear = { ...date, year: date.year + 1 };
    const nextStart = chicagoTimestamp(nextYear, hour, minute);
    if (nextStart - now <= 180 * 86_400_000) {
      date = nextYear;
      start = nextStart;
    }
  }
  if (start < now || start > now + 365 * 86_400_000) return undefined;
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago",
  }).format(new Date(start));
  const timeLabel = new Intl.DateTimeFormat("en-US", {
    hour: "numeric", minute: "2-digit", timeZone: "America/Chicago",
  }).format(new Date(start));
  return {
    id: `${item.id}-meeting`,
    sourceId: item.sourceId,
    communityId: item.communityId,
    title: item.title,
    summary: item.summary,
    canonicalUrl: item.canonicalUrl,
    sourceName: item.sourceName,
    startAt: new Date(start).toISOString(),
    dateLabel,
    timeLabel,
    location: "See official meeting notice",
    category: "meeting",
    lifecycle: "upcoming",
    fetchedAt: item.fetchedAt,
  };
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item).toLowerCase();
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function balancedNotices(items: LiveNotice[], now: number): LiveNotice[] {
  return ["geneva", "batavia", "st-charles"].flatMap((communityId) =>
    items
      .map((item) => withNoticeLifecycle(item, now))
      .filter((item) => {
        if (item.communityId !== communityId || !item.publishedAt || item.lifecycle === "expired" || item.lifecycle === "cancelled") return false;
        const published = Date.parse(item.publishedAt);
        return Number.isFinite(published) && published >= now - RECENT_NOTICE_WINDOW_MS && published <= now + 86_400_000;
      })
      .sort((left, right) => Date.parse(right.publishedAt ?? right.fetchedAt) - Date.parse(left.publishedAt ?? left.fetchedAt))
      .slice(0, 4),
  );
}

function balancedEvents(items: LiveEvent[], now: number): LiveEvent[] {
  return ["geneva", "batavia", "st-charles"].flatMap((communityId) =>
    items
      .map((item) => withEventLifecycle(item, now))
      .filter((item) => {
        if (item.communityId !== communityId || !item.startAt || item.lifecycle === "expired" || item.lifecycle === "cancelled") return false;
        const start = eventBoundary(item.startAt, false);
        const end = eventEndBoundary(item, start);
        return Number.isFinite(start) && Number.isFinite(end) && end >= now && start <= now + UPCOMING_EVENT_WINDOW_MS;
      })
      .sort((left, right) => Date.parse(left.startAt ?? "9999-12-31") - Date.parse(right.startAt ?? "9999-12-31"))
      .slice(0, 6),
  );
}

export async function getLiveDataPayload(): Promise<LiveDataPayload> {
  const settled = await Promise.allSettled([
    fetchGenevaData(),
    fetchBataviaData(),
    fetchStCharlesData(),
  ]);
  const results = settled.map((result) => result.status === "fulfilled" ? result.value : EMPTY_RESULT);
  const now = Date.now();
  const rawNotices = uniqueBy(results.flatMap((result) => result.notices), (item) => item.canonicalUrl || item.id);
  const normalizedMeetings = rawNotices.flatMap((item) => {
    const meeting = meetingFromNotice(item, now);
    return meeting ? [meeting] : [];
  });
  const normalizedMeetingIds = new Set(normalizedMeetings.map((item) => item.id.replace(/-meeting$/, "")));
  const notices = balancedNotices(rawNotices.filter((item) => !normalizedMeetingIds.has(item.id)), now);
  const events = balancedEvents(uniqueBy([
    ...results.flatMap((result) => result.events),
    ...normalizedMeetings,
  ], (item) => `${item.canonicalUrl}|${item.startAt ?? item.dateLabel}`), now);
  const sources = results.flatMap((result) => result.sources);
  const anyItems = notices.length + events.length > 0;
  const allHealthy = settled.every((result) => result.status === "fulfilled") && sources.length > 0 && sources.every((source) => source.state === "ok");

  return {
    notices,
    events,
    sources,
    generatedAt: new Date().toISOString(),
    mode: allHealthy ? "live" : anyItems ? "partial" : "fallback",
  };
}
