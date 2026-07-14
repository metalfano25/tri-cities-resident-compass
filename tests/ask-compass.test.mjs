import assert from "node:assert/strict";
import test from "node:test";

const NOW = "2026-07-13T17:00:00.000Z";

function payload() {
  return {
    generatedAt: NOW,
    mode: "live",
    sources: [],
    notices: [{
      id: "lane-closure",
      sourceId: "geneva-official",
      communityId: "geneva",
      kind: "traffic",
      title: "Third Street lane closure",
      summary: "The official notice identifies a lane closure on Third Street during scheduled road work.",
      canonicalUrl: "https://www.geneva.il.us/road-work",
      sourceName: "City of Geneva",
      publishedAt: NOW,
      effectiveEndAt: "2026-07-16T05:00:00.000Z",
      lifecycle: "active",
      fetchedAt: NOW,
    }],
    events: [],
  };
}

function cacheOnlyDb(data) {
  const freshAt = new Date().toISOString();
  return {
    prepare(sql) {
      const statement = {
        bind() { return statement; },
        async first() {
          if (sql.startsWith("SELECT payload, created_at")) return { payload: JSON.stringify(data), created_at: freshAt, last_successful_at: freshAt };
          return null;
        },
        async all() { return { results: [] }; },
        async run() { return { meta: { changes: 0 } }; },
      };
      return statement;
    },
    async batch(batch) { return Promise.all(batch.map((statement) => statement.run())); },
  };
}

async function requestAsk(body, headers = { "content-type": "application/json" }) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("ask-test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/api/ask", { method: "POST", headers, body: JSON.stringify(body) }),
    { DB: cacheOnlyDb(payload()), ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("Ask the Compass returns current source-linked matches without claiming AI", async () => {
  const response = await requestAsk({ question: "What road closures are happening in Geneva?", community: "geneva" });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.mode, "verified-search");
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].sourceUrl, "https://www.geneva.il.us/road-work");
  assert.match(result.matches[0].confirmedFact, /lane closure/i);
  assert.ok(!JSON.stringify(result).match(/artificial intelligence|\bAI\b/));
});

test("Ask the Compass routes high-risk questions away from ordinary interpretation", async () => {
  const response = await requestAsk({ question: "What should I do in a medical emergency?" });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.mode, "authoritative-routing");
  assert.equal(result.matches.length, 0);
  assert.match(result.answer, /911/);
});

test("Ask the Compass does not return unrelated records based only on quality score", async () => {
  const response = await requestAsk({ question: "Are there any library poetry readings?" });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.mode, "verified-search");
  assert.equal(result.matches.length, 0);
});

test("Ask the Compass broadly routes urgent health and safety language", async () => {
  for (const question of [
    "What should I do about chest pain?",
    "Where can I get help for domestic violence?",
    "I feel unsafe and need advice",
  ]) {
    const response = await requestAsk({ question });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.mode, "authoritative-routing", question);
    assert.equal(result.matches.length, 0);
  }
});

test("Ask the Compass catches plain-language health and personal-safety questions", async () => {
  for (const question of [
    "What should I do about chest pain?",
    "Where can I get help for domestic violence?",
    "What should I do if I feel unsafe after an assault?",
    "I want to hurt myself and need help",
    "I need a lawyer for a local dispute",
  ]) {
    const response = await requestAsk({ question });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.mode, "authoritative-routing", `expected authoritative routing for: ${question}`);
    assert.deepEqual(result.matches, []);
    assert.match(result.disclaimer, /not rely|authoritative|emergency|medical|safety/i);
  }
});

test("Ask the Compass gives an honest no-evidence result for unrelated questions", async () => {
  const response = await requestAsk({ question: "Are there dinosaur museums with fossil exhibits?" });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.mode, "verified-search");
  assert.deepEqual(result.matches, [], "high source scores must not create a match without a shared query term");
  assert.match(result.answer, /No current verified record/i);
  assert.match(result.answer, /coverage is incomplete/i);
});

test("Ask the Compass rejects contact details and unsupported communities", async () => {
  const privateResponse = await requestAsk({ question: "Email me at resident@example.com about road work" });
  assert.equal(privateResponse.status, 400);
  assert.match(privateResponse.headers.get("cache-control") ?? "", /no-store/i);
  assert.equal(privateResponse.headers.get("x-content-type-options"), "nosniff");
  const unsupported = await requestAsk({ question: "What road work is planned?", community: "aurora" });
  assert.equal(unsupported.status, 400);
  assert.match(unsupported.headers.get("cache-control") ?? "", /no-store/i);
});

test("Ask the Compass enforces its body limit even without Content-Length", async () => {
  const oversizedQuestion = `road ${"work ".repeat(900)}`;
  const response = await requestAsk({ question: oversizedQuestion });
  assert.equal(response.status, 413);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/i);
});
