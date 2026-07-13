import assert from "node:assert/strict";
import test from "node:test";

const codexPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])[^>]*>/i;

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
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

  assert.match(html, /What affects me today/i);
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
