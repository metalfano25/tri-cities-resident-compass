import type { CommunityId } from "../app/data";

export type LiveItemKind =
  | "city-news"
  | "traffic"
  | "service"
  | "community"
  | "meeting"
  | "event";

export interface LiveNotice {
  id: string;
  communityId: CommunityId;
  kind: LiveItemKind;
  title: string;
  summary: string;
  canonicalUrl: string;
  sourceName: string;
  publishedAt?: string;
  fetchedAt: string;
}

export interface LiveEvent {
  id: string;
  communityId: CommunityId;
  title: string;
  summary: string;
  canonicalUrl: string;
  sourceName: string;
  startAt?: string;
  endAt?: string;
  dateLabel: string;
  timeLabel: string;
  location: string;
  category: "event" | "meeting";
  fetchedAt: string;
}

export interface LiveSourceStatus {
  id: string;
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
}
