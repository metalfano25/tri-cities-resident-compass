import assert from "node:assert/strict";
import test from "node:test";

const codexPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])[^>]*>/i;

async function render(path = "/", environment = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
      ...environment,
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

function createMockDb() {
  const cache = new Map();
  const locks = new Set();
  const usage = new Map();
  const prepare = (sql) => {
    let values = [];
    const statement = {
      bind(...next) { values = next; return statement; },
      async first() {
        if (sql.startsWith("SELECT payload FROM insight_cache")) {
          const row = cache.get(values[0]);
          return row && row.expiresAt > values[1] ? { payload: row.payload } : null;
        }
        return null;
      },
      async run() {
        if (sql.startsWith("INSERT OR IGNORE INTO insight_locks")) {
          if (locks.has(values[0])) return { meta: { changes: 0 } };
          locks.add(values[0]);
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith("DELETE FROM insight_locks WHERE cache_key")) {
          const changed = locks.delete(values[0]);
          return { meta: { changes: changed ? 1 : 0 } };
        }
        if (sql.startsWith("DELETE FROM insight_locks")) return { meta: { changes: 0 } };
        if (sql.startsWith("INSERT INTO insight_usage")) {
          const calls = usage.get(values[0]) ?? 0;
          if (calls >= values[2]) return { meta: { changes: 0 } };
          usage.set(values[0], calls + 1);
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith("INSERT INTO insight_cache")) {
          cache.set(values[0], { payload: values[1], expiresAt: values[3] });
          return { meta: { changes: 1 } };
        }
        return { meta: { changes: 0 } };
      },
    };
    return statement;
  };
  return { prepare, async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); } };
}

function countMatches(value, pattern) {
  return [...value.matchAll(pattern)].length;
}

function assertOfficialLink(html, hostname) {
  const escapedHostname = hostname.replaceAll(".", "\\.");
  const link = new RegExp(
    `<a\\b[^>]*\\bhref=["']https:\\/\\/(?:[a-z0-9-]+\\.)*${escapedHostname}(?=[\\/:?#"'])[^"']*["'][^>]*>`,
    "i",
  );
  assert.match(html, link, `expected an official HTTPS link to ${hostname}`);
}

test("server-renders the complete resident-facing MVP", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.ok(html.trim().length > 0, "expected a non-empty HTML response");

  assert.match(
    html,
    /<title>[^<]*Tri-Cities Resident Compass[^<]*<\/title>/i,
  );
  assert.doesNotMatch(html, codexPreviewMeta);
  assert.doesNotMatch(
    html,
    /<title>[^<]*(?:Your site is taking shape|Starter Project)[^<]*<\/title>/i,
  );

  assert.match(html, /(?:What affects (?:me|you) (?:today|now)|Your cities\.\s*In signal)/i);
  assert.match(html, />\s*Today\s*</i);
  assert.match(html, />\s*This week\s*</i);
  assert.match(html, /Resident shortcuts/i);

  assert.match(html, /Geneva/i);
  assert.match(html, /Batavia/i);
  assert.match(html, /St\.\s*Charles/i);

  assert.match(html, /(?:independent|not an official government site)/i);
  assert.match(
    html,
    /(?:not an emergency alert(?:\s+(?:service|system))?\s+replacement|not a replacement for (?:official )?emergency alerts?)/i,
  );
  assert.match(html, /\b911\b/);

  assertOfficialLink(html, "geneva.il.us");
  assertOfficialLink(html, "bataviail.gov");
  assertOfficialLink(html, "stcharlesil.gov");
  assertOfficialLink(html, "kanecountyil.gov");

  assert.equal(
    countMatches(html, /<main\b[^>]*>/gi),
    1,
    "expected one main landmark",
  );
  assert.ok(
    countMatches(html, /<header\b[^>]*>/gi) >= 1,
    "expected a header landmark",
  );
  assert.ok(
    countMatches(html, /<footer\b[^>]*>/gi) >= 1,
    "expected a footer landmark",
  );
  assert.match(
    html,
    /<nav\b(?=[^>]*\baria-(?:label|labelledby)=["'][^"']+["'])[^>]*>/i,
  );
  assert.equal(
    countMatches(html, /<h1\b[^>]*>\s*(?!<\/h1>)[\s\S]*?<\/h1>/gi),
    1,
    "expected one non-empty h1",
  );

  assert.doesNotMatch(
    html,
    /Codex is working|Your site is taking shape|Codex is building the first version|sites-skeleton|react-loading-skeleton/i,
  );
});

test("normalizes live official sources for all three communities", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalDailyLimit = process.env.AI_DAILY_CALL_LIMIT;
  let modelCalls = 0;
  let modelRecordTitles = [];
  const recent = new Date(Date.now() - 86_400_000);
  const future = new Date(Date.now() + 3 * 86_400_000);
  const futureEnd = new Date(future.getTime() + 3_600_000);
  const month = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(future);
  const recentMonth = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(recent);
  const shortMonth = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(future);
  const day = future.getUTCDate();
  const year = future.getUTCFullYear();
  const compactUtc = (date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const rssNotice = (title) => `<?xml version="1.0"?><rss><channel><item><title>${title}</title><link>https://www.geneva.il.us/CivicAlerts.aspx?aid=1</link><pubDate>${recent.toUTCString()}</pubDate><description>Official resident update.</description><guid>${title}</guid></item></channel></rss>`;
  const rssEvent = `<?xml version="1.0"?><rss xmlns:calendarEvent="https://www.geneva.il.us/Calendar.aspx"><channel><item><title>Geneva future event</title><link>https://www.geneva.il.us/Calendar.aspx?EID=1</link><description>&lt;strong&gt;Event date:&lt;/strong&gt; ${month} ${day}, ${year} &lt;br&gt;&lt;strong&gt;Event Time:&lt;/strong&gt; 09:00 AM - 02:00 PM</description><calendarEvent:EventDates>${month} ${day}, ${year}</calendarEvent:EventDates><calendarEvent:EventTimes>09:00 AM - 02:00 PM</calendarEvent:EventTimes><calendarEvent:Location>Geneva, IL</calendarEvent:Location><guid>geneva-event-1</guid></item></channel></rss>`;
  const ics = (title, uid) => `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:${uid}\r\nDTSTART:${compactUtc(future)}\r\nDTEND:${compactUtc(futureEnd)}\r\nSUMMARY:${title}\r\nDESCRIPTION:Official calendar event\r\nLOCATION:Batavia, IL\r\nURL:https://www.bataviail.gov/events\r\nEND:VEVENT\r\nEND:VCALENDAR`;
  const bataviaLive = `<script>},12632167,"Traffic alert: Main Street will close for water service work on Monday.","City of Batavia",123,"1 day ago","https://example.invalid/avatar","${recent.toISOString()}"</script>`;
  const stCharlesEvent = `<div class="list-item-container"><article><a href="https://www.stcharlesil.gov/News-Events/Future-Event"><h2 class="list-item-title">St. Charles future event</h2><span class="part-date">${day}</span><span class="part-month">${shortMonth}</span><span class="part-year">${year}</span><span class="list-item-block-desc">Official event description.</span><p class="list-item-address">St. Charles, IL</p><p class="tagged-as-list">Festivals or Events</p></a></article></div>`;
  const stCharlesNews = `<div class="list-item-container"><article><a href="https://www.stcharlesil.gov/News-Events/Deck-Fire"><h2 class="list-item-title">Deck Fire</h2><p class="published-on">Published on ${recentMonth} ${recent.getUTCDate()}, ${recent.getUTCFullYear()}</p><p>The fire department responded to a deck fire.</p></a></article></div>`;

  globalThis.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === "https://api.openai.com/v1/responses") {
      modelCalls += 1;
      const requestBody = JSON.parse(String(init?.body ?? "{}"));
      const records = JSON.parse(String(requestBody.input).replace(/^SOURCE_RECORDS\n/, ""));
      modelRecordTitles = records.map((record) => record.title);
      const insights = records.slice(0, 3).map((record, index) => ({
        itemId: record.id,
        impact: index === 1 ? "undocumented residents may be targeted by enforcement." : index === 2 ? "5,000 commuters will definitely face major delays." : `${record.community} residents may need to plan around this official update.`,
        inference: index === 1 ? "enforcement could increase because of this notice." : index === 2 ? "This will cause a severe economic impact." : "The practical effect may be limited to the named area or service.",
        unknown: "The excerpt does not establish the full duration or scale, so later changes may not be reflected.",
        affectedCode: "general_residents",
        actionCode: "verify_source",
        confirmedFact: "Fabricated model-authored fact that must never be displayed as confirmed.",
      }));
      return Response.json({ output: [{ content: [{ type: "output_text", text: JSON.stringify({ insights }) }] }] });
    }
    if (url.includes("Geneva-Special-Events")) return new Response(rssEvent, { status: 200 });
    if (url.includes("geneva.il.us/RSSFeed")) return new Response(rssNotice(url.includes("Road-Construction") ? "Geneva road update" : "Geneva city update"), { status: 200 });
    if (url.includes("generate_ical")) return new Response(ics("Batavia city event", "batavia-city-1"), { status: 200 });
    if (url.includes("bataviaparks.org")) return new Response(ics("Batavia park event", "batavia-park-1"), { status: 200 });
    if (url.includes("bataviail.gov/live-feed")) return new Response(bataviaLive, { status: 200 });
    if (url.includes("stcharlesil.gov/News-Events/City-Events")) return new Response(stCharlesEvent, { status: 200 });
    if (url.includes("stcharlesil.gov/News-Events/City-News-Alerts")) return new Response(stCharlesNews, { status: 200 });
    return new Response("Not found", { status: 404 });
  };

  try {
    const response = await render("/api/live");
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^application\/json\b/i);
    const payload = await response.json();
    assert.equal(payload.mode, "live");
    for (const community of ["geneva", "batavia", "st-charles"]) {
      assert.ok(payload.notices.some((item) => item.communityId === community), `${community} notice missing`);
      assert.ok(payload.events.some((item) => item.communityId === community), `${community} event missing`);
    }
    assert.ok(payload.sources.every((source) => source.state === "ok"));

    const noKeyResponse = await render("/api/insights?community=all", { DB: createMockDb() });
    assert.equal(noKeyResponse.status, 200);
    assert.equal((await noKeyResponse.json()).mode, "rules");

    process.env.OPENAI_API_KEY = "test-key";
    process.env.AI_DAILY_CALL_LIMIT = "1";
    const insightDb = createMockDb();
    const insightResponse = await render("/api/insights?community=all", { DB: insightDb });
    assert.equal(insightResponse.status, 200);
    const insightPayload = await insightResponse.json();
    assert.equal(insightPayload.mode, "ai");
    assert.equal(insightPayload.insights.length, 1, "unsafe model claims should be rejected");
    assert.ok(insightPayload.insights.every((item) => item.sourceUrl.startsWith("https://")));
    assert.ok(insightPayload.insights.every((item) => item.confirmedFact && item.inference && item.unknown));
    assert.ok(insightPayload.insights.every((item) => !item.confirmedFact.includes("Fabricated")));
    assert.ok(!modelRecordTitles.includes("Deck Fire"), "high-risk records should bypass ordinary AI analysis");
    assert.equal(modelCalls, 1);

    const cachedResponse = await render("/api/insights?community=all", { DB: insightDb });
    assert.equal((await cachedResponse.json()).mode, "ai");
    assert.equal(modelCalls, 1, "identical insight requests should use the durable cache");

    const budgetResponse = await render("/api/insights?community=geneva", { DB: insightDb });
    assert.equal((await budgetResponse.json()).mode, "rules");
    assert.equal(modelCalls, 1, "daily circuit breaker should prevent another model call");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalApiKey;
    if (originalDailyLimit === undefined) delete process.env.AI_DAILY_CALL_LIMIT;
    else process.env.AI_DAILY_CALL_LIMIT = originalDailyLimit;
  }
});
