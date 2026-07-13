import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

function createPersistenceDb() {
  const records = new Map();
  const versions = new Map();
  const runs = [];
  const cache = new Map();
  const recordWrites = new Map();
  const prepare = (sql) => {
    let values = [];
    const statement = {
      bind(...next) { values = next; return statement; },
      async first() {
        if (sql.startsWith("SELECT payload, created_at")) return cache.get(values[0]) ?? null;
        if (sql.startsWith("SELECT last_successful_collection FROM source_runs")) {
          const run = [...runs].reverse().find((item) => item.source_id === values[0] && item.last_successful_collection);
          return run ? { last_successful_collection: run.last_successful_collection } : null;
        }
        if (sql.startsWith("SELECT record_id, source_id")) return records.get(values[0]) ?? null;
        return null;
      },
      async all() {
        if (!sql.startsWith("SELECT source_id, status")) return { results: [] };
        const latest = new Map();
        for (const run of runs) latest.set(run.source_id, run);
        return { results: [...latest.values()].sort((a, b) => a.source_id.localeCompare(b.source_id)) };
      },
      async run() {
        if (sql.startsWith("INSERT INTO source_runs")) {
          runs.push({ source_id: values[1], completed_at: values[6], status: values[7], last_successful_collection: values[11] });
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith("INSERT INTO source_records")) {
          const prior = records.get(values[0]);
          records.set(values[0], {
            record_id: values[0], source_id: values[2], publisher: values[3], canonical_url: values[4],
            community: values[5], affected_area: values[6], record_type: values[7], topic_tags: values[8],
            title: values[9], factual_excerpt: values[10], published_at: values[11], start_at: values[12],
            end_at: values[13], deadline_at: values[14], updated_at: values[15],
            first_seen_at: prior?.first_seen_at ?? values[16], last_seen_at: values[17],
            content_changed_at: prior?.content_fingerprint === values[23] ? prior.content_changed_at : values[18],
            lifecycle: values[19], location_text: values[20], latitude: values[21], longitude: values[22],
            content_fingerprint: values[23], field_confidence: values[24], record_payload: values[25],
          });
          recordWrites.set(values[0], (recordWrites.get(values[0]) ?? 0) + 1);
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith("INSERT OR IGNORE INTO record_versions")) {
          if (!versions.has(values[0])) versions.set(values[0], { recordId: values[1], capturedAt: values[3] });
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith("INSERT INTO live_payload_cache")) {
          cache.set(values[0], { payload: values[1], created_at: values[2], last_successful_at: values[3] });
          return { meta: { changes: 1 } };
        }
        return { meta: { changes: 0 } };
      },
    };
    return statement;
  };
  return {
    records, versions, runs, cache, recordWrites, prepare,
    async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); },
  };
}

function source(sourceId, communityId, state = "ok") {
  return {
    id: sourceId, sourceId, communityId,
    name: sourceId.startsWith("st-charles") ? "City of St. Charles" : `Publisher ${communityId}`,
    url: `https://example.test/${sourceId}`, state, itemCount: state === "ok" ? 1 : 0,
    checkedAt: new Date().toISOString(),
  };
}

function notice(sourceId, communityId, id, summary = "Official source detail") {
  return {
    id, sourceId, communityId, kind: "city-news", title: `${communityId} notice`, summary,
    canonicalUrl: `https://example.test/${sourceId}/${id}`,
    sourceName: sourceId.startsWith("st-charles") ? "City of St. Charles" : `Publisher ${communityId}`,
    publishedAt: new Date().toISOString(), lifecycle: "unknown", fetchedAt: new Date().toISOString(),
  };
}

function event(sourceId, communityId, id) {
  return {
    id, sourceId, communityId, title: `${communityId} event`, summary: "Official event detail",
    canonicalUrl: `https://example.test/${sourceId}/${id}`,
    sourceName: sourceId.startsWith("st-charles") ? "City of St. Charles" : `Publisher ${communityId}`,
    startAt: new Date(Date.now() + 86_400_000).toISOString(), dateLabel: "Tomorrow", timeLabel: "10:00 AM",
    location: communityId, category: "event", lifecycle: "upcoming", fetchedAt: new Date().toISOString(),
  };
}

function payload({ notices = [], events = [], sources = [], mode = "live" }) {
  return { notices, events, sources, generatedAt: new Date().toISOString(), mode };
}

async function requestRoute(path, environment = {}, init = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("live-store-test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${path}`, init),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) }, ...environment },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

async function requestIngest(method = "POST", authorization, environment = {}) {
  const headers = authorization ? { authorization } : {};
  return requestRoute("/api/ingest", environment, { method, headers });
}

function createReadDb(cachedPayload = null, lockChanges = 0) {
  const createdAt = new Date().toISOString();
  const prepare = (sql) => {
    const statement = {
      bind() { return statement; },
      async first() {
        if (sql.startsWith("SELECT payload, created_at, last_successful_at FROM live_payload_cache") && cachedPayload) {
          return { payload: JSON.stringify(cachedPayload), created_at: createdAt, last_successful_at: createdAt };
        }
        return null;
      },
      async all() { return { results: [] }; },
      async run() {
        if (sql.startsWith("INSERT INTO ingestion_locks")) return { meta: { changes: lockChanges } };
        return { meta: { changes: 0 } };
      },
    };
    return statement;
  };
  return {
    prepare,
    async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); },
  };
}

test("ingestion fails closed when its server secret is absent", async () => {
  const original = process.env.INGEST_SECRET;
  delete process.env.INGEST_SECRET;
  try {
    const response = await requestIngest();
    assert.equal(response.status, 503);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/i);
    assert.deepEqual(await response.json(), { error: "Ingestion is not configured." });
  } finally {
    if (original === undefined) delete process.env.INGEST_SECRET;
    else process.env.INGEST_SECRET = original;
  }
});

test("ingestion accepts credentials only in a bearer authorization header", async () => {
  const original = process.env.INGEST_SECRET;
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  process.env.INGEST_SECRET = "configured-test-secret";
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    throw new Error("unauthorized ingestion must not reach an upstream source");
  };
  try {
    const missing = await requestIngest();
    assert.equal(missing.status, 401);
    const wrong = await requestIngest("POST", "Bearer wrong-secret");
    assert.equal(wrong.status, 401);
    const queryToken = await (async () => {
      const workerUrl = new URL("../dist/server/index.js", import.meta.url);
      workerUrl.searchParams.set("query-token-test", `${process.pid}-${Date.now()}`);
      const { default: worker } = await import(workerUrl.href);
      return worker.fetch(
        new Request("http://localhost/api/ingest?token=configured-test-secret", { method: "POST" }),
        { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
        { waitUntil() {}, passThroughOnException() {} },
      );
    })();
    assert.equal(queryToken.status, 401);
    assert.equal(upstreamCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (original === undefined) delete process.env.INGEST_SECRET;
    else process.env.INGEST_SECRET = original;
  }
});

test("ingestion endpoint is POST-only", async () => {
  const response = await requestIngest("GET");
  assert.equal(response.status, 405);
});

test("public live and insight reads never bootstrap collection on an empty D1 cache", async () => {
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    throw new Error("public reads must not contact upstream sources");
  };
  try {
    const db = createReadDb();
    const live = await requestRoute("/api/live?refresh=1", { DB: db });
    assert.equal(live.status, 503);
    assert.match(live.headers.get("cache-control") ?? "", /no-store/i);
    const insights = await requestRoute("/api/insights?community=all", { DB: db });
    assert.equal(insights.status, 503);
    assert.equal(upstreamCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("public live and insight reads reuse a populated D1 snapshot without collection", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.OPENAI_API_KEY;
  let upstreamCalls = 0;
  delete process.env.OPENAI_API_KEY;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    throw new Error("cached reads must not contact upstream sources");
  };
  const now = new Date().toISOString();
  const payload = {
    notices: [{
      id: "cached-notice",
      sourceId: "geneva-city-news",
      communityId: "geneva",
      kind: "city-news",
      title: "Cached official notice",
      summary: "A previously collected official notice.",
      canonicalUrl: "https://www.geneva.il.us/CivicAlerts.aspx?AID=1",
      sourceName: "City of Geneva — City News",
      publishedAt: now,
      lifecycle: "unknown",
      fetchedAt: now,
    }],
    events: [],
    sources: [],
    generatedAt: now,
    mode: "live",
  };
  try {
    const db = createReadDb(payload);
    const live = await requestRoute("/api/live?refresh=1", { DB: db });
    assert.equal(live.status, 200);
    assert.equal((await live.json()).notices[0].id, "cached-notice");
    const insights = await requestRoute("/api/insights?community=all", { DB: db });
    assert.equal(insights.status, 200);
    assert.equal((await insights.json()).mode, "rules");
    assert.equal(upstreamCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
  }
});

test("the UI refresh control rereads the cache-only live endpoint", async () => {
  const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(pageSource, /fetch\("\/api\/live"/);
  assert.doesNotMatch(pageSource, /\/api\/live\?refresh=1/);
});

test("ingestion cooldown rejects an authenticated replay before upstream collection", async () => {
  const original = process.env.INGEST_SECRET;
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  process.env.INGEST_SECRET = "configured-test-secret";
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    throw new Error("cooldown rejection must happen before collection");
  };
  try {
    const response = await requestIngest(
      "POST",
      "Bearer configured-test-secret",
      { DB: createReadDb(null, 0) },
    );
    assert.equal(response.status, 409);
    assert.equal(response.headers.get("retry-after"), "60");
    assert.equal(upstreamCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (original === undefined) delete process.env.INGEST_SECRET;
    else process.env.INGEST_SECRET = original;
  }
});

test("St. Charles failure preserves only the failed source without advancing its ledger record", async () => {
  const db = createPersistenceDb();
  const original = globalThis.__TRI_CITIES_ENV__;
  globalThis.__TRI_CITIES_ENV__ = { DB: db };
  const { persistLiveDataPayload, readCachedLiveDataPayload } = await import("../lib/live-store.ts");
  try {
    const eventSource = source("st-charles-events", "st-charles");
    const newsSource = source("st-charles-news", "st-charles");
    const cityEvent = event(eventSource.sourceId, "st-charles", "event-1");
    const cityNotice = notice(newsSource.sourceId, "st-charles", "notice-1");
    const first = await persistLiveDataPayload(payload({
      events: [cityEvent], notices: [cityNotice], sources: [eventSource, newsSource],
    }));
    assert.equal(first.changedRecordCount, 2);
    const eventRecordId = "event:st-charles:event-1";
    const firstLastSeen = db.records.get(eventRecordId).last_seen_at;

    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await persistLiveDataPayload(payload({
      notices: [cityNotice],
      sources: [{ ...eventSource, state: "failed", itemCount: 0 }, newsSource],
      mode: "partial",
    }));
    const cached = await readCachedLiveDataPayload(60_000);

    assert.equal(second.preservedRecordCount, 1);
    assert.ok(cached.events.some((item) => item.sourceId === eventSource.sourceId));
    assert.equal(db.records.get(eventRecordId).last_seen_at, firstLastSeen);
    assert.equal(db.recordWrites.get(eventRecordId), 1, "preserved records must not be written again");
    assert.equal(db.versions.size, 2, "unchanged and preserved records must not create versions");
  } finally {
    globalThis.__TRI_CITIES_ENV__ = original;
  }
});

test("absent community sources carry forward publicly while a real change creates one version", async () => {
  const db = createPersistenceDb();
  const original = globalThis.__TRI_CITIES_ENV__;
  globalThis.__TRI_CITIES_ENV__ = { DB: db };
  const { persistLiveDataPayload, readCachedLiveDataPayload } = await import("../lib/live-store.ts");
  try {
    const genevaSource = source("geneva-city-news", "geneva");
    const bataviaSource = source("batavia-city-live-feed", "batavia");
    const genevaNotice = notice(genevaSource.sourceId, "geneva", "geneva-1");
    const bataviaNotice = notice(bataviaSource.sourceId, "batavia", "batavia-1");
    await persistLiveDataPayload(payload({
      notices: [genevaNotice, bataviaNotice], sources: [genevaSource, bataviaSource],
    }));
    const genevaRecordId = "notice:geneva:geneva-1";
    const genevaLastSeen = db.records.get(genevaRecordId).last_seen_at;

    await new Promise((resolve) => setTimeout(resolve, 5));
    const unchanged = await persistLiveDataPayload(payload({
      notices: [bataviaNotice], sources: [bataviaSource], mode: "partial",
    }));
    assert.equal(unchanged.changedRecordCount, 0);
    assert.equal(db.versions.size, 2);
    assert.equal(db.records.get(genevaRecordId).last_seen_at, genevaLastSeen);
    assert.equal(db.recordWrites.get(genevaRecordId), 1);
    let cached = await readCachedLiveDataPayload(60_000);
    assert.ok(cached.notices.some((item) => item.sourceId === genevaSource.sourceId));
    assert.equal(cached.sources.find((item) => item.sourceId === genevaSource.sourceId)?.state, "failed");

    await new Promise((resolve) => setTimeout(resolve, 5));
    const changedNotice = { ...bataviaNotice, summary: "Official source detail changed" };
    const changed = await persistLiveDataPayload(payload({
      notices: [changedNotice], sources: [bataviaSource], mode: "partial",
    }));
    cached = await readCachedLiveDataPayload(60_000);
    assert.equal(changed.changedRecordCount, 1);
    assert.equal(db.versions.size, 3, "one changed observation should add exactly one version");
    assert.ok(cached.notices.some((item) => item.sourceId === genevaSource.sourceId));
    assert.equal(db.records.get(genevaRecordId).last_seen_at, genevaLastSeen);
  } finally {
    globalThis.__TRI_CITIES_ENV__ = original;
  }
});
