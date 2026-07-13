import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const insightCache = sqliteTable("insight_cache", {
  cacheKey: text("cache_key").primaryKey(),
  payload: text("payload").notNull(),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const insightLocks = sqliteTable("insight_locks", {
  cacheKey: text("cache_key").primaryKey(),
  expiresAt: integer("expires_at").notNull(),
});

export const insightUsage = sqliteTable("insight_usage", {
  day: text("day").primaryKey(),
  calls: integer("calls").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
});

export const sourceRecords = sqliteTable("source_records", {
  recordId: text("record_id").primaryKey(),
  recordFamily: text("record_family").notNull(),
  sourceId: text("source_id").notNull(),
  publisher: text("publisher").notNull(),
  canonicalUrl: text("canonical_url").notNull(),
  community: text("community").notNull(),
  affectedArea: text("affected_area").notNull(),
  recordType: text("record_type").notNull(),
  topicTags: text("topic_tags").notNull().default("[]"),
  title: text("title").notNull(),
  factualExcerpt: text("factual_excerpt").notNull(),
  publishedAt: text("published_at"),
  startAt: text("start_at"),
  endAt: text("end_at"),
  deadlineAt: text("deadline_at"),
  updatedAt: text("updated_at"),
  firstSeenAt: text("first_seen_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
  contentChangedAt: text("content_changed_at").notNull(),
  lifecycle: text("lifecycle").notNull(),
  locationText: text("location_text"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  contentFingerprint: text("content_fingerprint").notNull(),
  fieldConfidence: text("field_confidence").notNull(),
  recordPayload: text("record_payload").notNull(),
}, (table) => [
  index("source_records_source_idx").on(table.sourceId),
  index("source_records_community_lifecycle_idx").on(table.community, table.lifecycle),
  index("source_records_last_seen_idx").on(table.lastSeenAt),
  index("source_records_start_idx").on(table.startAt),
  index("source_records_deadline_idx").on(table.deadlineAt),
  index("source_records_canonical_family_idx").on(table.canonicalUrl, table.recordFamily),
]);

export const recordVersions = sqliteTable("record_versions", {
  versionId: text("version_id").primaryKey(),
  recordId: text("record_id").notNull(),
  contentFingerprint: text("content_fingerprint").notNull(),
  capturedAt: text("captured_at").notNull(),
  changedFields: text("changed_fields").notNull(),
  priorValues: text("prior_values").notNull(),
  currentValues: text("current_values").notNull(),
}, (table) => [
  uniqueIndex("record_versions_record_fingerprint_idx").on(table.recordId, table.contentFingerprint),
  index("record_versions_record_captured_idx").on(table.recordId, table.capturedAt),
]);

export const sourceRuns = sqliteTable("source_runs", {
  runId: text("run_id").primaryKey(),
  sourceId: text("source_id").notNull(),
  community: text("community").notNull(),
  publisher: text("publisher").notNull(),
  canonicalUrl: text("canonical_url").notNull(),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at").notNull(),
  status: text("status").notNull(),
  httpOutcome: text("http_outcome"),
  itemCount: integer("item_count").notNull(),
  parserVersion: text("parser_version").notNull(),
  lastSuccessfulCollection: text("last_successful_collection"),
  diagnosticMessage: text("diagnostic_message"),
}, (table) => [
  index("source_runs_source_completed_idx").on(table.sourceId, table.completedAt),
  index("source_runs_status_completed_idx").on(table.status, table.completedAt),
]);

export const livePayloadCache = sqliteTable("live_payload_cache", {
  cacheKey: text("cache_key").primaryKey(),
  payload: text("payload").notNull(),
  createdAt: text("created_at").notNull(),
  lastSuccessfulAt: text("last_successful_at"),
});

export const ingestionLocks = sqliteTable("ingestion_locks", {
  lockName: text("lock_name").primaryKey(),
  expiresAt: integer("expires_at").notNull(),
  lastStartedAt: integer("last_started_at").notNull(),
});
