import type {
  LiveDataPayload,
  LiveEvent,
  LiveNotice,
  LiveSourceStatus,
} from "./live-types";

const CACHE_KEY = "current";
const DEFAULT_STALE_AFTER_MS = 30 * 60 * 1000;
const INGESTION_LOCK_NAME = "live-data";
const INGESTION_LEASE_MS = 2 * 60 * 1000;
const DEFAULT_INGESTION_COOLDOWN_MS = 60 * 1000;
const PARSER_VERSION = "wave-1";

type RecordFamily = "notice" | "event";
type Lifecycle =
  | "upcoming"
  | "active"
  | "ending-soon"
  | "expired"
  | "cancelled"
  | "historical"
  | "unknown";

interface StoredRecord {
  recordId: string;
  recordFamily: RecordFamily;
  sourceId: string;
  publisher: string;
  canonicalUrl: string;
  community: string;
  affectedArea: string;
  recordType: string;
  topicTags: string;
  title: string;
  factualExcerpt: string;
  publishedAt: string | null;
  startAt: string | null;
  endAt: string | null;
  deadlineAt: string | null;
  updatedAt: string | null;
  lifecycle: Lifecycle;
  locationText: string | null;
  latitude: number | null;
  longitude: number | null;
  contentFingerprint: string;
  fieldConfidence: string;
  recordPayload: string;
}

interface ExistingRecordRow {
  record_id: string;
  source_id: string;
  publisher: string;
  canonical_url: string;
  community: string;
  affected_area: string;
  record_type: string;
  topic_tags: string;
  title: string;
  factual_excerpt: string;
  published_at: string | null;
  start_at: string | null;
  end_at: string | null;
  deadline_at: string | null;
  updated_at: string | null;
  lifecycle: Lifecycle;
  location_text: string | null;
  latitude: number | null;
  longitude: number | null;
  content_fingerprint: string;
  field_confidence: string;
  record_payload: string;
}

interface SourceFreshness {
  sourceId: string;
  state: LiveSourceStatus["state"];
  lastAttemptAt: string;
  lastSuccessfulAt: string | null;
  stale: boolean;
}

export interface CachedLiveDataPayload extends LiveDataPayload {
  cache: {
    storedAt: string;
    lastSuccessfulAt: string | null;
    ageSeconds: number;
    staleAfterSeconds: number;
    stale: boolean;
    sources: SourceFreshness[];
  };
}

export interface PersistLiveDataResult {
  storedAt: string;
  recordCount: number;
  changedRecordCount: number;
  preservedRecordCount: number;
}

function database(): D1Database | null {
  return globalThis.__TRI_CITIES_ENV__?.DB ?? null;
}

export async function initializeLiveStore(db = database()): Promise<boolean> {
  if (!db) return false;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS source_records (record_id TEXT PRIMARY KEY, record_family TEXT NOT NULL, source_id TEXT NOT NULL, publisher TEXT NOT NULL, canonical_url TEXT NOT NULL, community TEXT NOT NULL, affected_area TEXT NOT NULL, record_type TEXT NOT NULL, topic_tags TEXT NOT NULL DEFAULT '[]', title TEXT NOT NULL, factual_excerpt TEXT NOT NULL, published_at TEXT, start_at TEXT, end_at TEXT, deadline_at TEXT, updated_at TEXT, first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, content_changed_at TEXT NOT NULL, lifecycle TEXT NOT NULL, location_text TEXT, latitude REAL, longitude REAL, content_fingerprint TEXT NOT NULL, field_confidence TEXT NOT NULL, record_payload TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS source_records_source_idx ON source_records (source_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS source_records_community_lifecycle_idx ON source_records (community, lifecycle)"),
    db.prepare("CREATE INDEX IF NOT EXISTS source_records_last_seen_idx ON source_records (last_seen_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS source_records_start_idx ON source_records (start_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS source_records_deadline_idx ON source_records (deadline_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS source_records_canonical_family_idx ON source_records (canonical_url, record_family)"),
    db.prepare("CREATE TABLE IF NOT EXISTS record_versions (version_id TEXT PRIMARY KEY, record_id TEXT NOT NULL, content_fingerprint TEXT NOT NULL, captured_at TEXT NOT NULL, changed_fields TEXT NOT NULL, prior_values TEXT NOT NULL, current_values TEXT NOT NULL)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS record_versions_record_fingerprint_idx ON record_versions (record_id, content_fingerprint)"),
    db.prepare("CREATE INDEX IF NOT EXISTS record_versions_record_captured_idx ON record_versions (record_id, captured_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS source_runs (run_id TEXT PRIMARY KEY, source_id TEXT NOT NULL, community TEXT NOT NULL, publisher TEXT NOT NULL, canonical_url TEXT NOT NULL, started_at TEXT NOT NULL, completed_at TEXT NOT NULL, status TEXT NOT NULL, http_outcome TEXT, item_count INTEGER NOT NULL, parser_version TEXT NOT NULL, last_successful_collection TEXT, diagnostic_message TEXT)"),
    db.prepare("CREATE INDEX IF NOT EXISTS source_runs_source_completed_idx ON source_runs (source_id, completed_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS source_runs_status_completed_idx ON source_runs (status, completed_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS live_payload_cache (cache_key TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at TEXT NOT NULL, last_successful_at TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS ingestion_locks (lock_name TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, last_started_at INTEGER NOT NULL)"),
  ]);
  return true;
}

function cleanDiagnostic(value?: string): string | null {
  if (!value) return null;
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 300) || null;
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function lifecycleFor(item: LiveNotice | LiveEvent, now: number): Lifecycle {
  const supplied = (item as LiveNotice & { lifecycle?: Lifecycle }).lifecycle;
  if (supplied && ["upcoming", "active", "ending-soon", "expired", "cancelled", "historical", "unknown"].includes(supplied)) {
    return supplied;
  }
  if (!("category" in item)) return "unknown";
  const start = item.startAt ? Date.parse(item.startAt) : Number.NaN;
  const end = item.endAt ? Date.parse(item.endAt) : start;
  if (Number.isFinite(end) && end < now) return "expired";
  if (Number.isFinite(start) && start > now) return "upcoming";
  if (Number.isFinite(start) && start <= now && Number.isFinite(end) && end >= now) {
    return end - now <= 48 * 60 * 60 * 1000 ? "ending-soon" : "active";
  }
  return "unknown";
}

function fingerprintInput(record: Omit<StoredRecord, "contentFingerprint" | "recordPayload">) {
  return {
    sourceId: record.sourceId,
    canonicalUrl: record.canonicalUrl,
    community: record.community,
    affectedArea: record.affectedArea,
    recordType: record.recordType,
    topicTags: record.topicTags,
    title: record.title,
    factualExcerpt: record.factualExcerpt,
    publishedAt: record.publishedAt,
    startAt: record.startAt,
    endAt: record.endAt,
    deadlineAt: record.deadlineAt,
    updatedAt: record.updatedAt,
    lifecycle: record.lifecycle,
    locationText: record.locationText,
    latitude: record.latitude,
    longitude: record.longitude,
  };
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function normalizeRecord(
  item: LiveNotice | LiveEvent,
  family: RecordFamily,
  now: number,
): Promise<StoredRecord> {
  const extended = item as (LiveNotice | LiveEvent) & {
    deadlineAt?: string;
    updatedAt?: string;
    latitude?: number;
    longitude?: number;
    fieldConfidence?: string;
    topicTags?: string[];
  };
  const base: Omit<StoredRecord, "contentFingerprint" | "recordPayload"> = {
    recordId: `${family}:${item.communityId}:${item.id}`,
    recordFamily: family,
    sourceId: item.sourceId,
    publisher: item.sourceName,
    canonicalUrl: item.canonicalUrl,
    community: item.communityId,
    affectedArea: item.communityId,
    recordType: family === "notice" ? (item as LiveNotice).kind : (item as LiveEvent).category,
    topicTags: JSON.stringify(extended.topicTags ?? [family === "notice" ? (item as LiveNotice).kind : (item as LiveEvent).category]),
    title: item.title,
    factualExcerpt: item.summary,
    publishedAt: family === "notice" ? isoOrNull((item as LiveNotice).publishedAt) : null,
    startAt: family === "event" ? isoOrNull((item as LiveEvent).startAt) : null,
    endAt: family === "event"
      ? isoOrNull((item as LiveEvent).endAt)
      : isoOrNull((item as LiveNotice).effectiveEndAt),
    deadlineAt: isoOrNull(extended.deadlineAt),
    updatedAt: isoOrNull(extended.updatedAt),
    lifecycle: lifecycleFor(item, now),
    locationText: family === "event" ? (item as LiveEvent).location || null : null,
    latitude: Number.isFinite(extended.latitude) ? extended.latitude! : null,
    longitude: Number.isFinite(extended.longitude) ? extended.longitude! : null,
    fieldConfidence: extended.fieldConfidence ?? "medium",
  };
  return {
    ...base,
    contentFingerprint: await sha256(JSON.stringify(fingerprintInput(base))),
    recordPayload: JSON.stringify(item),
  };
}

function priorVersionValues(row: ExistingRecordRow): Record<string, unknown> {
  return {
    sourceId: row.source_id,
    canonicalUrl: row.canonical_url,
    community: row.community,
    affectedArea: row.affected_area,
    recordType: row.record_type,
    topicTags: row.topic_tags,
    title: row.title,
    factualExcerpt: row.factual_excerpt,
    publishedAt: row.published_at,
    startAt: row.start_at,
    endAt: row.end_at,
    deadlineAt: row.deadline_at,
    updatedAt: row.updated_at,
    lifecycle: row.lifecycle,
    locationText: row.location_text,
    latitude: row.latitude,
    longitude: row.longitude,
  };
}

function changedFields(prior: Record<string, unknown>, current: Record<string, unknown>): string[] {
  return Object.keys(current).filter((key) => JSON.stringify(prior[key]) !== JSON.stringify(current[key]));
}

function dedupeNotices(items: LiveNotice[]): LiveNotice[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.communityId}:${item.id}:${item.canonicalUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeEvents(items: LiveEvent[]): LiveEvent[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.communityId}:${item.id}:${item.startAt ?? item.dateLabel}:${item.canonicalUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function rawCachedPayload(db: D1Database): Promise<{
  payload: LiveDataPayload;
  createdAt: string;
  lastSuccessfulAt: string | null;
} | null> {
  const row = await db.prepare("SELECT payload, created_at, last_successful_at FROM live_payload_cache WHERE cache_key = ?")
    .bind(CACHE_KEY)
    .first<{ payload: string; created_at: string; last_successful_at: string | null }>();
  if (!row) return null;
  try {
    const payload = JSON.parse(row.payload) as LiveDataPayload;
    if (!Array.isArray(payload.notices) || !Array.isArray(payload.events) || !Array.isArray(payload.sources)) return null;
    return { payload, createdAt: row.created_at, lastSuccessfulAt: row.last_successful_at };
  } catch {
    return null;
  }
}

function mergeFailedSourceRecords(
  payload: LiveDataPayload,
  previous: LiveDataPayload | null,
): { payload: LiveDataPayload; preservedRecordCount: number } {
  if (!previous) return { payload, preservedRecordCount: 0 };
  const returnedSourceIds = new Set(payload.sources.map((source) => source.sourceId));
  const incompleteSourceIds = new Set(
    payload.sources.filter((source) => source.state !== "ok").map((source) => source.sourceId),
  );
  for (const source of previous.sources) {
    if (!returnedSourceIds.has(source.sourceId)) incompleteSourceIds.add(source.sourceId);
  }
  if (incompleteSourceIds.size === 0) return { payload, preservedRecordCount: 0 };
  const preservedNotices = previous.notices.filter((item) => incompleteSourceIds.has(item.sourceId));
  const preservedEvents = previous.events.filter((item) => incompleteSourceIds.has(item.sourceId));
  const missingSources = previous.sources
    .filter((source) => !returnedSourceIds.has(source.sourceId))
    .map((source) => ({
      ...source,
      state: "failed" as const,
      itemCount: 0,
      checkedAt: payload.generatedAt,
      message: "The source did not return during this collection; last verified records were retained.",
    }));
  return {
    payload: {
      ...payload,
      notices: dedupeNotices([...payload.notices, ...preservedNotices]),
      events: dedupeEvents([...payload.events, ...preservedEvents]),
      sources: [...payload.sources, ...missingSources],
      mode: "partial",
    },
    preservedRecordCount: preservedNotices.length + preservedEvents.length,
  };
}

export async function persistLiveDataPayload(payload: LiveDataPayload): Promise<PersistLiveDataResult> {
  const db = database();
  if (!db) throw new Error("D1 database binding is unavailable");
  await initializeLiveStore(db);
  const startedAt = isoOrNull(payload.generatedAt) ?? new Date().toISOString();
  const storedAt = new Date().toISOString();
  const now = Date.parse(storedAt);
  const previousCache = await rawCachedPayload(db);
  const merged = mergeFailedSourceRecords(payload, previousCache?.payload ?? null);
  const records = await Promise.all([
    // Carry-forward records are a public availability feature only. Persisting
    // only this run's observations prevents a failed source from advancing
    // last_seen_at or creating a synthetic version.
    ...payload.notices.map((item) => normalizeRecord(item, "notice", now)),
    ...payload.events.map((item) => normalizeRecord(item, "event", now)),
  ]);
  const writes: D1PreparedStatement[] = [];
  let changedRecordCount = 0;

  for (const source of merged.payload.sources) {
    const previousRun = await db.prepare("SELECT last_successful_collection FROM source_runs WHERE source_id = ? AND last_successful_collection IS NOT NULL ORDER BY completed_at DESC LIMIT 1")
      .bind(source.sourceId)
      .first<{ last_successful_collection: string }>();
    const lastSuccessful = source.state === "ok" ? storedAt : previousRun?.last_successful_collection ?? null;
    const diagnostic = cleanDiagnostic(source.message);
    const httpOutcome = diagnostic?.match(/\bHTTP\s+(\d{3})\b/i)?.[1] ?? null;
    writes.push(db.prepare("INSERT INTO source_runs (run_id, source_id, community, publisher, canonical_url, started_at, completed_at, status, http_outcome, item_count, parser_version, last_successful_collection, diagnostic_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(`${storedAt}:${source.sourceId}:${crypto.randomUUID()}`, source.sourceId, source.communityId, source.name, source.url, startedAt, storedAt, source.state, httpOutcome, source.itemCount, PARSER_VERSION, lastSuccessful, diagnostic));
  }

  for (const record of records) {
    const existing = await db.prepare("SELECT record_id, source_id, publisher, canonical_url, community, affected_area, record_type, topic_tags, title, factual_excerpt, published_at, start_at, end_at, deadline_at, updated_at, lifecycle, location_text, latitude, longitude, content_fingerprint, field_confidence, record_payload FROM source_records WHERE record_id = ?")
      .bind(record.recordId)
      .first<ExistingRecordRow>();
    const changed = !existing || existing.content_fingerprint !== record.contentFingerprint;
    if (changed) changedRecordCount += 1;
    writes.push(db.prepare("INSERT INTO source_records (record_id, record_family, source_id, publisher, canonical_url, community, affected_area, record_type, topic_tags, title, factual_excerpt, published_at, start_at, end_at, deadline_at, updated_at, first_seen_at, last_seen_at, content_changed_at, lifecycle, location_text, latitude, longitude, content_fingerprint, field_confidence, record_payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(record_id) DO UPDATE SET record_family = excluded.record_family, source_id = excluded.source_id, publisher = excluded.publisher, canonical_url = excluded.canonical_url, community = excluded.community, affected_area = excluded.affected_area, record_type = excluded.record_type, topic_tags = excluded.topic_tags, title = excluded.title, factual_excerpt = excluded.factual_excerpt, published_at = excluded.published_at, start_at = excluded.start_at, end_at = excluded.end_at, deadline_at = excluded.deadline_at, updated_at = excluded.updated_at, last_seen_at = excluded.last_seen_at, content_changed_at = CASE WHEN source_records.content_fingerprint <> excluded.content_fingerprint THEN excluded.content_changed_at ELSE source_records.content_changed_at END, lifecycle = excluded.lifecycle, location_text = excluded.location_text, latitude = excluded.latitude, longitude = excluded.longitude, content_fingerprint = excluded.content_fingerprint, field_confidence = excluded.field_confidence, record_payload = excluded.record_payload")
      .bind(record.recordId, record.recordFamily, record.sourceId, record.publisher, record.canonicalUrl, record.community, record.affectedArea, record.recordType, record.topicTags, record.title, record.factualExcerpt, record.publishedAt, record.startAt, record.endAt, record.deadlineAt, record.updatedAt, storedAt, storedAt, storedAt, record.lifecycle, record.locationText, record.latitude, record.longitude, record.contentFingerprint, record.fieldConfidence, record.recordPayload));
    if (changed) {
      const current = fingerprintInput(record);
      const prior = existing ? priorVersionValues(existing) : {};
      writes.push(db.prepare("INSERT OR IGNORE INTO record_versions (version_id, record_id, content_fingerprint, captured_at, changed_fields, prior_values, current_values) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(`${record.recordId}:${record.contentFingerprint}`, record.recordId, record.contentFingerprint, storedAt, JSON.stringify(changedFields(prior, current)), JSON.stringify(prior), JSON.stringify(current)));
    }
  }

  const lastSuccessfulAt = payload.mode === "live" ? storedAt : previousCache?.lastSuccessfulAt ?? null;
  writes.push(db.prepare("INSERT INTO live_payload_cache (cache_key, payload, created_at, last_successful_at) VALUES (?, ?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, created_at = excluded.created_at, last_successful_at = excluded.last_successful_at")
    .bind(CACHE_KEY, JSON.stringify(merged.payload), storedAt, lastSuccessfulAt));
  await db.batch(writes);
  return {
    storedAt,
    recordCount: records.length,
    changedRecordCount,
    preservedRecordCount: merged.preservedRecordCount,
  };
}

export async function readCachedLiveDataPayload(
  staleAfterMs = DEFAULT_STALE_AFTER_MS,
): Promise<CachedLiveDataPayload | null> {
  try {
    const db = database();
    if (!db || !(await initializeLiveStore(db))) return null;
    const cached = await rawCachedPayload(db);
    if (!cached) return null;
    const now = Date.now();
    const safeStaleAfterMs = Math.max(60_000, staleAfterMs);
    const rows = await db.prepare("SELECT source_id, status, completed_at, last_successful_collection FROM (SELECT source_id, status, completed_at, last_successful_collection, ROW_NUMBER() OVER (PARTITION BY source_id ORDER BY completed_at DESC, run_id DESC) AS row_rank FROM source_runs) WHERE row_rank = 1 ORDER BY source_id")
      .all<{ source_id: string; status: LiveSourceStatus["state"]; completed_at: string; last_successful_collection: string | null }>();
    const sources = (rows.results ?? []).map((row): SourceFreshness => {
      const lastSuccess = row.last_successful_collection ? Date.parse(row.last_successful_collection) : Number.NaN;
      return {
        sourceId: row.source_id,
        state: row.status,
        lastAttemptAt: row.completed_at,
        lastSuccessfulAt: row.last_successful_collection,
        stale: row.status === "failed" || !Number.isFinite(lastSuccess) || now - lastSuccess > safeStaleAfterMs,
      };
    });
    const created = Date.parse(cached.createdAt);
    const ageMs = Number.isFinite(created) ? Math.max(0, now - created) : Number.POSITIVE_INFINITY;
    return {
      ...cached.payload,
      cache: {
        storedAt: cached.createdAt,
        lastSuccessfulAt: cached.lastSuccessfulAt,
        ageSeconds: Number.isFinite(ageMs) ? Math.floor(ageMs / 1000) : Number.MAX_SAFE_INTEGER,
        staleAfterSeconds: Math.floor(safeStaleAfterMs / 1000),
        stale: ageMs > safeStaleAfterMs || sources.some((source) => source.stale),
        sources,
      },
    };
  } catch {
    return null;
  }
}

async function tokenDigest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

export async function authorizeIngestionRequest(request: Request): Promise<"authorized" | "missing-secret" | "denied"> {
  const expected = process.env.INGEST_SECRET?.trim();
  if (!expected) return "missing-secret";
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) return "denied";
  const [left, right] = await Promise.all([tokenDigest(match[1]), tokenDigest(expected)]);
  if (left.length !== right.length) return "denied";
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0 ? "authorized" : "denied";
}

export async function claimLiveIngestion(): Promise<boolean> {
  try {
    const db = database();
    if (!db || !(await initializeLiveStore(db))) return false;
    const now = Date.now();
    const configured = Number(process.env.INGEST_MIN_INTERVAL_SECONDS);
    const cooldownMs = Number.isFinite(configured)
      ? Math.max(10, Math.min(3600, configured)) * 1000
      : DEFAULT_INGESTION_COOLDOWN_MS;
    const result = await db.prepare("INSERT INTO ingestion_locks (lock_name, expires_at, last_started_at) VALUES (?, ?, ?) ON CONFLICT(lock_name) DO UPDATE SET expires_at = excluded.expires_at, last_started_at = excluded.last_started_at WHERE ingestion_locks.expires_at <= ? AND ingestion_locks.last_started_at <= ?")
      .bind(INGESTION_LOCK_NAME, now + INGESTION_LEASE_MS, now, now, now - cooldownMs)
      .run();
    return (result.meta.changes ?? 0) === 1;
  } catch {
    return false;
  }
}

export async function releaseLiveIngestion(): Promise<void> {
  try {
    const db = database();
    if (!db) return;
    await db.prepare("UPDATE ingestion_locks SET expires_at = 0 WHERE lock_name = ?")
      .bind(INGESTION_LOCK_NAME)
      .run();
  } catch {
    // The short lease expires automatically; never replace an ingestion result
    // with a lock-cleanup failure.
  }
}
