import type { CommunityId } from "../app/data";
import type { QualityIntelligenceItem, QualityOfLifeSnapshot } from "./quality-types";

const HIGH_RISK_PATTERN = /\b(?:911|emergency|evacuat\w*|fire|shooting|armed|crime|police|medical|symptom|chest pain|heart attack|difficult\w* breathing|can(?:not|'t) breathe|poison|overdose|suicid\w*|self[ -]?harm|(?:kill|hurt) myself|domestic violence|abus\w*|assault\w*|unsafe|medication|doctor|legal advice|attorney|lawyer|lawsuit|tornado|severe weather|flood warning|missing person|immediate danger)\b/i;
const PRIVATE_OR_LINK_PATTERN = /(?:https?:\/\/|www\.|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4})/i;
const STOP_WORDS = new Set([
  "about", "after", "any", "are", "before", "could", "does", "from", "have", "into", "local", "near", "that", "their", "there", "these", "this", "what", "when", "where", "which", "with", "would", "geneva", "batavia", "charles", "cities",
]);

export interface AskCompassMatch {
  id: string;
  title: string;
  communityId: CommunityId;
  lens: QualityIntelligenceItem["lens"];
  status: QualityIntelligenceItem["status"];
  confirmedFact: string;
  cautiousImplication: string;
  unknowns: string[];
  action: string;
  sourceName: string;
  sourceUrl: string;
  startAt?: string;
  deadline?: string;
}

export interface AskCompassResult {
  mode: "verified-search" | "authoritative-routing";
  question: string;
  answer: string;
  matches: AskCompassMatch[];
  disclaimer: string;
}

export function validateCompassQuestion(value: unknown): string {
  if (typeof value !== "string") throw new Error("Enter a question.");
  const question = value.replace(/\s+/g, " ").trim();
  if (question.length < 5 || question.length > 220) throw new Error("Use between 5 and 220 characters.");
  if (PRIVATE_OR_LINK_PATTERN.test(question)) throw new Error("Remove contact details and links before searching.");
  return question;
}

function tokens(value: string): string[] {
  return [...new Set((value.toLowerCase().match(/[a-z0-9-]{3,}/g) ?? [])
    .map((token) => token.length > 4 && token.endsWith("s") && !token.endsWith("ss") ? token.slice(0, -1) : token))]
    .filter((token) => !STOP_WORDS.has(token));
}

function searchable(item: QualityIntelligenceItem): string {
  return [
    item.title,
    item.confirmedFact,
    item.cautiousImplication,
    item.action,
    item.location,
    item.lens,
    item.opportunityCategory,
    item.decisionStage,
    item.changeKind,
    ...item.audience,
  ].filter(Boolean).join(" ").toLowerCase();
}

function allItems(snapshot: QualityOfLifeSnapshot): QualityIntelligenceItem[] {
  const unique = new Map<string, QualityIntelligenceItem>();
  for (const item of [
    snapshot.opportunityCenter,
    snapshot.decisionDecoder,
    snapshot.changeMap,
    snapshot.family,
    snapshot.mobility,
    snapshot.liveWell,
    snapshot.localEconomy,
  ].flat()) {
    const existing = unique.get(item.recordId);
    if (!existing || item.scores.total > existing.scores.total) unique.set(item.recordId, item);
  }
  return [...unique.values()];
}

function asMatch(item: QualityIntelligenceItem): AskCompassMatch {
  return {
    id: item.id,
    title: item.title,
    communityId: item.communityId,
    lens: item.lens,
    status: item.status,
    confirmedFact: item.confirmedFact,
    cautiousImplication: item.cautiousImplication,
    unknowns: item.unknowns,
    action: item.action,
    sourceName: item.sourceName,
    sourceUrl: item.canonicalUrl,
    ...(item.startAt ? { startAt: item.startAt } : {}),
    ...(item.deadline ? { deadline: item.deadline } : {}),
  };
}

export function answerCompassQuestion(
  snapshot: QualityOfLifeSnapshot,
  question: string,
  community?: CommunityId,
): AskCompassResult {
  if (HIGH_RISK_PATTERN.test(question)) {
    return {
      mode: "authoritative-routing",
      question,
      answer: "This question may involve urgent, emergency, medical, legal, or public-safety guidance. Compass does not interpret those situations. If anyone may be in immediate danger, call 911. Otherwise, use the current instructions from the responsible public agency.",
      matches: [],
      disclaimer: "Do not rely on this site for emergency, medical, legal, or individualized safety decisions.",
    };
  }

  const terms = tokens(question);
  const ranked = allItems(snapshot)
    .filter((item) => !community || item.communityId === community)
    .map((item) => {
      const haystack = new Set(tokens(searchable(item)));
      const title = new Set(tokens(item.title));
      const lexicalScore = terms.reduce((total, term) => total + (title.has(term) ? 5 : haystack.has(term) ? 2 : 0), 0);
      const score = lexicalScore
        + Math.min(4, Math.floor(item.scores.total / 5));
      return { item, score, lexicalScore };
    })
    .filter(({ lexicalScore }) => terms.length > 0 && lexicalScore > 0)
    .sort((left, right) => right.score - left.score || right.item.scores.total - left.item.scores.total)
    .slice(0, 4)
    .map(({ item }) => asMatch(item));

  const answer = ranked.length
    ? `I found ${ranked.length} current, source-linked ${ranked.length === 1 ? "record" : "records"} that may help. The implications are cautious interpretations; open the official sources before acting.`
    : "No current verified record closely matches that question. This can mean the source coverage is incomplete, not that nothing is happening.";

  return {
    mode: "verified-search",
    question,
    answer,
    matches: ranked,
    disclaimer: "Results come from the latest stored official-source snapshot. They are not a complete search of every local organization and are not individualized advice.",
  };
}
