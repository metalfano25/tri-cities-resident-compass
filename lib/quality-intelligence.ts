import type { CommunityId } from "../app/data";
import type { LiveDataPayload, LiveEvent, LiveLifecycle, LiveNotice } from "./live-types";
import type {
  ChangeKind,
  DecisionStage,
  EvidenceLevel,
  IntelligenceScores,
  OpportunityCategory,
  QualityIntelligenceItem,
  QualityLens,
  QualityOfLifeSnapshot,
} from "./quality-types";

type SourceItem = LiveNotice | LiveEvent;

const CURRENT_LIFECYCLES = new Set<LiveLifecycle>(["upcoming", "active", "ending-soon", "unknown"]);
const HIGH_RISK_PATTERN = /\b(?:emergency|evacuat\w*|shelter in place|shooting|shots fired|armed|missing person|amber alert|tornado|severe weather|flash flood|flood warning|hazmat|gas leak|contaminat\w*|boil (?:water )?order|public health alert|immediate danger|lockdown)\b/i;
const FAMILY_PATTERN = /\b(?:family|families|child(?:ren)?|youth|teen|school|student|camp|enroll(?:ment)?|registration|library|storytime|meal program|park district)\b/i;
const MOBILITY_PATTERN = /\b(?:road|street|lane|traffic|detour|closure|closed|parking|transit|metra|pace|bus|rail|trail|bike|bicycle|pedestrian|sidewalk|bridge|accessib\w*)\b/i;
const LIVE_WELL_PATTERN = /\b(?:health|wellness|food|meal|housing|assistance|senior|caregiver|mental health|disab\w*|accessib\w*|recreation|fitness|clinic|support services?)\b/i;
const ECONOMY_PATTERN = /\b(?:business|vendor|bid|rfp|request for proposals?|procurement|contract|grant|market|sponsor\w*|commercial|storefront|workforce|job|employment|development|redevelopment|construction)\b/i;
const CHANGE_PATTERN = /\b(?:construction|project|development|redevelopment|zoning|permit|infrastructure|road|street|lane|traffic|detour|closure|closed|trail|parking|facility|park|river|service change|interruption)\b/i;
const DECISION_PATTERN = /\b(?:council|board|commission|committee|meeting|agenda|hearing|public comment|comment period|survey|public input|ordinance|resolution|zoning|proposal|plan)\b/i;

interface ExtendedFields {
  deadlineAt?: string;
  latitude?: number;
  longitude?: number;
}

interface BuildOptions {
  lens: QualityLens;
  status?: "confirmed" | "watch";
  audience: string[];
  action: string;
  implication: string;
  unknowns: string[];
  upside: number;
  opportunityCategory?: OpportunityCategory;
  decisionStage?: DecisionStage;
  changeKind?: ChangeKind;
}

function clean(value: string | undefined, max = 420): string {
  return (value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function evidenceText(item: SourceItem): string {
  const kind = "kind" in item ? item.kind : item.category;
  const location = "location" in item ? item.location : "";
  return `${item.title} ${item.summary} ${kind} ${location}`;
}

function sourceUrlIsCanonical(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function currentLifecycle(item: SourceItem): LiveLifecycle {
  return item.lifecycle ?? "unknown";
}

function evidenceLevel(item: SourceItem, stale: boolean): EvidenceLevel {
  const lifecycle = currentLifecycle(item);
  const hasDate = "startAt" in item ? Boolean(item.startAt) : Boolean(item.publishedAt || item.effectiveEndAt);
  const completeSource = Boolean(clean(item.sourceName)) && sourceUrlIsCanonical(item.canonicalUrl);
  if (!completeSource || clean(item.summary).length < 20) return "low";
  if (stale || lifecycle === "unknown" || !hasDate) return "medium";
  return "high";
}

function dateScore(value: string | undefined, now: number): number {
  if (!value) return 0;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return 0;
  const days = (time - now) / 86_400_000;
  if (days < 0) return 0;
  if (days <= 2) return 4;
  if (days <= 7) return 3;
  if (days <= 30) return 2;
  return 1;
}

function itemDeadline(item: SourceItem): string | undefined {
  const value = (item as SourceItem & ExtendedFields).deadlineAt;
  if (!value || !Number.isFinite(Date.parse(value))) return undefined;
  return new Date(value).toISOString();
}

function scores(
  item: SourceItem,
  level: EvidenceLevel,
  status: "confirmed" | "watch",
  upside: number,
  now: number,
): IntelligenceScores {
  const deadline = itemDeadline(item);
  const startAt = "startAt" in item ? item.startAt : undefined;
  const urgency = dateScore(deadline ?? startAt, now);
  const actionability = status === "watch" ? 1 : deadline ? 4 : startAt ? 3 : 2;
  const evidenceQuality = level === "high" ? 4 : level === "medium" ? 3 : 1;
  const result = {
    localRelevance: 4,
    urgency,
    actionability,
    residentUpside: Math.max(0, Math.min(4, upside)),
    evidenceQuality,
    total: 0,
  };
  result.total = result.localRelevance + result.urgency + result.actionability + result.residentUpside + result.evidenceQuality;
  return result;
}

function buildItem(
  item: SourceItem,
  options: BuildOptions,
  stale: boolean,
  now: number,
): QualityIntelligenceItem {
  const extended = item as SourceItem & ExtendedFields;
  const level = evidenceLevel(item, stale);
  const lifecycle = currentLifecycle(item);
  const status = options.status === "watch" || lifecycle === "unknown" || level === "low" ? "watch" : "confirmed";
  const startAt = "startAt" in item && item.startAt && Number.isFinite(Date.parse(item.startAt))
    ? new Date(item.startAt).toISOString()
    : undefined;
  const location = "location" in item ? clean(item.location, 180) || undefined : undefined;
  const deadline = itemDeadline(item);
  return {
    id: `${options.lens}:${item.communityId}:${item.id}`,
    recordId: `${"kind" in item ? "notice" : "event"}:${item.communityId}:${item.id}`,
    lens: options.lens,
    title: clean(item.title, 180),
    communityId: item.communityId,
    sourceId: item.sourceId,
    sourceName: clean(item.sourceName, 160),
    canonicalUrl: item.canonicalUrl,
    lifecycle,
    evidenceLevel: level,
    confirmedFact: clean(item.summary, 420) || clean(item.title, 180),
    cautiousImplication: options.implication,
    unknowns: options.unknowns,
    audience: options.audience,
    action: options.action,
    ...(deadline ? { deadline } : {}),
    ...(startAt ? { startAt } : {}),
    ...(location ? { location } : {}),
    ...(options.lens === "change" ? { display: Number.isFinite(extended.latitude) && Number.isFinite(extended.longitude) ? "map" as const : "list" as const } : {}),
    scores: scores(item, level, status, options.upside, now),
    status,
    ...(options.opportunityCategory ? { opportunityCategory: options.opportunityCategory } : {}),
    ...(options.decisionStage ? { decisionStage: options.decisionStage } : {}),
    ...(options.changeKind ? { changeKind: options.changeKind } : {}),
  };
}

function opportunityCategory(item: SourceItem): OpportunityCategory | undefined {
  const text = evidenceText(item);
  if (/\b(?:bid|rfp|request for proposals?|vendor registration|procurement|contract opportunity|grant application)\b/i.test(text)) return "win-work";
  if (/\b(?:rebate|financial assistance|reduced fee|fee waiver|discount|free service|free program)\b/i.test(text)) return "save-money";
  // A meeting title is not evidence that public action is available. Generic
  // meetings belong in Decision Decoder until the source explicitly supports
  // a hearing, comment period, survey, or other participation path.
  if (/\b(?:public hearing|public comment|comment period|survey|public input|submit comments?|provide feedback|resident feedback)\b/i.test(text)) return "have-a-say";
  if (/\b(?:registration|enrollment|school|camp|youth|family deadline|meal program)\b/i.test(text)) return "family-deadlines";
  if (/\b(?:zoning|redevelopment|development proposal|assessment|tax appeal|building permit)\b/i.test(text)) return "property-development";
  if (/\b(?:volunteer|board vacancy|commission vacancy|cleanup|civic program)\b/i.test(text)) return "volunteer-participate";
  if (MOBILITY_PATTERN.test(text)) return "mobility-access";
  if (/\b(?:vendor|market|sponsor\w*|business opportunity|commercial opportunity)\b/i.test(text)) return "business-demand";
  return undefined;
}

function opportunityAction(item: SourceItem, category: OpportunityCategory): string {
  if (category === "have-a-say") return "Open the official record and verify the agenda, attendance, and participation details.";
  if (category === "save-money") return "Review the official eligibility, availability, and application details before relying on this program.";
  if (category === "win-work") return "Review the official solicitation, qualifications, submission process, and deadline.";
  if (category === "family-deadlines") return "Check the official registration, eligibility, cost, and schedule details.";
  if (category === "property-development") return "Review the official project record and the next documented public step.";
  if (category === "volunteer-participate") return "Check the official participation requirements and current availability.";
  if (category === "mobility-access") return "Check the official route, timing, and access details before traveling.";
  return "Review the official listing for current participation and availability details.";
}

function opportunityImplication(category: OpportunityCategory): string {
  if (category === "have-a-say") return "This may provide a timely way to follow or participate in a local public process.";
  if (category === "save-money") return "This may reduce costs for residents who meet the source's requirements, but eligibility and availability need confirmation.";
  if (category === "win-work") return "This may be relevant to qualified local vendors or applicants, but the source controls all requirements and selection.";
  if (category === "family-deadlines") return "This may matter to households planning school, care, recreation, or youth activities.";
  if (category === "property-development") return "This may affect nearby land use or public planning, but the record alone does not establish a final outcome.";
  if (category === "volunteer-participate") return "This may offer residents a way to contribute, subject to the source's current requirements.";
  if (category === "mobility-access") return "This may affect how residents reach the named area or service.";
  return "This may signal a local participation or demand opportunity, but it does not establish commercial results.";
}

function opportunityItems(items: SourceItem[], stale: boolean, now: number): QualityIntelligenceItem[] {
  return items.flatMap((item) => {
    const category = opportunityCategory(item);
    if (!category) return [];
    const isBareEvent = "category" in item && item.category === "event" && category === "business-demand";
    return [buildItem(item, {
      lens: "opportunity",
      status: isBareEvent ? "watch" : undefined,
      opportunityCategory: category,
      audience: category === "win-work" || category === "business-demand"
        ? ["Local businesses", "Qualified vendors"]
        : category === "family-deadlines"
          ? ["Families", "Caregivers"]
          : category === "have-a-say"
            ? ["Residents following local decisions"]
            : ["Residents connected to the named program or area"],
      action: opportunityAction(item, category),
      implication: opportunityImplication(category),
      unknowns: ["Availability, eligibility, capacity, later changes, and complete terms may not appear in the feed excerpt."],
      upside: category === "save-money" || category === "win-work" ? 4 : 3,
    }, stale, now)];
  });
}

function decisionStage(item: SourceItem): DecisionStage {
  const text = evidenceText(item);
  if (/\bpublic hearing\b/i.test(text)) return "hearing";
  if (/\b(?:public comment|comment period|survey|public input)\b/i.test(text)) return "public-input";
  if (/\b(?:proposal|proposed|plan|zoning|ordinance)\b/i.test(text)) return "proposal";
  if ("category" in item && item.category === "meeting") return "meeting";
  return "official-notice";
}

function decisionItems(items: SourceItem[], stale: boolean, now: number): QualityIntelligenceItem[] {
  return items.filter((item) => ("category" in item && item.category === "meeting") || DECISION_PATTERN.test(evidenceText(item))).map((item) =>
    buildItem(item, {
      lens: "decision",
      decisionStage: decisionStage(item),
      audience: ["Residents following local public business"],
      action: "Open the official record and verify the agenda, materials, participation rules, and latest meeting status.",
      implication: "This may be a useful point to follow a public process, but the excerpt does not establish the agenda, vote, or final outcome.",
      unknowns: ["Agenda topics, public-comment rules, staff recommendations, vote status, and later amendments may not appear in the excerpt."],
      upside: 3,
    }, stale, now),
  );
}

function changeKind(item: SourceItem): ChangeKind {
  const text = evidenceText(item);
  if (/\b(?:development|redevelopment|zoning|permit)\b/i.test(text)) return "development";
  if (/\bconstruction\b/i.test(text)) return "construction";
  if (MOBILITY_PATTERN.test(text)) return "mobility";
  if (/\b(?:service|interruption|utilities|water|waste)\b/i.test(text)) return "service";
  if (/\b(?:park|river|facility|public space)\b/i.test(text)) return "public-place";
  return "other";
}

function changeItems(items: SourceItem[], stale: boolean, now: number): QualityIntelligenceItem[] {
  return items.filter((item) => CHANGE_PATTERN.test(evidenceText(item))).map((item) => buildItem(item, {
    lens: "change",
    changeKind: changeKind(item),
    audience: MOBILITY_PATTERN.test(evidenceText(item)) ? ["People traveling through the named area", "Nearby residents"] : ["Residents connected to the named place or service"],
    action: "Review the official record for the affected area, timing, status, and any documented next step.",
    implication: "This may change access, activity, or services around the named area; the practical effect depends on current official details.",
    unknowns: ["Exact boundaries, phasing, delays, approvals, and later revisions may not appear in the feed excerpt."],
    upside: 2,
  }, stale, now));
}

function lensItems(
  items: SourceItem[],
  lens: "family" | "mobility" | "live-well" | "local-economy",
  pattern: RegExp,
  stale: boolean,
  now: number,
): QualityIntelligenceItem[] {
  const options = {
    family: {
      audience: ["Families", "Caregivers"],
      action: "Check the official listing for age, registration, cost, location, and schedule details.",
      implication: "This may help households plan local school, care, recreation, or youth activities.",
      unknowns: ["Age limits, capacity, registration status, cost, accessibility, and later changes may not appear in the excerpt."],
      upside: 3,
    },
    mobility: {
      audience: ["Drivers", "Transit riders", "People walking, biking, or using mobility aids"],
      action: "Check the official source for the affected route, timing, detour, and accessibility details before traveling.",
      implication: "This may affect travel time or access for people using the named route or place.",
      unknowns: ["Exact limits, delay length, detours, accessibility impacts, and later changes may not appear in the excerpt."],
      upside: 3,
    },
    "live-well": {
      audience: ["Residents seeking local services or activities", "Caregivers"],
      action: "Review the official service or program details and contact the publisher for current access information.",
      implication: "This may connect some residents with a local service, support, or activity; it is not individualized medical, legal, or financial advice.",
      unknowns: ["Eligibility, capacity, accessibility, cost, and service availability may not appear in the excerpt."],
      upside: 3,
    },
    "local-economy": {
      audience: ["Local businesses", "Workers", "Community organizations"],
      action: "Review the official record for documented requirements, timing, access changes, or participation details.",
      implication: "This may signal local activity, demand, disruption, or procurement interest, but it does not establish revenue, profitability, or business success.",
      unknowns: ["Attendance, spending, contract value, selection, business impact, and later changes are not established by the excerpt."],
      upside: 3,
    },
  }[lens];
  return items.filter((item) => pattern.test(evidenceText(item))).map((item) => buildItem(item, {
    lens,
    ...options,
  }, stale, now));
}

function uniqueSourceItems(payload: LiveDataPayload): SourceItem[] {
  const seen = new Set<string>();
  return [...payload.notices, ...payload.events].filter((item) => {
    const key = `${"kind" in item ? "notice" : "event"}:${item.communityId}:${item.id}`;
    if (seen.has(key) || !CURRENT_LIFECYCLES.has(currentLifecycle(item)) || HIGH_RISK_PATTERN.test(evidenceText(item))) return false;
    if (!item.sourceId || !item.sourceName || !sourceUrlIsCanonical(item.canonicalUrl)) return false;
    seen.add(key);
    return true;
  });
}

function ranked(items: QualityIntelligenceItem[]): QualityIntelligenceItem[] {
  return items.sort((left, right) =>
    right.scores.total - left.scores.total
      || (left.startAt ? Date.parse(left.startAt) : Number.MAX_SAFE_INTEGER) - (right.startAt ? Date.parse(right.startAt) : Number.MAX_SAFE_INTEGER)
      || left.title.localeCompare(right.title),
  );
}

export function deriveQualityOfLifeSnapshot(payload: LiveDataPayload, now = Date.now()): QualityOfLifeSnapshot {
  const sourceItems = uniqueSourceItems(payload);
  const stale = payload.cache?.stale ?? payload.mode !== "live";
  const opportunityCenter = ranked(opportunityItems(sourceItems, stale, now));
  const decisionDecoder = ranked(decisionItems(sourceItems, stale, now));
  const changeMap = ranked(changeItems(sourceItems, stale, now));
  const family = ranked(lensItems(sourceItems, "family", FAMILY_PATTERN, stale, now));
  const mobility = ranked(lensItems(sourceItems, "mobility", MOBILITY_PATTERN, stale, now));
  const liveWell = ranked(lensItems(sourceItems, "live-well", LIVE_WELL_PATTERN, stale, now));
  const localEconomy = ranked(lensItems(sourceItems, "local-economy", ECONOMY_PATTERN, stale, now));
  const allDerived = [opportunityCenter, decisionDecoder, changeMap, family, mobility, liveWell, localEconomy].flat();
  const byCommunity: Record<CommunityId, number> = { geneva: 0, batavia: 0, "st-charles": 0 };
  for (const item of allDerived) byCommunity[item.communityId] += 1;
  const communities = (["geneva", "batavia", "st-charles"] as CommunityId[]).filter((communityId) =>
    sourceItems.some((item) => item.communityId === communityId),
  );
  return {
    generatedAt: new Date(now).toISOString(),
    sourceGeneratedAt: payload.generatedAt,
    mode: "derived",
    stale,
    communities,
    opportunityCenter,
    decisionDecoder,
    changeMap,
    family,
    mobility,
    liveWell,
    localEconomy,
    coverage: {
      sourceRecords: sourceItems.length,
      derivedItems: allDerived.length,
      byCommunity,
    },
  };
}
