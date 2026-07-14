import assert from "node:assert/strict";
import test from "node:test";

const NOW = "2026-07-13T17:00:00.000Z";

function sourceItem(overrides = {}) {
  return {
    sourceId: "geneva-official",
    communityId: "geneva",
    canonicalUrl: "https://www.geneva.il.us/official-record",
    sourceName: "City of Geneva",
    fetchedAt: NOW,
    ...overrides,
  };
}

function fixturePayload() {
  return {
    generatedAt: NOW,
    mode: "live",
    sources: [{
      id: "geneva-official-status",
      sourceId: "geneva-official",
      communityId: "geneva",
      name: "City of Geneva",
      url: "https://www.geneva.il.us/",
      state: "ok",
      itemCount: 8,
      checkedAt: NOW,
    }],
    notices: [
      sourceItem({
        id: "public-hearing",
        kind: "meeting",
        title: "Public hearing accepts resident comments",
        summary: "The official notice announces a public hearing and says residents may submit comments through July 17.",
        publishedAt: "2026-07-12T15:00:00.000Z",
        effectiveEndAt: "2026-07-18T05:00:00.000Z",
        deadlineAt: "2026-07-17T22:00:00.000Z",
        lifecycle: "upcoming",
        canonicalUrl: "https://www.geneva.il.us/hearing",
      }),
      sourceItem({
        id: "road-change",
        kind: "traffic",
        title: "Third Street lane closure",
        summary: "The official notice identifies a lane closure on Third Street during scheduled road work.",
        publishedAt: "2026-07-12T16:00:00.000Z",
        effectiveEndAt: "2026-07-16T05:00:00.000Z",
        lifecycle: "active",
        canonicalUrl: "https://www.geneva.il.us/road-work",
      }),
      sourceItem({
        id: "expired-rfp",
        kind: "city-news",
        title: "Expired request for proposals",
        summary: "The submission deadline for this official request for proposals has passed.",
        publishedAt: "2026-05-01T15:00:00.000Z",
        lifecycle: "expired",
        canonicalUrl: "https://www.geneva.il.us/old-rfp",
      }),
      sourceItem({
        id: "emergency",
        kind: "service",
        title: "Emergency evacuation notice",
        summary: "Residents must follow the current emergency evacuation instructions from the city.",
        publishedAt: "2026-07-13T16:00:00.000Z",
        lifecycle: "active",
        canonicalUrl: "https://www.geneva.il.us/emergency",
      }),
      sourceItem({
        id: "vendor-rfp",
        kind: "city-news",
        title: "Request for proposals for qualified vendors",
        summary: "The city published an official request for proposals and submission instructions for qualified vendors.",
        publishedAt: "2026-07-13T15:00:00.000Z",
        effectiveEndAt: "2026-07-30T05:00:00.000Z",
        deadlineAt: "2026-07-29T22:00:00.000Z",
        lifecycle: "upcoming",
        canonicalUrl: "https://www.geneva.il.us/current-rfp",
      }),
    ],
    events: [
      sourceItem({
        id: "generic-council-meeting",
        title: "City Council meeting",
        summary: "The official calendar lists the regular City Council meeting.",
        startAt: "2026-07-20T00:00:00.000Z",
        dateLabel: "Jul 19, 2026",
        timeLabel: "7:00 PM",
        location: "City Hall",
        category: "meeting",
        lifecycle: "upcoming",
        canonicalUrl: "https://www.geneva.il.us/council-meeting",
      }),
      sourceItem({
        id: "family-registration",
        title: "Youth camp registration",
        summary: "The official park district listing announces youth camp registration for local families.",
        startAt: "2026-07-25T15:00:00.000Z",
        dateLabel: "Jul 25, 2026",
        timeLabel: "10:00 AM",
        location: "Geneva Park District",
        category: "event",
        lifecycle: "upcoming",
        canonicalUrl: "https://www.genevaparks.org/youth-camp",
        sourceId: "geneva-parks",
        sourceName: "Geneva Park District",
      }),
    ],
  };
}

function cacheOnlyDb(payload) {
  const statements = [];
  const freshAt = new Date().toISOString();
  return {
    statements,
    prepare(sql) {
      statements.push(sql);
      const statement = {
        bind() { return statement; },
        async first() {
          if (sql.startsWith("SELECT payload, created_at")) {
            return { payload: JSON.stringify(payload), created_at: freshAt, last_successful_at: freshAt };
          }
          return null;
        },
        async all() {
          if (sql.startsWith("SELECT source_id, status")) {
            return { results: [{ source_id: "geneva-official", status: "ok", completed_at: freshAt, last_successful_collection: freshAt }] };
          }
          return { results: [] };
        },
        async run() { return { meta: { changes: 0 } }; },
      };
      return statement;
    },
    async batch(batch) { return Promise.all(batch.map((statement) => statement.run())); },
  };
}

async function renderQuality(db, path = "/api/quality") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("quality-test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${path}`),
    { DB: db, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("derives source-bound quality-of-life lenses from the durable cache", async () => {
  const db = cacheOnlyDb(fixturePayload());
  const response = await renderQuality(db);
  assert.equal(response.status, 200);
  const payload = await response.json();

  assert.equal(payload.mode, "derived");
  assert.equal(payload.stale, false);
  assert.ok(payload.opportunityCenter.some((item) => item.opportunityCategory === "have-a-say" && item.recordId.endsWith("public-hearing")));
  assert.ok(payload.opportunityCenter.some((item) => item.opportunityCategory === "win-work" && item.recordId.endsWith("vendor-rfp")));
  assert.ok(payload.opportunityCenter.some((item) => item.opportunityCategory === "family-deadlines" && item.recordId.endsWith("family-registration")));
  assert.ok(!payload.opportunityCenter.some((item) => item.recordId.endsWith("generic-council-meeting")), "a meeting without supported public action is not an opportunity");
  assert.ok(payload.decisionDecoder.some((item) => item.recordId.endsWith("generic-council-meeting")), "generic meetings remain visible in Decision Decoder");
  assert.ok(payload.changeMap.some((item) => item.recordId.endsWith("road-change") && item.display === "list"));
  assert.ok(payload.mobility.some((item) => item.recordId.endsWith("road-change")));
  assert.ok(payload.family.some((item) => item.recordId.endsWith("family-registration")));
  assert.ok(payload.localEconomy.some((item) => item.recordId.endsWith("vendor-rfp")));
  assert.ok(!JSON.stringify(payload).includes("expired-rfp"));
  assert.ok(!JSON.stringify(payload).includes("Emergency evacuation"), "high-risk content bypasses ordinary interpretation");

  const allItems = [payload.opportunityCenter, payload.decisionDecoder, payload.changeMap, payload.family, payload.mobility, payload.liveWell, payload.localEconomy].flat();
  assert.ok(allItems.length > 0);
  for (const item of allItems) {
    assert.ok(item.sourceId && item.sourceName && item.canonicalUrl);
    assert.ok(item.lifecycle && item.evidenceLevel && item.confirmedFact && item.cautiousImplication);
    assert.ok(Array.isArray(item.unknowns) && item.unknowns.length > 0);
    assert.ok(Array.isArray(item.audience) && item.audience.length > 0);
    assert.ok(item.action && item.communityId);
    for (const factor of ["localRelevance", "urgency", "actionability", "residentUpside", "evidenceQuality"]) {
      assert.ok(item.scores[factor] >= 0 && item.scores[factor] <= 4, `${factor} must stay within 0-4`);
    }
    assert.equal(item.scores.total, item.scores.localRelevance + item.scores.urgency + item.scores.actionability + item.scores.residentUpside + item.scores.evidenceQuality);
  }
  assert.ok(!db.statements.some((sql) => /^(?:INSERT|UPDATE|DELETE).*\b(?:source_records|source_runs|live_payload_cache)\b/i.test(sql)), "public quality reads must not perform ingestion writes");
});

test("filters quality lenses by community and rejects unsupported values", async () => {
  const db = cacheOnlyDb(fixturePayload());
  const filtered = await renderQuality(db, "/api/quality?community=geneva");
  assert.equal(filtered.status, 200);
  const payload = await filtered.json();
  const allItems = [payload.opportunityCenter, payload.decisionDecoder, payload.changeMap, payload.family, payload.mobility, payload.liveWell, payload.localEconomy].flat();
  assert.ok(allItems.every((item) => item.communityId === "geneva"));

  const invalid = await renderQuality(cacheOnlyDb(fixturePayload()), "/api/quality?community=aurora");
  assert.equal(invalid.status, 400);
});
