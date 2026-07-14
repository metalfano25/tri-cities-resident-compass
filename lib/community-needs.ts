export const COMMUNITY_NEED_CATEGORIES = [
  "accessibility",
  "family-support",
  "housing",
  "local-business",
  "mobility",
  "parks-and-public-space",
  "safety-and-wellbeing",
  "services-and-programs",
] as const;

export const COMMUNITY_NEED_COMMUNITIES = ["geneva", "batavia", "st-charles", "tri-cities"] as const;

export type CommunityNeedCategory = (typeof COMMUNITY_NEED_CATEGORIES)[number];
export type CommunityNeedCommunity = (typeof COMMUNITY_NEED_COMMUNITIES)[number];

export interface CommunityNeedInput {
  community: CommunityNeedCommunity;
  category: CommunityNeedCategory;
  summary: string;
  approximateLocation?: string;
  residentImpact: string;
}

export interface CommunityNeedRecord extends CommunityNeedInput {
  id: string;
  status: "pending" | "approved" | "rejected" | "resolved";
  createdAt: string;
  updatedAt: string;
}

export class CommunityNeedValidationError extends Error {}

function database(): D1Database | null {
  return globalThis.__TRI_CITIES_ENV__?.DB ?? null;
}

export async function initializeCommunityNeedsStore(db = database()): Promise<boolean> {
  if (!db) return false;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS community_needs (id TEXT PRIMARY KEY, community TEXT NOT NULL, category TEXT NOT NULL, summary TEXT NOT NULL, approximate_location TEXT, resident_impact TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', fingerprint TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, reviewed_at TEXT, correction_note TEXT)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS community_needs_fingerprint_idx ON community_needs (fingerprint)"),
    db.prepare("CREATE INDEX IF NOT EXISTS community_needs_status_created_idx ON community_needs (status, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS community_needs_community_category_idx ON community_needs (community, category)"),
  ]);
  return true;
}

function normalizeText(value: unknown, name: string, minimum: number, maximum: number): string {
  if (typeof value !== "string") throw new CommunityNeedValidationError(`${name} is required.`);
  const normalized = value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new CommunityNeedValidationError(`${name} must be between ${minimum} and ${maximum} characters.`);
  }
  return normalized;
}

function containsPrivateOrPromotionalContent(value: string): boolean {
  const email = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
  const phone = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/;
  const url = /(?:https?:\/\/|www\.)\S+/i;
  return email.test(value) || phone.test(value) || url.test(value);
}

function looksLikeExactStreetAddress(value: string): boolean {
  return /(?:^|\s)\d{1,6}\s+[A-Za-z0-9.' -]{1,60}\b(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|boulevard|blvd|place|pl)\b/i.test(value);
}

export function validateCommunityNeed(value: unknown): CommunityNeedInput {
  if (!value || typeof value !== "object") throw new CommunityNeedValidationError("A community need is required.");
  const input = value as Record<string, unknown>;
  if (!COMMUNITY_NEED_COMMUNITIES.includes(input.community as CommunityNeedCommunity)) {
    throw new CommunityNeedValidationError("Choose a supported community.");
  }
  if (!COMMUNITY_NEED_CATEGORIES.includes(input.category as CommunityNeedCategory)) {
    throw new CommunityNeedValidationError("Choose a supported category.");
  }
  const summary = normalizeText(input.summary, "Summary", 20, 360);
  const residentImpact = normalizeText(input.residentImpact, "Resident impact", 20, 360);
  const approximateLocation = typeof input.approximateLocation === "string" && input.approximateLocation.trim()
    ? normalizeText(input.approximateLocation, "Approximate location", 3, 100)
    : undefined;
  const combined = `${summary} ${residentImpact} ${approximateLocation ?? ""}`;
  if (containsPrivateOrPromotionalContent(combined)) {
    throw new CommunityNeedValidationError("Do not include contact information, links, or promotional content.");
  }
  if (looksLikeExactStreetAddress(combined)) {
    throw new CommunityNeedValidationError("Use a public landmark, intersection, or general area—not a home address.");
  }
  return {
    community: input.community as CommunityNeedCommunity,
    category: input.category as CommunityNeedCategory,
    summary,
    approximateLocation,
    residentImpact,
  };
}

async function fingerprint(input: CommunityNeedInput): Promise<string> {
  const normalized = JSON.stringify({
    community: input.community,
    category: input.category,
    summary: input.summary.toLowerCase(),
    approximateLocation: input.approximateLocation?.toLowerCase() ?? "",
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function submitCommunityNeed(input: CommunityNeedInput): Promise<{ id: string; duplicate: boolean }> {
  const db = database();
  if (!db || !(await initializeCommunityNeedsStore(db))) throw new Error("Community feedback storage is unavailable.");
  const contentFingerprint = await fingerprint(input);
  const existing = await db.prepare("SELECT id FROM community_needs WHERE fingerprint = ? LIMIT 1")
    .bind(contentFingerprint)
    .first<{ id: string }>();
  if (existing) return { id: existing.id, duplicate: true };
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.prepare("INSERT INTO community_needs (id, community, category, summary, approximate_location, resident_impact, status, fingerprint, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)")
    .bind(id, input.community, input.category, input.summary, input.approximateLocation ?? null, input.residentImpact, contentFingerprint, now, now)
    .run();
  return { id, duplicate: false };
}

export async function listApprovedCommunityNeeds(limit = 24): Promise<CommunityNeedRecord[]> {
  const db = database();
  if (!db || !(await initializeCommunityNeedsStore(db))) return [];
  const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  const rows = await db.prepare("SELECT id, community, category, summary, approximate_location, resident_impact, status, created_at, updated_at FROM community_needs WHERE status IN ('approved', 'resolved') ORDER BY created_at DESC LIMIT ?")
    .bind(safeLimit)
    .all<{
      id: string; community: CommunityNeedCommunity; category: CommunityNeedCategory; summary: string;
      approximate_location: string | null; resident_impact: string; status: "approved" | "resolved";
      created_at: string; updated_at: string;
    }>();
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    community: row.community,
    category: row.category,
    summary: row.summary,
    approximateLocation: row.approximate_location ?? undefined,
    residentImpact: row.resident_impact,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}
