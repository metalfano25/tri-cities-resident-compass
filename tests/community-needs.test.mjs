import assert from "node:assert/strict";
import test from "node:test";

function createCommunityNeedsDb(seed = []) {
  const records = new Map(seed.map((item) => [item.id, { ...item }]));
  const prepare = (sql) => {
    let values = [];
    const statement = {
      bind(...next) { values = next; return statement; },
      async first() {
        if (sql.startsWith("SELECT id FROM community_needs WHERE fingerprint")) {
          const row = [...records.values()].find((item) => item.fingerprint === values[0]);
          return row ? { id: row.id } : null;
        }
        return null;
      },
      async all() {
        if (!sql.startsWith("SELECT id, community, category")) return { results: [] };
        const limit = Number(values[0] ?? 24);
        return {
          results: [...records.values()]
            .filter((item) => item.status === "approved" || item.status === "resolved")
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .slice(0, limit),
        };
      },
      async run() {
        if (sql.startsWith("INSERT INTO community_needs")) {
          records.set(values[0], {
            id: values[0],
            community: values[1],
            category: values[2],
            summary: values[3],
            approximate_location: values[4],
            resident_impact: values[5],
            status: "pending",
            fingerprint: values[6],
            created_at: values[7],
            updated_at: values[8],
          });
          return { meta: { changes: 1 } };
        }
        return { meta: { changes: 0 } };
      },
    };
    return statement;
  };
  return {
    records,
    prepare,
    async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); },
  };
}

async function requestCommunityNeeds(db, init) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("community-needs-test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/api/community-needs", init),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) }, DB: db },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

const validSubmission = {
  community: "geneva",
  category: "mobility",
  summary: "A safer crossing is needed near the library and the public parking area.",
  approximateLocation: "Library and public parking area",
  residentImpact: "People walking with children have difficulty crossing during busy periods.",
};

test("community needs remain pending and invisible until moderation approves them", async () => {
  const db = createCommunityNeedsDb();
  const submitted = await requestCommunityNeeds(db, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(validSubmission),
  });
  assert.equal(submitted.status, 202);
  assert.match(submitted.headers.get("cache-control") ?? "", /no-store/i);
  const receipt = await submitted.json();
  assert.equal(receipt.accepted, true);
  assert.equal(receipt.status, "pending");
  assert.ok(receipt.id);

  const publicRead = await requestCommunityNeeds(db);
  assert.equal(publicRead.status, 200);
  assert.deepEqual((await publicRead.json()).items, [], "pending resident content must never be publicly returned");

  db.records.get(receipt.id).status = "approved";
  const approvedRead = await requestCommunityNeeds(db);
  const approved = await approvedRead.json();
  assert.equal(approved.items.length, 1);
  assert.equal(approved.items[0].summary, validSubmission.summary);
  assert.equal(approved.items[0].status, "approved");
});

test("community needs reject contact details, resident links, and exact street addresses", async () => {
  const db = createCommunityNeedsDb();
  const unsafeInputs = [
    { ...validSubmission, residentImpact: "Email resident@example.com for details about the neighborhood request." },
    { ...validSubmission, summary: "Please promote https://example.com as the solution to this local service gap." },
    { ...validSubmission, approximateLocation: "123 Main Street" },
    { ...validSubmission, residentImpact: "People have trouble crossing near 123 Main Street during busy periods." },
    { ...validSubmission, summary: "The problem is directly outside 123 Main Street and affects people using the block." },
    { ...validSubmission, residentImpact: "Residents at 456 Wilson Avenue have described difficulty using the nearby route." },
  ];

  for (const input of unsafeInputs) {
    const response = await requestCommunityNeeds(db, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    assert.equal(response.status, 400);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/i);
  }
  assert.equal(db.records.size, 0);
});

test("identical community needs are deduplicated without publishing the original", async () => {
  const db = createCommunityNeedsDb();
  const init = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(validSubmission),
  };
  const first = await requestCommunityNeeds(db, init);
  const firstReceipt = await first.json();
  const duplicate = await requestCommunityNeeds(db, init);
  const duplicateReceipt = await duplicate.json();

  assert.equal(first.status, 202);
  assert.equal(duplicate.status, 200);
  assert.equal(duplicateReceipt.duplicate, true);
  assert.equal(duplicateReceipt.id, firstReceipt.id);
  assert.equal(db.records.size, 1);

  const publicRead = await requestCommunityNeeds(db);
  assert.deepEqual((await publicRead.json()).items, []);
});
