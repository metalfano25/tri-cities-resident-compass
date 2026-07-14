import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function renderHome() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("quality-platform-html", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/"),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the resident quality-of-life platform and its honest initial states", async () => {
  const response = await renderHome();
  assert.equal(response.status, 200);
  const html = await response.text();

  for (const section of [
    "Better local information",
    "What could affect your day",
    "Ways to make life work better",
    "Start with what matters to you",
    "Family Compass",
    "Move Better",
    "Decision Decoder",
    "Why this may matter next",
    "What would make life better here",
    "Trust &amp; sources",
  ]) {
    assert.match(html, new RegExp(section, "i"), `missing resident-facing section: ${section}`);
  }

  assert.match(html, /Checking for supported actions/i);
  assert.match(html, /shown only when current evidence supports a next step/i);
  assert.match(html, /deeper tools are grouped into three simple paths/i);
  assert.match(html, /never treated as proof of community consensus/i);
  assert.doesNotMatch(html, /Guaranteed savings|Guaranteed opportunity|Guaranteed business demand/i);

  assert.match(html, /<section\b[^>]*\bid=["']actions["'][^>]*\baria-labelledby=["']actions-title["']/i);
  assert.match(html, /<section\b[^>]*\bid=["']improve["'][^>]*\baria-labelledby=["']improve-title["']/i);
  assert.match(html, /<div\b[^>]*\brole=["']status["'][^>]*>[^<]*(?:<[^>]+>)*[^<]*Checking for supported actions/i);
});

test("community gap intake has explicit limits, labels, moderation status, and privacy guidance", async () => {
  const response = await renderHome();
  const html = await response.text();

  assert.match(html, /<form\b[^>]*class=["'][^"']*gap-form/i);
  assert.match(html, /<select\b[^>]*name=["']community["'][^>]*required/i);
  assert.match(html, /<select\b[^>]*name=["']category["'][^>]*required/i);
  assert.match(html, /<textarea\b[^>]*name=["']summary["'][^>]*minlength=["']20["'][^>]*maxlength=["']360["'][^>]*required/i);
  assert.match(html, /<textarea\b[^>]*name=["']residentImpact["'][^>]*minlength=["']20["'][^>]*maxlength=["']360["'][^>]*required/i);
  assert.match(html, /<input\b(?=[^>]*name=["']approximateLocation["'])(?=[^>]*maxlength=["']100["'])[^>]*>/i);
  assert.match(html, /<p\b[^>]*\brole=["']status["'][^>]*\baria-live=["']polite["']/i);
  assert.match(html, /not a home address/i);
  assert.match(html, /Do not include names, health details, or other personal information/i);
  assert.match(html, /Share for review/i);
});

test("the visually hidden community radios expose focus on their visible chips", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.community-chip\s+input:focus-visible\s*\+\s*span\s*\{[^}]*outline\s*:/i);
});
