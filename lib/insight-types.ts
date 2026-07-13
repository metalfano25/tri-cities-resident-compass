import type { CommunityId } from "../app/data";

export type InsightScope = "all" | CommunityId;
export type InsightConfidence = "high" | "medium" | "low";
export type InsightLevel = "routine" | "planning" | "disruption";

export interface ResidentInsight {
  itemId: string;
  communityId: CommunityId;
  title: string;
  impact: string;
  affected: string;
  timing: string;
  action: string;
  confirmedFact: string;
  inference: string;
  unknown: string;
  confidence: InsightConfidence;
  impactLevel: InsightLevel;
  sourceName: string;
  sourceUrl: string;
}

export interface InsightPayload {
  scope: InsightScope;
  mode: "ai" | "rules";
  model: string | null;
  generatedAt: string;
  sourceFingerprint: string;
  insights: ResidentInsight[];
  disclaimer: string;
}
