import type { InsightPayload } from "./insight-types";

declare global {
  var __TRI_CITIES_ENV__: { DB?: D1Database } | undefined;
}

const CACHE_TTL_MS = 30 * 60 * 1000;
const LOCK_TTL_MS = 30 * 1000;

async function initialize() {
  const db = globalThis.__TRI_CITIES_ENV__?.DB;
  if (!db) return false;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS insight_cache (cache_key TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS insight_locks (cache_key TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS insight_usage (day TEXT PRIMARY KEY, calls INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS insight_cache_expiry_idx ON insight_cache (expires_at)"),
  ]);
  return true;
}

export async function readInsightCache(cacheKey: string): Promise<InsightPayload | null> {
  try {
    if (!(await initialize())) return null;
    const db = globalThis.__TRI_CITIES_ENV__!.DB!;
    const row = await db.prepare("SELECT payload FROM insight_cache WHERE cache_key = ? AND expires_at > ?")
      .bind(cacheKey, Date.now())
      .first<{ payload: string }>();
    if (!row) return null;
    const parsed = JSON.parse(row.payload) as InsightPayload;
    return parsed?.mode === "ai" && Array.isArray(parsed.insights) ? parsed : null;
  } catch {
    return null;
  }
}

export async function claimInsightGeneration(cacheKey: string, dailyLimit: number): Promise<boolean> {
  try {
    if (!(await initialize())) return false;
    const db = globalThis.__TRI_CITIES_ENV__!.DB!;
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    await db.prepare("DELETE FROM insight_locks WHERE expires_at <= ?").bind(now).run();
    const lock = await db.prepare("INSERT OR IGNORE INTO insight_locks (cache_key, expires_at) VALUES (?, ?)")
      .bind(cacheKey, now + LOCK_TTL_MS)
      .run();
    if ((lock.meta.changes ?? 0) !== 1) return false;
    const usage = await db.prepare("INSERT INTO insight_usage (day, calls, updated_at) VALUES (?, 1, ?) ON CONFLICT(day) DO UPDATE SET calls = calls + 1, updated_at = excluded.updated_at WHERE calls < ?")
      .bind(day, now, dailyLimit)
      .run();
    if ((usage.meta.changes ?? 0) !== 1) {
      await releaseInsightLock(cacheKey);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function writeInsightCache(cacheKey: string, payload: InsightPayload): Promise<void> {
  try {
    if (!(await initialize())) return;
    const db = globalThis.__TRI_CITIES_ENV__!.DB!;
    const now = Date.now();
    await db.prepare("INSERT INTO insight_cache (cache_key, payload, created_at, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET payload = excluded.payload, created_at = excluded.created_at, expires_at = excluded.expires_at")
      .bind(cacheKey, JSON.stringify(payload), now, now + CACHE_TTL_MS)
      .run();
  } catch {
    // A cache failure must not affect the official-data experience.
  }
}

export async function releaseInsightLock(cacheKey: string): Promise<void> {
  try {
    const db = globalThis.__TRI_CITIES_ENV__?.DB;
    if (!db) return;
    await db.prepare("DELETE FROM insight_locks WHERE cache_key = ?").bind(cacheKey).run();
  } catch {
    // Expiring locks recover automatically.
  }
}
