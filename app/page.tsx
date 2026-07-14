"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { communities, countyEmergencyResource, serviceShortcuts, type CommunityId } from "./data";
import type { AskCompassResult } from "../lib/ask-compass";
import type { InsightPayload } from "../lib/insight-types";
import type { LiveDataPayload, LiveEvent, LiveNotice } from "../lib/live-types";
import type { QualityIntelligenceItem, QualityOfLifeSnapshot } from "../lib/quality-types";

type CommunityFilter = "all" | CommunityId;
type LoadState = "loading" | "ready" | "error";
type GapCategory =
  | "accessibility"
  | "family-support"
  | "housing"
  | "local-business"
  | "mobility"
  | "parks-and-public-space"
  | "safety-and-wellbeing"
  | "services-and-programs";

const filters: Array<{ id: CommunityFilter; label: string }> = [
  { id: "all", label: "All Tri-Cities" },
  ...communities.map((item) => ({ id: item.id, label: item.shortName })),
];

const gapCategories: Array<{ id: GapCategory; label: string }> = [
  { id: "accessibility", label: "Accessibility" },
  { id: "family-support", label: "Family support" },
  { id: "housing", label: "Housing" },
  { id: "local-business", label: "Local business" },
  { id: "mobility", label: "Mobility" },
  { id: "parks-and-public-space", label: "Parks and public space" },
  { id: "safety-and-wellbeing", label: "Safety and wellbeing" },
  { id: "services-and-programs", label: "Services and programs" },
];

const communityName = (id: CommunityId) => communities.find((item) => item.id === id)?.shortName ?? id;

function formatDate(value?: string) {
  if (!value) return "No date supplied";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Check source";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
    timeZoneName: "short",
  }).format(date);
}

function todayLabel() {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "America/Chicago",
  }).format(new Date());
}

function lifecycleLabel(item: LiveNotice | LiveEvent) {
  if (item.lifecycle === "active") return "Active now";
  if (item.lifecycle === "ending-soon") return "Ending soon";
  if (item.lifecycle === "upcoming") return "Upcoming";
  if (item.lifecycle === "unknown") return "Recently published";
  return "Official record";
}

function parseCommunity(value: string | null): CommunityFilter {
  return filters.some((filter) => filter.id === value) ? value as CommunityFilter : "all";
}

function uniqueQuality(groups: QualityIntelligenceItem[][]): QualityIntelligenceItem[] {
  const unique = new Map<string, QualityIntelligenceItem>();
  for (const item of groups.flat()) {
    if (!unique.has(item.recordId)) unique.set(item.recordId, item);
  }
  return [...unique.values()];
}

function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="empty-state" role="status"><strong>{title}</strong><p>{children}</p></div>;
}

function ActionCard({ item, saved, onSave }: {
  item: QualityIntelligenceItem;
  saved: boolean;
  onSave: (id: string) => void;
}) {
  return (
    <article className="action-card">
      <div className="card-meta">
        <span>{communityName(item.communityId)}</span>
        <button type="button" aria-pressed={saved} onClick={() => onSave(item.id)}>{saved ? "Saved" : "Save"}</button>
      </div>
      <h3>{item.title}</h3>
      <p className="next-step"><strong>Useful next step</strong>{item.action}</p>
      {item.deadline && <p className="deadline"><strong>By {formatDate(item.deadline)}</strong></p>}
      <details>
        <summary>Why this may matter</summary>
        <p><strong>Confirmed:</strong> {item.confirmedFact}</p>
        <p>{item.cautiousImplication}</p>
        <p className="unknown"><strong>Still unknown:</strong> {item.unknowns.join(" ")}</p>
      </details>
      <a href={item.canonicalUrl}>Check the official source <span aria-hidden="true">↗</span></a>
    </article>
  );
}

function TopicGroup({ eyebrow, title, description, items, empty }: {
  eyebrow: string;
  title: string;
  description: string;
  items: QualityIntelligenceItem[];
  empty: string;
}) {
  return (
    <article className="topic-group">
      <p className="eyebrow">{eyebrow}</p>
      <h3>{title}</h3>
      <p>{description}</p>
      <div className="topic-links">
        {items.length > 0 ? items.slice(0, 3).map((item) => (
          <a href={item.canonicalUrl} key={item.id}>
            <strong>{item.title}</strong>
            <span>{item.action}</span>
          </a>
        )) : <span className="topic-empty">{empty}</span>}
      </div>
    </article>
  );
}

export default function Home() {
  const [community, setCommunity] = useState<CommunityFilter>("all");
  const [liveData, setLiveData] = useState<LiveDataPayload | null>(null);
  const [liveState, setLiveState] = useState<LoadState>("loading");
  const [qualityData, setQualityData] = useState<QualityOfLifeSnapshot | null>(null);
  const [qualityState, setQualityState] = useState<LoadState>("loading");
  const [insightData, setInsightData] = useState<InsightPayload | null>(null);
  const [insightState, setInsightState] = useState<LoadState>("loading");
  const [savedItems, setSavedItems] = useState<string[]>([]);
  const [askState, setAskState] = useState<"idle" | "asking" | "ready" | "error">("idle");
  const [askMessage, setAskMessage] = useState("");
  const [askResult, setAskResult] = useState<AskCompassResult | null>(null);
  const [gapState, setGapState] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [gapMessage, setGapMessage] = useState("");

  const loadLiveData = useCallback(async () => {
    setLiveState("loading");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch("/api/live", { cache: "no-store", signal: controller.signal, headers: { accept: "application/json" } });
      if (!response.ok) throw new Error("Official-source snapshot is unavailable");
      const payload = await response.json() as LiveDataPayload;
      if (!Array.isArray(payload.notices) || !Array.isArray(payload.events)) throw new Error("Incomplete live response");
      setLiveData(payload);
      setLiveState("ready");
    } catch {
      setLiveState("error");
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  const loadQualityData = useCallback(async () => {
    setQualityState("loading");
    try {
      const response = await fetch("/api/quality", { cache: "no-store", headers: { accept: "application/json" } });
      if (!response.ok) throw new Error("Resident intelligence is unavailable");
      const payload = await response.json() as QualityOfLifeSnapshot;
      if (!Array.isArray(payload.opportunityCenter)) throw new Error("Incomplete quality response");
      setQualityData(payload);
      setQualityState("ready");
    } catch {
      setQualityState("error");
    }
  }, []);

  useEffect(() => {
    const start = window.setTimeout(() => {
      setCommunity(parseCommunity(new URL(window.location.href).searchParams.get("community")));
      try {
        setSavedItems(JSON.parse(window.localStorage.getItem("tcc-saved-v1") ?? "[]") as string[]);
      } catch { /* Device-local saves are optional. */ }
      void loadLiveData();
      void loadQualityData();
    }, 0);
    return () => window.clearTimeout(start);
  }, [loadLiveData, loadQualityData]);

  useEffect(() => {
    if (!liveData) return;
    const controller = new AbortController();
    const start = window.setTimeout(() => {
      setInsightState("loading");
      void fetch(`/api/insights?community=${encodeURIComponent(community)}`, { cache: "no-store", signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("Insight unavailable");
          const payload = await response.json() as InsightPayload;
          if (!Array.isArray(payload.insights)) throw new Error("Invalid insight response");
          setInsightData(payload);
          setInsightState("ready");
        })
        .catch(() => { if (!controller.signal.aborted) setInsightState("error"); });
    }, 0);
    return () => { window.clearTimeout(start); controller.abort(); };
  }, [community, liveData]);

  const selectedLabel = filters.find((item) => item.id === community)?.label ?? "All Tri-Cities";
  const inCommunity = useCallback((id: CommunityId) => community === "all" || community === id, [community]);
  const visibleNotices = useMemo(() => (liveData?.notices ?? []).filter((item) => inCommunity(item.communityId)), [inCommunity, liveData]);
  const visibleEvents = useMemo(() => (liveData?.events ?? []).filter((item) => item.category === "event" && inCommunity(item.communityId)), [inCommunity, liveData]);
  const visibleServices = serviceShortcuts.filter((item) => community === "all" || item.communityId === community);
  const quality = useCallback((items: QualityIntelligenceItem[] | undefined) => (items ?? []).filter((item) => inCommunity(item.communityId)), [inCommunity]);
  const opportunities = quality(qualityData?.opportunityCenter);
  const dailyLife = uniqueQuality([quality(qualityData?.family), quality(qualityData?.liveWell)]);
  const gettingAround = uniqueQuality([quality(qualityData?.mobility), quality(qualityData?.changeMap)]);
  const shapingCommunity = uniqueQuality([quality(qualityData?.decisionDecoder), quality(qualityData?.localEconomy)]);
  const topSignal = visibleNotices[0];
  const topOpportunity = opportunities.find((item) => item.status === "confirmed") ?? opportunities[0];
  const healthySources = liveData?.sources.filter((source) => source.state === "ok" && !liveData.cache?.sources.find((item) => item.sourceId === source.sourceId)?.stale).length ?? 0;

  function selectCommunity(next: CommunityFilter) {
    setCommunity(next);
    setAskResult(null);
    const url = new URL(window.location.href);
    if (next === "all") url.searchParams.delete("community"); else url.searchParams.set("community", next);
    window.history.pushState({}, "", url);
  }

  function toggleSaved(id: string) {
    setSavedItems((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      window.localStorage.setItem("tcc-saved-v1", JSON.stringify(next));
      return next;
    });
  }

  async function askCompass(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAskState("asking");
    setAskMessage("");
    setAskResult(null);
    const question = String(new FormData(event.currentTarget).get("question") ?? "");
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ question, ...(community === "all" ? {} : { community }) }),
      });
      const body = await response.json() as AskCompassResult & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "The Compass could not search right now.");
      setAskResult(body);
      setAskState("ready");
    } catch (error) {
      setAskState("error");
      setAskMessage(error instanceof Error ? error.message : "The Compass could not search right now.");
    }
  }

  async function submitGap(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGapState("sending");
    setGapMessage("");
    try {
      const response = await fetch("/api/community-needs", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())),
      });
      const body = await response.json() as { message?: string; error?: string; duplicate?: boolean };
      if (!response.ok) throw new Error(body.error ?? body.message ?? "Your contribution could not be saved.");
      setGapState("success");
      setGapMessage(body.duplicate ? "This need is already in the review queue. Thank you for confirming it." : "Thank you. Your idea is waiting for privacy and evidence review.");
      event.currentTarget.reset();
    } catch (error) {
      setGapState("error");
      setGapMessage(error instanceof Error ? error.message : "Your contribution could not be saved.");
    }
  }

  return (
    <>
      <a className="skip-link" href="#today">Skip to what matters today</a>
      <header className="site-header">
        <div className="shell header-inner">
          <a className="brand" href="#top"><span aria-hidden="true">TC</span><strong>Tri-Cities Compass</strong></a>
          <nav aria-label="Primary navigation"><a href="#today">Today</a><a href="#actions">Take action</a><a href="#improve">Improve the area</a></nav>
          <button className="refresh-button" type="button" onClick={() => { void loadLiveData(); void loadQualityData(); }} disabled={liveState === "loading"} aria-busy={liveState === "loading"}>{liveState === "loading" ? "Checking…" : "Refresh"}</button>
        </div>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="shell hero-grid">
            <div className="hero-copy">
              <p className="eyebrow">{todayLabel()} · Geneva, Batavia & St. Charles</p>
              <h1 id="hero-title">Better local information.<br /><em>Better local lives.</em></h1>
              <p className="hero-summary">One clear place to understand what is changing, find something useful, and help make the community better.</p>
              <fieldset className="community-picker"><legend>Show me</legend><div>{filters.map((filter) => <label className="community-chip" key={filter.id}><input type="radio" name="community-filter" checked={community === filter.id} onChange={() => selectCommunity(filter.id)} /><span>{filter.label}</span></label>)}</div></fieldset>
              <p className="freshness" aria-live="polite">{liveState === "ready" ? `${selectedLabel} · ${healthySources} of ${liveData?.sources.length ?? 0} sources healthy · checked ${formatDate(liveData?.generatedAt)}` : liveState === "loading" ? "Checking official sources…" : "Live sources are recovering. Official links remain available."}</p>
            </div>

            <div className="hero-focus" aria-label="Top local priorities">
              <article>
                <p className="eyebrow">Know what changed</p>
                {topSignal ? <><h2>{topSignal.title}</h2><p>{topSignal.summary}</p><a href={topSignal.canonicalUrl}>Read the official update ↗</a></> : <p>No verified current signal is available yet.</p>}
              </article>
              <article>
                <p className="eyebrow">Take a useful step</p>
                {topOpportunity ? <><h2>{topOpportunity.title}</h2><p>{topOpportunity.action}</p><a href="#actions">See supported actions ↓</a></> : <p>We will show an action only when a current source supports it.</p>}
              </article>
            </div>
          </div>
        </section>

        <section className="ask-band" aria-labelledby="ask-title">
          <div className="shell ask-layout">
            <div><p className="eyebrow">Ask the Compass</p><h2 id="ask-title">What do you need to understand?</h2><p>Search the current verified snapshot. No account or address needed.</p></div>
            <form className="ask-form" onSubmit={askCompass}><label htmlFor="compass-question">Your local question</label><div><input id="compass-question" name="question" minLength={5} maxLength={220} required placeholder="Any deadlines or road changes this week?" /><button type="submit" disabled={askState === "asking"}>{askState === "asking" ? "Searching…" : "Ask"}</button></div><small>Do not enter contact, medical, or private information.</small></form>
          </div>
          {(askResult || askState === "error") && <div className={`shell ask-answer ${askResult?.mode === "authoritative-routing" ? "risk-answer" : ""}`} role="status" aria-live="polite">{askResult ? <><p className="eyebrow">{askResult.mode === "authoritative-routing" ? "Official guidance required" : "Verified search"}</p><h3>{askResult.answer}</h3>{askResult.matches.length > 0 ? <div className="answer-list">{askResult.matches.slice(0, 3).map((match) => <a href={match.sourceUrl} key={match.id}><strong>{match.title}</strong><span>{match.confirmedFact}</span><small>{match.sourceName} ↗</small></a>)}</div> : askResult.mode === "verified-search" ? <p>No close match was found. That may reflect incomplete source coverage—not proof that nothing is available.</p> : null}<small>{askResult.disclaimer}</small></> : <p>{askMessage}</p>}</div>}
        </section>

        <section id="today" className="section shell" aria-labelledby="today-title">
          <div className="section-heading"><div><p className="eyebrow">Understand today</p><h2 id="today-title">What could affect your day</h2></div><p>Short official updates, upcoming events, and direct links to local help.</p></div>
          {liveState === "loading" && !liveData ? <div className="loading-state" role="status">Building today&apos;s verified briefing…</div> : <div className="today-grid">
            <div className="signal-list">
              <h3>Recent changes</h3>
              {visibleNotices.length > 0 ? visibleNotices.slice(0, 4).map((notice) => <article key={notice.id}><div><span>{communityName(notice.communityId)}</span><span>{lifecycleLabel(notice)}</span></div><h4>{notice.title}</h4><p>{notice.summary}</p><a href={notice.canonicalUrl}>Official update ↗</a></article>) : <EmptyState title="No current notices in this view.">An empty feed is not proof that nothing is happening.</EmptyState>}
            </div>
            <aside className="day-sidebar">
              <div><h3>Coming up</h3>{visibleEvents.length > 0 ? visibleEvents.slice(0, 3).map((event) => <a href={event.canonicalUrl} key={event.id}><strong>{event.title}</strong><span>{event.timingLabel ?? event.dateLabel} · {event.location}</span></a>) : <p>No current events were returned.</p>}</div>
              <div><h3>Find local help</h3>{visibleServices.slice(0, 4).map((service) => <a href={service.sourceUrl} key={service.id}><strong>{service.title}</strong><span>{service.description}</span></a>)}</div>
            </aside>
          </div>}
        </section>

        <section id="actions" className="section action-section" aria-labelledby="actions-title"><div className="shell">
          <div className="section-heading"><div><p className="eyebrow">Take action</p><h2 id="actions-title">Ways to make life work better</h2></div><p>Deadlines, participation, savings, family actions, and local work—shown only when current evidence supports a next step.</p></div>
          {qualityState === "loading" ? <div className="loading-state" role="status">Checking for supported actions…</div> : opportunities.length > 0 ? <div className="action-grid">{opportunities.slice(0, 4).map((item) => <ActionCard item={item} saved={savedItems.includes(item.id)} onSave={toggleSaved} key={item.id} />)}</div> : <EmptyState title="No supported actions in this view.">We do not turn vague announcements into opportunities.</EmptyState>}
        </div></section>

        <section className="section shell" aria-labelledby="explore-title">
          <div className="section-heading"><div><p className="eyebrow">Explore by need</p><h2 id="explore-title">Start with what matters to you</h2></div><p>The deeper tools are grouped into three simple paths instead of separate dashboards.</p></div>
          <div className="topic-grid">
            <TopicGroup eyebrow="Family Compass · Live Well" title="Make everyday life easier" description="Programs, family timing, services, and support." items={dailyLife} empty="No current family or service records in this view." />
            <TopicGroup eyebrow="Move Better · Change Map" title="Get around with fewer surprises" description="Roads, access, construction, parking, and trails." items={gettingAround} empty="No source-backed mobility changes are ready." />
            <TopicGroup eyebrow="Decision Decoder · Local economy" title="Help shape what comes next" description="Public decisions, development, work, and community participation." items={shapingCommunity} empty="No supported civic or economic signals are ready." />
          </div>
        </section>

        <section className="section insight-section" aria-labelledby="insight-title"><div className="shell">
          <div className="section-heading"><div><p className="eyebrow">Understand the impact</p><h2 id="insight-title">Why this may matter next</h2></div><p>Confirmed facts stay separate from cautious implications and unknowns.</p></div>
          {insightState === "loading" && !insightData ? <div className="loading-state" role="status">Building the impact briefing…</div> : insightData && insightData.insights.length > 0 ? <div className="insight-list">{insightData.insights.slice(0, 2).map((insight) => <article key={insight.itemId}><p className="eyebrow">{communityName(insight.communityId)} · {insightData.mode === "ai" ? "AI-assisted" : "Rules-based"}</p><h3>{insight.impact}</h3><dl><div><dt>Confirmed</dt><dd>{insight.confirmedFact}</dd></div><div><dt>Who may notice</dt><dd>{insight.affected}</dd></div><div><dt>Useful next move</dt><dd>{insight.action}</dd></div><div><dt>Still unknown</dt><dd>{insight.unknown}</dd></div></dl><a href={insight.sourceUrl}>Verify with {insight.sourceName} ↗</a></article>)}</div> : <EmptyState title="Impact analysis is temporarily unavailable.">Official records and source links remain available.</EmptyState>}
          <p className="disclaimer">{insightData?.disclaimer ?? "Analysis never replaces official instructions or emergency alerts."}</p>
        </div></section>

        <section id="improve" className="section improve-section" aria-labelledby="improve-title"><div className="shell improve-layout">
          <div><p className="eyebrow">Improve the community</p><h2 id="improve-title">What would make life better here?</h2><p>Share a constructive local need. Suggestions are reviewed before they can appear publicly and are never treated as proof of community consensus.</p><ul><li>Use a general area, not a home address.</li><li>Do not include names, health details, or other personal information.</li><li>Explain who is affected and what could help.</li></ul></div>
          <form className="gap-form" onSubmit={submitGap}><div className="field-row"><label>Community<select name="community" defaultValue={community === "all" ? "tri-cities" : community} required><option value="tri-cities">Across the Tri-Cities</option><option value="geneva">Geneva</option><option value="batavia">Batavia</option><option value="st-charles">St. Charles</option></select></label><label>Type of need<select name="category" defaultValue="services-and-programs" required>{gapCategories.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label></div><label>What is missing or getting in the way?<textarea name="summary" minLength={20} maxLength={360} required /></label><label htmlFor="gap-location">Approximate location <span>(optional)</span></label><input name="approximateLocation" maxLength={100} minLength={3} id="gap-location" placeholder="Park, corridor, intersection, or neighborhood" /><label>How does this affect residents?<textarea name="residentImpact" minLength={20} maxLength={360} required /></label><button type="submit" disabled={gapState === "sending"}>{gapState === "sending" ? "Sending for review…" : "Share for review"}</button><p className={`form-status status-${gapState}`} role="status" aria-live="polite">{gapMessage}</p></form>
        </div></section>

        <section className="section shell trust-section" aria-labelledby="trust-title">
          <details className="trust-panel"><summary><span><span className="eyebrow">Trust & sources</span><strong id="trust-title">See where the information comes from</strong></span><span aria-hidden="true">＋</span></summary><div className="trust-content"><div><p>Tri-Cities Compass is independent—not an official government site. It stores short factual excerpts, links back to the publisher, and is not a replacement for official emergency alerts.</p><p>Official city homes: <a href="https://www.geneva.il.us/">Geneva</a> · <a href="https://www.bataviail.gov/">Batavia</a> · <a href="https://www.stcharlesil.gov/">St. Charles</a></p>{liveData?.cache && <p className="cache-note"><strong>{liveData.cache.stale ? "Last verified snapshot in use." : "Sources are within the freshness window."}</strong> Last successful collection {formatDate(liveData.cache.lastSuccessfulAt ?? undefined)}.</p>}</div>{liveData && <ul className="source-health" aria-label="Source health">{liveData.sources.map((source) => { const freshness = liveData.cache?.sources.find((item) => item.sourceId === source.sourceId); const stale = freshness?.stale; return <li key={source.id}><span className={`health-dot ${stale ? "health-stale" : ""}`} aria-hidden="true" /><a href={source.url}>{source.name}</a><span>{source.itemCount} items · {stale ? "stale—last verified record retained" : source.state}</span></li>; })}</ul>}</div></details>
        </section>

        <aside className="emergency-banner"><div className="shell"><strong>Immediate danger?</strong><span>Call 911. Do not rely on this site for urgent safety information.</span><a href={countyEmergencyResource.sourceUrl}>Kane County emergency resources ↗</a></div></aside>
      </main>

      <footer><div className="shell footer-inner"><div><strong>Tri-Cities Compass</strong><p>Clear local information for a better life around the Fox River.</p></div><nav aria-label="Footer navigation"><a href="#today">Today</a><a href="#actions">Take action</a><a href="#improve">Improve the area</a></nav><p>Official sources · Visible uncertainty · Privacy-minded participation</p></div></footer>
    </>
  );
}
