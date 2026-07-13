import type { CommunityId } from "../app/data";

export type LiveItemKind =
  | "city-news"
  | "traffic"
  | "service"
  | "community"
  | "meeting"
  | "event";

export type LiveLifecycle =
  | "upcoming"
  | "active"
  | "ending-soon"
  | "expired"
  | "cancelled"
  | "historical"
  | "unknown";

export interface LiveNotice {
  id: string;
  sourceId: string;
  communityId: CommunityId;
  kind: LiveItemKind;
  title: string;
  summary: string;
  canonicalUrl: string;
  sourceName: string;
  publishedAt?: string;
  effectiveEndAt?: string;
  lifecycle?: LiveLifecycle;
  fetchedAt: string;
}

export interface LiveEvent {
  id: string;
  sourceId: string;
  communityId: CommunityId;
  title: string;
  summary: string;
  canonicalUrl: string;
  sourceName: string;
  startAt?: string;
  endAt?: string;
  endAtExclusive?: boolean;
  dateLabel: string;
  timeLabel: string;
  location: string;
  category: "event" | "meeting";
  lifecycle?: LiveLifecycle;
  timingLabel?: string;
  fetchedAt: string;
}

export interface LiveSourceStatus {
  id: string;
  sourceId: string;
  communityId: CommunityId;
  name: string;
  url: string;
  state: "ok" | "partial" | "failed";
  itemCount: number;
  checkedAt: string;
  message?: string;
}

export interface CommunityLiveResult {
  notices: LiveNotice[];
  events: LiveEvent[];
  sources: LiveSourceStatus[];
}

export interface LiveDataPayload extends CommunityLiveResult {
  generatedAt: string;
  mode: "live" | "partial" | "fallback";
  cache?: {
    storedAt: string;
    lastSuccessfulAt: string | null;
    ageSeconds: number;
    staleAfterSeconds: number;
    stale: boolean;
    sources: Array<{
      sourceId: string;
      state: LiveSourceStatus["state"];
      lastAttemptAt: string;
      lastSuccessfulAt: string | null;
      stale: boolean;
    }>;
  };
}
