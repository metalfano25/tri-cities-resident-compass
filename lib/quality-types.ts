import type { CommunityId } from "../app/data";
import type { LiveLifecycle } from "./live-types";

export type QualityLens =
  | "opportunity"
  | "decision"
  | "change"
  | "family"
  | "mobility"
  | "live-well"
  | "local-economy";

export type EvidenceLevel = "high" | "medium" | "low";
export type IntelligenceStatus = "confirmed" | "watch";

export type OpportunityCategory =
  | "have-a-say"
  | "save-money"
  | "win-work"
  | "family-deadlines"
  | "business-demand"
  | "property-development"
  | "volunteer-participate"
  | "mobility-access";

export type DecisionStage = "meeting" | "hearing" | "proposal" | "public-input" | "official-notice";
export type ChangeKind = "construction" | "development" | "mobility" | "service" | "public-place" | "other";

export interface IntelligenceScores {
  localRelevance: number;
  urgency: number;
  actionability: number;
  residentUpside: number;
  evidenceQuality: number;
  total: number;
}

/**
 * The common evidence envelope for every quality-of-life lens. Fields in this
 * interface must remain source-bound: `confirmedFact` contains only normalized
 * source text, while `cautiousImplication` is deterministic interpretation.
 */
export interface QualityIntelligenceItem {
  id: string;
  recordId: string;
  lens: QualityLens;
  title: string;
  communityId: CommunityId;
  sourceId: string;
  sourceName: string;
  canonicalUrl: string;
  lifecycle: LiveLifecycle;
  evidenceLevel: EvidenceLevel;
  confirmedFact: string;
  cautiousImplication: string;
  unknowns: string[];
  audience: string[];
  action: string;
  deadline?: string;
  startAt?: string;
  location?: string;
  display?: "map" | "list";
  scores: IntelligenceScores;
  status: IntelligenceStatus;
  opportunityCategory?: OpportunityCategory;
  decisionStage?: DecisionStage;
  changeKind?: ChangeKind;
}

export interface QualityOfLifeSnapshot {
  generatedAt: string;
  sourceGeneratedAt: string;
  mode: "derived";
  stale: boolean;
  communities: CommunityId[];
  opportunityCenter: QualityIntelligenceItem[];
  decisionDecoder: QualityIntelligenceItem[];
  changeMap: QualityIntelligenceItem[];
  family: QualityIntelligenceItem[];
  mobility: QualityIntelligenceItem[];
  liveWell: QualityIntelligenceItem[];
  localEconomy: QualityIntelligenceItem[];
  coverage: {
    sourceRecords: number;
    derivedItems: number;
    byCommunity: Record<CommunityId, number>;
  };
}
