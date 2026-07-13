import { fetchBataviaData } from "../../../lib/batavia";
import { fetchGenevaData } from "../../../lib/geneva";
import { fetchStCharlesData } from "../../../lib/stcharles";
import type {
  CommunityLiveResult,
  LiveDataPayload,
  LiveEvent,
  LiveNotice,
} from "../../../lib/live-types";

export const dynamic = "force-dynamic";

const EMPTY_RESULT: CommunityLiveResult = {
  notices: [],
  events: [],
  sources: [],
};

const RECENT_NOTICE_WINDOW_MS = 21 * 86_400_000;
const UPCOMING_EVENT_WINDOW_MS = 14 * 86_400_000;

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item).toLowerCase();
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function balancedNotices(items: LiveNotice[]): LiveNotice[] {
  const now = Date.now();
  return ["geneva", "batavia", "st-charles"]
    .flatMap((communityId) =>
      items
        .filter((item) => {
          if (item.communityId !== communityId || !item.publishedAt) return false;
          const published = Date.parse(item.publishedAt);
          return Number.isFinite(published) && published >= now - RECENT_NOTICE_WINDOW_MS && published <= now + 86_400_000;
        })
        .sort(
          (left, right) =>
            Date.parse(right.publishedAt ?? right.fetchedAt) -
            Date.parse(left.publishedAt ?? left.fetchedAt),
        )
        .slice(0, 4),
    );
}

function balancedEvents(items: LiveEvent[]): LiveEvent[] {
  const now = Date.now();
  return ["geneva", "batavia", "st-charles"]
    .flatMap((communityId) =>
      items
        .filter((item) => {
          if (item.communityId !== communityId || !item.startAt) return false;
          const start = Date.parse(item.startAt);
          const end = Date.parse(item.endAt ?? item.startAt);
          return (
            Number.isFinite(start) &&
            Number.isFinite(end) &&
            end >= now - 86_400_000 &&
            start <= now + UPCOMING_EVENT_WINDOW_MS
          );
        })
        .sort(
          (left, right) =>
            Date.parse(left.startAt ?? "9999-12-31") -
            Date.parse(right.startAt ?? "9999-12-31"),
        )
        .slice(0, 6),
    );
}

export async function GET() {
  const settled = await Promise.allSettled([
    fetchGenevaData(),
    fetchBataviaData(),
    fetchStCharlesData(),
  ]);
  const results = settled.map((result) =>
    result.status === "fulfilled" ? result.value : EMPTY_RESULT,
  );
  const notices = balancedNotices(
    uniqueBy(results.flatMap((result) => result.notices), (item) => item.canonicalUrl || item.id),
  );
  const events = balancedEvents(
    uniqueBy(
      results.flatMap((result) => result.events),
      (item) => `${item.canonicalUrl}|${item.startAt ?? item.dateLabel}`,
    ),
  );
  const sources = results.flatMap((result) => result.sources);
  const anyItems = notices.length + events.length > 0;
  const allHealthy =
    settled.every((result) => result.status === "fulfilled") &&
    sources.length > 0 &&
    sources.every((source) => source.state === "ok");

  const payload: LiveDataPayload = {
    notices,
    events,
    sources,
    generatedAt: new Date().toISOString(),
    mode: allHealthy ? "live" : anyItems ? "partial" : "fallback",
  };

  return Response.json(payload, {
    status: anyItems ? 200 : 503,
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=900, stale-while-revalidate=3600",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
