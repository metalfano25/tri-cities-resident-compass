import assert from "node:assert/strict";
import test from "node:test";

const FIXED_NOW = Date.parse("2026-07-12T17:00:00Z");

async function renderLive(path = "/api/live", environment = {}, init = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("lifecycle-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${path}`, init),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) }, ...environment },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

function createLiveMockDb() {
  let livePayload = null;
  let ingestionLocked = false;
  const sourceRuns = [];
  const prepare = (sql) => {
    let values = [];
    const statement = {
      bind(...next) { values = next; return statement; },
      async first() {
        if (sql.startsWith("SELECT payload, created_at, last_successful_at FROM live_payload_cache")) return livePayload;
        if (sql.startsWith("SELECT last_successful_collection FROM source_runs")) {
          const row = [...sourceRuns].reverse().find((item) => item.sourceId === values[0] && item.lastSuccessfulAt);
          return row ? { last_successful_collection: row.lastSuccessfulAt } : null;
        }
        return null;
      },
      async all() {
        if (sql.startsWith("SELECT source_id, status, completed_at, last_successful_collection FROM")) {
          const latest = new Map();
          for (const row of sourceRuns) latest.set(row.sourceId, row);
          return { results: [...latest.values()].map((row) => ({
            source_id: row.sourceId,
            status: row.status,
            completed_at: row.completedAt,
            last_successful_collection: row.lastSuccessfulAt,
          })) };
        }
        return { results: [] };
      },
      async run() {
        if (sql.startsWith("INSERT INTO ingestion_locks")) {
          if (ingestionLocked) return { meta: { changes: 0 } };
          ingestionLocked = true;
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith("UPDATE ingestion_locks SET expires_at = 0")) {
          ingestionLocked = false;
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith("INSERT INTO source_runs")) {
          sourceRuns.push({ sourceId: values[1], completedAt: values[6], status: values[7], lastSuccessfulAt: values[11] });
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith("INSERT INTO live_payload_cache")) {
          livePayload = { payload: values[1], created_at: values[2], last_successful_at: values[3] };
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith("INSERT INTO source_records") || sql.startsWith("INSERT OR IGNORE INTO record_versions")) {
          return { meta: { changes: 1 } };
        }
        return { meta: { changes: 0 } };
      },
    };
    return statement;
  };
  return { prepare, async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); } };
}

async function collectLive() {
  const db = createLiveMockDb();
  const ingestion = await renderLive("/api/ingest", { DB: db }, {
    method: "POST",
    headers: { authorization: "Bearer lifecycle-test-secret" },
  });
  assert.equal(ingestion.status, 200, await ingestion.text());
  return renderLive("/api/live", { DB: db });
}

function rss(items) {
  return `<?xml version="1.0"?><rss><channel>${items.join("")}</channel></rss>`;
}

function rssItem({ title, link, published = "Fri, 03 Jul 2026 14:00:00 GMT", description, extra = "" }) {
  return `<item><title>${title}</title><link>${link}</link><pubDate>${published}</pubDate><description><![CDATA[${description}]]></description><guid>${link}</guid>${extra}</item>`;
}

test("applies effective lifecycle rules and promotes supported meeting notices", async () => {
  const RealDate = globalThis.Date;
  const originalFetch = globalThis.fetch;
  const originalIngestSecret = process.env.INGEST_SECRET;
  class FixedDate extends RealDate {
    constructor(...args) {
      super(...(args.length === 0 ? [FIXED_NOW] : args));
    }
    static now() { return FIXED_NOW; }
  }
  globalThis.Date = FixedDate;
  process.env.INGEST_SECRET = "lifecycle-test-secret";

  const genevaNews = rss([
    rssItem({
      title: "Fourth of July holiday closure",
      link: "https://www.geneva.il.us/CivicAlerts.aspx?AID=holiday",
      description: "City offices were closed on the Fourth of July for the holiday.",
    }),
    rssItem({
      title: "Emergency preparedness notice for July 4",
      link: "https://www.geneva.il.us/CivicAlerts.aspx?AID=emergency",
      description: "Emergency information for July 4 remains available from the official source.",
    }),
    rssItem({
      title: "Water service will be restored July 14",
      link: "https://www.geneva.il.us/CivicAlerts.aspx?AID=future-service",
      description: "The scheduled service work is expected to end on July 14, 2026.",
    }),
  ]);
  const genevaTraffic = rss([
    rssItem({
      title: "Geneva road construction update",
      link: "https://www.geneva.il.us/CivicAlerts.aspx?AID=road",
      published: "Sat, 11 Jul 2026 14:00:00 GMT",
      description: "Review the official road construction update.",
    }),
  ]);
  const genevaEvents = rss([
    rssItem({
      title: "March through August gallery exhibit",
      link: "https://www.geneva.il.us/Calendar.aspx?EID=ongoing",
      published: "Sun, 01 Mar 2026 15:00:00 GMT",
      description: "Event date: March 1 through August 31, 2026\nEvent Time: 9:00 AM\nLocation: Geneva City Hall",
      extra: "<event:startDate>2026-03-01T15:00:00Z</event:startDate><event:endDate>2026-08-31T22:00:00Z</event:endDate>",
    }),
  ]);
  const allDayIcs = `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:all-day-current\r\nDTSTART;VALUE=DATE:20260712\r\nDTEND;VALUE=DATE:20260713\r\nSUMMARY:Batavia all-day event\r\nDESCRIPTION:Official all-day listing\r\nLOCATION:Batavia, IL\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:all-day-expired\r\nDTSTART;VALUE=DATE:20260711\r\nDTEND;VALUE=DATE:20260712\r\nSUMMARY:Batavia expired all-day event\r\nDESCRIPTION:Official expired listing\r\nLOCATION:Batavia, IL\r\nEND:VEVENT\r\nEND:VCALENDAR`;
  const noEndIcs = `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:timed-no-end\r\nDTSTART:20260712T160000Z\r\nSUMMARY:Batavia timed event\r\nDESCRIPTION:Official timed listing without an end time\r\nLOCATION:Batavia, IL\r\nEND:VEVENT\r\nEND:VCALENDAR`;
  const bataviaLive = `<script>},12632167,"The Batavia City Council meeting is July 15, 2026 at 7:00 PM at City Hall. Review the official agenda before attending.","City of Batavia","2026-07-11T14:00:00.000Z"</script>`;
  const stCharlesEvent = `<div class="list-item-container"><article><a href="https://www.stcharlesil.gov/News-Events/Upcoming"><h2 class="list-item-title">St. Charles upcoming event</h2><span class="part-date">14</span><span class="part-month">Jul</span><span class="part-year">2026</span><span class="list-item-block-desc">Official event.</span><p class="list-item-address">St. Charles, IL</p><p class="tagged-as-list">Events</p></a></article></div>`;
  const stCharlesNews = `<div class="list-item-container"><article><a href="https://www.stcharlesil.gov/News-Events/Update"><h2 class="list-item-title">St. Charles city update</h2><p class="published-on">Published on July 11, 2026</p><p>Read the official city service update.</p></a></article></div>`;

  globalThis.fetch = async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("Geneva-Special-Events")) return new Response(genevaEvents);
    if (url.includes("Road-Construction")) return new Response(genevaTraffic);
    if (url.includes("geneva.il.us/RSSFeed")) return new Response(genevaNews);
    if (url.includes("generate_ical")) return new Response(allDayIcs);
    if (url.includes("bataviaparks.org")) return new Response(noEndIcs);
    if (url.includes("bataviail.gov/live-feed")) return new Response(bataviaLive);
    if (url.includes("stcharlesil.gov/News-Events/City-Events")) return new Response(stCharlesEvent);
    if (url.includes("stcharlesil.gov/News-Events/City-News-Alerts")) return new Response(stCharlesNews);
    return new Response("Not found", { status: 404 });
  };

  try {
    const response = await collectLive();
    assert.equal(response.status, 200);
    const payload = await response.json();

    assert.ok(!payload.notices.some((item) => item.title.includes("Fourth of July")), "expired holiday closure must not appear current");
    const emergency = payload.notices.find((item) => item.title.includes("Emergency preparedness"));
    assert.equal(emergency?.lifecycle, "unknown", "high-risk notices must not be suppressed from a text-inferred expiry");
    const futureService = payload.notices.find((item) => item.title.includes("will be restored"));
    assert.equal(futureService?.lifecycle, "upcoming", "future restoration wording must not be treated as already expired");
    const undated = payload.notices.find((item) => item.title.includes("road construction"));
    assert.equal(undated?.lifecycle, "unknown", "publication recency alone must not establish active status");

    const ongoing = payload.events.find((item) => item.title.includes("March through August"));
    assert.equal(ongoing?.lifecycle, "active");
    assert.match(ongoing?.timingLabel ?? "", /^Ongoing through Aug 31, 2026$/);

    const allDay = payload.events.find((item) => item.title === "Batavia all-day event");
    assert.equal(allDay?.lifecycle, "ending-soon");
    assert.equal(allDay?.timingLabel, "Ongoing through Jul 12, 2026", "exclusive DTEND must display the last included day");
    assert.ok(!payload.events.some((item) => item.title === "Batavia expired all-day event"), "an exclusive DTEND at today's midnight must already be expired");
    const timed = payload.events.find((item) => item.title === "Batavia timed event");
    assert.equal(timed?.lifecycle, "ending-soon", "a timed event without DTEND needs a nonzero effective window");

    const meeting = payload.events.find((item) => item.title.includes("City Council meeting"));
    assert.equal(meeting?.communityId, "batavia");
    assert.equal(meeting?.category, "meeting");
    assert.equal(meeting?.startAt, "2026-07-16T00:00:00.000Z");
    assert.equal(meeting?.timeLabel, "7:00 PM");
    assert.ok(!payload.notices.some((item) => item.id === "batavia-live-12632167"), "promoted meeting should not remain duplicated as a notice");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.Date = RealDate;
    if (originalIngestSecret === undefined) delete process.env.INGEST_SECRET;
    else process.env.INGEST_SECRET = originalIngestSecret;
  }
});

test("uses Chicago midnight for all-day feeds and notice activation boundaries", async () => {
  const RealDate = globalThis.Date;
  const originalFetch = globalThis.fetch;
  const originalIngestSecret = process.env.INGEST_SECRET;
  process.env.INGEST_SECRET = "lifecycle-test-secret";
  const fixedDate = (timestamp) => class extends RealDate {
    constructor(...args) {
      super(...(args.length === 0 ? [timestamp] : args));
    }
    static now() { return timestamp; }
  };
  const boundaryNotices = rss([
    rssItem({
      title: "Street closure through July 12, 2026",
      link: "https://www.geneva.il.us/CivicAlerts.aspx?AID=boundary-expiry",
      published: "Sat, 11 Jul 2026 14:00:00 GMT",
      description: "The street closure continues through July 12, 2026.",
    }),
    rssItem({
      title: "Water service scheduled on July 13, 2026",
      link: "https://www.geneva.il.us/CivicAlerts.aspx?AID=boundary-start",
      published: "Sat, 11 Jul 2026 14:00:00 GMT",
      description: "Water service work is scheduled for July 13, 2026.",
    }),
  ]);
  const allDayIcs = `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:midnight-boundary\r\nDTSTART;VALUE=DATE:20260712\r\nDTEND;VALUE=DATE:20260713\r\nSUMMARY:Chicago midnight boundary event\r\nDESCRIPTION:Official all-day listing\r\nLOCATION:Batavia, IL\r\nEND:VEVENT\r\nEND:VCALENDAR`;
  const futureIcs = `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:future-boundary-fixture\r\nDTSTART:20260714T160000Z\r\nDTEND:20260714T170000Z\r\nSUMMARY:Future fixture event\r\nDESCRIPTION:Official future listing\r\nLOCATION:Batavia, IL\r\nEND:VEVENT\r\nEND:VCALENDAR`;

  globalThis.fetch = async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("geneva.il.us/RSSFeed") && !url.includes("Special-Events")) return new Response(boundaryNotices);
    if (url.includes("Geneva-Special-Events")) return new Response(rss([]));
    if (url.includes("generate_ical")) return new Response(allDayIcs);
    if (url.includes("bataviaparks.org")) return new Response(futureIcs);
    if (url.includes("bataviail.gov/live-feed")) return new Response("<html></html>");
    if (url.includes("stcharlesil.gov")) return new Response("<html></html>");
    return new Response("Not found", { status: 404 });
  };

  try {
    // 10:00 PM July 12 in Chicago: UTC has crossed midnight, local time has not.
    globalThis.Date = fixedDate(Date.parse("2026-07-13T03:00:00Z"));
    const beforeMidnight = await (await collectLive()).json();
    assert.ok(beforeMidnight.events.some((item) => item.title === "Chicago midnight boundary event"), "all-day event must remain current until Chicago midnight");
    assert.equal(beforeMidnight.notices.find((item) => item.title.includes("through July 12"))?.lifecycle, "active");
    assert.equal(beforeMidnight.notices.find((item) => item.title.includes("scheduled on July 13"))?.lifecycle, "upcoming", "a July 13 notice must not activate at UTC midnight");

    // 1:00 AM July 13 in Chicago: the local-day boundary has now passed.
    globalThis.Date = fixedDate(Date.parse("2026-07-13T06:00:00Z"));
    const afterMidnight = await (await collectLive()).json();
    assert.ok(!afterMidnight.events.some((item) => item.title === "Chicago midnight boundary event"), "all-day event must expire after Chicago midnight");
    assert.ok(!afterMidnight.notices.some((item) => item.title.includes("through July 12")), "notice must expire after its Chicago-local effective day");
    assert.equal(afterMidnight.notices.find((item) => item.title.includes("scheduled on July 13"))?.lifecycle, "active");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.Date = RealDate;
    if (originalIngestSecret === undefined) delete process.env.INGEST_SECRET;
    else process.env.INGEST_SECRET = originalIngestSecret;
  }
});
