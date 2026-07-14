"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  communities,
  countyEmergencyResource,
  serviceShortcuts,
  type CommunityId,
} from "./data";
import type { InsightPayload } from "../lib/insight-types";
import type { LiveDataPayload, LiveEvent, LiveNotice } from "../lib/live-types";
import type { QualityIntelligenceItem, QualityOfLifeSnapshot } from "../lib/quality-types";
import type { AskCompassResult } from "../lib/ask-compass";

type CommunityFilter = "all" | CommunityId;
type LoadState = "loading" | "ready" | "error";
type InterestId = "family" | "mobility" | "savings" | "civic" | "business" | "wellbeing";
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

const interests: Array<{ id: InterestId; label: string; cue: string }> = [
  { id: "family", label: "Family", cue: "School, camps, youth" },
  { id: "mobility", label: "Getting around", cue: "Roads, rail, trails" },
  { id: "savings", label: "Saving money", cue: "Aid, rebates, free programs" },
  { id: "civic", label: "Having a say", cue: "Meetings and decisions" },
  { id: "business", label: "Local business", cue: "Demand, bids, storefronts" },
  { id: "wellbeing", label: "Living well", cue: "Services and support" },
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

const communityName = (id: CommunityId) =>
  communities.find((item) => item.id === id)?.shortName ?? id;

const formatDate = (value?: string) => {
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
};

const todayLabel = () =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "America/Chicago",
  }).format(new Date());

const lifecycleLabel = (item: LiveNotice | LiveEvent) => {
  switch (item.lifecycle) {
    case "active": return "Active now";
    case "ending-soon": return "Ending soon";
    case "upcoming": return "Upcoming";
    case "unknown": return "Recently published";
    default: return "Official record";
  }
};

const qualityCategoryLabel = (item: QualityIntelligenceItem) => {
  const value = item.opportunityCategory ?? item.changeKind ?? item.decisionStage ?? item.lens;
  return value.replaceAll("-", " ");
};

function parseCommunity(value: string | null): CommunityFilter {
  return filters.some((filter) => filter.id === value)
    ? (value as CommunityFilter)
    : "all";
}

function SourceLine({ item }: { item: LiveNotice | LiveEvent }) {
  return (
    <p className="source-line">
      <span className="verified-dot" aria-hidden="true" />
      <strong>{item.sourceName}</strong>
      <span aria-hidden="true">·</span>
      <time dateTime={item.fetchedAt}>checked {formatDate(item.fetchedAt)}</time>
    </p>
  );
}

function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="empty-state" role="status"><span aria-hidden="true">◇</span><strong>{title}</strong><p>{children}</p></div>;
}

function IntelligenceCard({ item, saved, onSave }: {
  item: QualityIntelligenceItem;
  saved: boolean;
  onSave: (id: string) => void;
}) {
  return (
    <article className={`intelligence-card city-accent-${item.communityId}`}>
      <div className="card-topline">
        <span className={`status-pill status-${item.status}`}>{item.status === "watch" ? "Watch next" : "Supported action"}</span>
        <button className="save-button" type="button" aria-pressed={saved} onClick={() => onSave(item.id)}>
          <span aria-hidden="true">{saved ? "◆" : "◇"}</span>{saved ? " Saved" : " Save"}
        </button>
      </div>
      <p className="micro-label">{communityName(item.communityId)} · {qualityCategoryLabel(item)}</p>
      <h3>{item.title}</h3>
      <dl className="intelligence-facts">
        <div><dt>Confirmed</dt><dd>{item.confirmedFact}</dd></div>
        <div><dt>Why it may matter</dt><dd>{item.cautiousImplication}</dd></div>
        <div><dt>Next move</dt><dd>{item.action}</dd></div>
        {item.deadline && <div><dt>Deadline</dt><dd>{formatDate(item.deadline)}</dd></div>}
      </dl>
      {item.unknowns.length > 0 && <details className="unknowns"><summary>What is still unknown</summary><p>{item.unknowns.join(" ")}</p></details>}
      <div className="card-footer">
        <span>{item.evidenceLevel} evidence · score {item.scores.total}</span>
        <a href={item.canonicalUrl}>Verify at source <span aria-hidden="true">↗</span></a>
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
  const [activeInterests, setActiveInterests] = useState<InterestId[]>([]);
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
      if (!response.ok) throw new Error(`Source refresh returned ${response.status}`);
      const payload = (await response.json()) as LiveDataPayload;
      if (!Array.isArray(payload.notices) || !Array.isArray(payload.events)) throw new Error("The live response was incomplete");
      setLiveData(payload);
      setLiveState("ready");
    } catch (error) {
      setLiveState("error");
      void error;
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  const loadQualityData = useCallback(async () => {
    setQualityState("loading");
    try {
      const response = await fetch("/api/quality", { cache: "no-store", headers: { accept: "application/json" } });
      if (!response.ok) throw new Error("Quality-of-life intelligence is still building");
      const payload = (await response.json()) as QualityOfLifeSnapshot;
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
        setActiveInterests(JSON.parse(window.localStorage.getItem("tcc-interests-v1") ?? "[]") as InterestId[]);
        setSavedItems(JSON.parse(window.localStorage.getItem("tcc-saved-v1") ?? "[]") as string[]);
      } catch { /* Device-local preferences are optional. */ }
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
      void fetch(`/api/insights?community=${encodeURIComponent(community)}`, { cache: "no-store", signal: controller.signal, headers: { accept: "application/json" } })
        .then(async (response) => {
          if (!response.ok) throw new Error("Insight unavailable");
          const payload = (await response.json()) as InsightPayload;
          if (!Array.isArray(payload.insights) || payload.scope !== community) throw new Error("Invalid insight response");
          setInsightData(payload);
          setInsightState("ready");
        })
        .catch(() => { if (!controller.signal.aborted) setInsightState("error"); });
    }, 0);
    return () => { window.clearTimeout(start); controller.abort(); };
  }, [community, liveData]);

  const selectedLabel = filters.find((item) => item.id === community)?.label ?? "All Tri-Cities";
  const inCommunity = useCallback((id: CommunityId) => community === "all" || id === community, [community]);
  const visibleNotices = useMemo(() => (liveData?.notices ?? []).filter((item) => inCommunity(item.communityId)), [inCommunity, liveData]);
  const visibleEvents = useMemo(() => (liveData?.events ?? []).filter((item) => item.category === "event" && inCommunity(item.communityId)), [inCommunity, liveData]);
  const visibleMeetings = useMemo(() => (liveData?.events ?? []).filter((item) => item.category === "meeting" && inCommunity(item.communityId)), [inCommunity, liveData]);
  const visibleServices = serviceShortcuts.filter((item) => community === "all" || item.communityId === community);
  const quality = useCallback((items: QualityIntelligenceItem[] | undefined) => (items ?? []).filter((item) => inCommunity(item.communityId)), [inCommunity]);
  const interestScore = useCallback((item: QualityIntelligenceItem) => activeInterests.reduce((score, interest) => {
    const matches =
      (interest === "family" && (item.lens === "family" || item.opportunityCategory === "family-deadlines")) ||
      (interest === "mobility" && (item.lens === "mobility" || item.opportunityCategory === "mobility-access")) ||
      (interest === "savings" && item.opportunityCategory === "save-money") ||
      (interest === "civic" && (item.lens === "decision" || item.opportunityCategory === "have-a-say" || item.opportunityCategory === "volunteer-participate")) ||
      (interest === "business" && (item.lens === "local-economy" || item.opportunityCategory === "win-work" || item.opportunityCategory === "business-demand")) ||
      (interest === "wellbeing" && item.lens === "live-well");
    return score + (matches ? 100 : 0);
  }, 0), [activeInterests]);
  const opportunities = useMemo(() => quality(qualityData?.opportunityCenter).sort((a, b) => interestScore(b) - interestScore(a) || b.scores.total - a.scores.total), [interestScore, quality, qualityData?.opportunityCenter]);
  const decisions = quality(qualityData?.decisionDecoder);
  const projects = quality(qualityData?.changeMap);
  const family = quality(qualityData?.family);
  const mobility = quality(qualityData?.mobility);
  const liveWell = quality(qualityData?.liveWell);
  const localEconomy = quality(qualityData?.localEconomy);
  const topOpportunity = opportunities.find((item) => item.status === "confirmed") ?? opportunities[0];
  const healthySources = liveData?.sources.filter((source) =>
    source.state === "ok" && !liveData.cache?.sources.find((item) => item.sourceId === source.sourceId)?.stale,
  ).length ?? 0;

  function selectCommunity(next: CommunityFilter) {
    setCommunity(next);
    const url = new URL(window.location.href);
    if (next === "all") url.searchParams.delete("community"); else url.searchParams.set("community", next);
    window.history.pushState({}, "", url);
  }

  function toggleInterest(id: InterestId) {
    setActiveInterests((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      window.localStorage.setItem("tcc-interests-v1", JSON.stringify(next));
      return next;
    });
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
    const form = new FormData(event.currentTarget);
    const question = String(form.get("question") ?? "");
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
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      const response = await fetch("/api/community-needs", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json() as { message?: string; duplicate?: boolean };
      if (!response.ok) throw new Error(body.message ?? "Your contribution could not be saved.");
      setGapState("success");
      setGapMessage(body.duplicate ? "That need is already in the review queue. Thank you for confirming it." : "Thank you. Your contribution is awaiting moderation before it can appear publicly.");
      event.currentTarget.reset();
    } catch (error) {
      setGapState("error");
      setGapMessage(error instanceof Error ? error.message : "Your contribution could not be saved.");
    }
  }

  return (
    <>
      <a className="skip-link" href="#today">Skip to today&apos;s local signal</a>
      <header className="site-header">
        <div className="shell header-inner">
          <a className="brand" href="#top" aria-label="Tri-Cities Compass home"><span className="brand-mark" aria-hidden="true"><i />TC</span><span><strong>Tri-Cities Compass</strong><small>Life around the Fox River</small></span></a>
          <nav className="desktop-nav" aria-label="Primary navigation"><a href="#today">Today</a><a href="#opportunities">Opportunities</a><a href="#decisions">Decisions</a><a href="#change-map">Change map</a><a href="#life-guides">This week</a></nav>
          <button className="refresh-button" type="button" onClick={() => { void loadLiveData(); void loadQualityData(); }} disabled={liveState === "loading"} aria-busy={liveState === "loading"}><span aria-hidden="true">↻</span><span>{liveState === "loading" ? "Checking" : "Refresh"}</span></button>
        </div>
      </header>

      <main id="top">
        <section className="hero-surface" aria-labelledby="hero-title">
          <div className="shell hero">
            <div className="hero-copy">
              <p className="eyebrow"><span className="signal-dot" /> {todayLabel()} · Local intelligence</p>
              <h1 id="hero-title">Make local life<br /><em>work better.</em></h1>
              <p className="hero-summary"><strong>Your cities. In signal.</strong> See what changed, find what you can use, and understand the decisions shaping Geneva, Batavia, and St. Charles.</p>
              <fieldset className="community-picker"><legend>Choose your view — no address needed</legend><div className="chip-row">{filters.map((filter) => <label className={`community-chip city-${filter.id}`} key={filter.id}><input type="radio" name="community-filter" checked={community === filter.id} onChange={() => selectCommunity(filter.id)} /><span>{filter.label}</span></label>)}</div></fieldset>
              <p className="result-summary" aria-live="polite">{liveState === "ready" ? `${visibleNotices.length} recent signals for ${selectedLabel} · checked ${formatDate(liveData?.generatedAt)}` : liveState === "loading" ? `Checking official sources for ${selectedLabel}…` : `Stored shortcuts remain available while live sources recover.`}</p>
            </div>
            <div className="hero-dashboard">
              <article className="hero-signal"><p className="micro-label">Top current signal</p>{visibleNotices[0] ? <><h2>{visibleNotices[0].title}</h2><p>{visibleNotices[0].summary}</p><a href={visibleNotices[0].canonicalUrl}>Read official update ↗</a></> : <p>We are waiting for a verified current signal.</p>}</article>
              <article className="hero-opportunity"><div><p className="micro-label">Best supported opportunity</p><span>{topOpportunity ? `Score ${topOpportunity.scores.total}` : "Evidence first"}</span></div>{topOpportunity ? <><h2>{topOpportunity.title}</h2><p>{topOpportunity.action}</p><a href="#opportunities">See why it matters ↓</a></> : <><h2>No opportunity should be invented.</h2><p>We will show one here only when an actionable source-backed item is available.</p></>}</article>
              <div className="hero-metrics" aria-label="Coverage summary"><div><strong>{liveData?.notices.length ?? "—"}</strong><span>current notices</span></div><div><strong>{opportunities.length || "—"}</strong><span>opportunities</span></div><div><strong>{healthySources}/{liveData?.sources.length ?? "—"}</strong><span>sources healthy</span></div></div>
            </div>
          </div>
        </section>

        <section className="preference-bar" aria-labelledby="interests-title"><div className="shell preference-inner"><div><p className="micro-label">Your Compass</p><h2 id="interests-title">What should rise to the top?</h2><p>{activeInterests.length > 0 ? "Matching opportunity cards are ranked first. Saved only on this device." : "Choose interests to rank matching opportunity cards first. Saved only on this device."}</p></div><div className="interest-grid">{interests.map((interest) => <button className="interest-chip" data-active={activeInterests.includes(interest.id)} aria-pressed={activeInterests.includes(interest.id)} type="button" key={interest.id} onClick={() => toggleInterest(interest.id)}><strong>{interest.label}</strong><span>{interest.cue}</span></button>)}</div></div></section>

        <section className="ask-section" aria-labelledby="ask-title"><div className="shell ask-layout"><div><p className="kicker">Ask the Compass</p><h2 id="ask-title">What do you want to<br />understand locally?</h2><p>Search the current verified snapshot in plain language. No account, precise address, or personal details needed.</p></div><form className="ask-form" onSubmit={askCompass}><label htmlFor="compass-question">Your question</label><div><input id="compass-question" name="question" minLength={5} maxLength={220} required placeholder="What deadlines or road changes should I know about?" /><button type="submit" disabled={askState === "asking"}>{askState === "asking" ? "Searching…" : "Ask"}</button></div><small>Searches {selectedLabel}. Do not enter contact, medical, or private information.</small></form></div>{(askResult || askState === "error") && <div className={`shell ask-answer ${askResult?.mode === "authoritative-routing" ? "risk-answer" : ""}`} role="status" aria-live="polite">{askResult ? <><div className="answer-heading"><span>{askResult.mode === "authoritative-routing" ? "Official guidance required" : "Verified search"}</span><p>{askResult.answer}</p></div>{askResult.matches.length > 0 ? <div className="answer-matches">{askResult.matches.slice(0, 4).map((match) => <article key={match.id}><p className="micro-label">{communityName(match.communityId)} · {match.lens.replaceAll("-", " ")}</p><h3>{match.title}</h3><p>{match.confirmedFact}</p><a href={match.sourceUrl}>Verify with {match.sourceName} ↗</a></article>)}</div> : askResult.mode === "verified-search" ? <p className="no-match">No close match was found. That may reflect incomplete source coverage—not proof that nothing is available.</p> : null}<small>{askResult.disclaimer}</small></> : <p>{askMessage}</p>}</div>}</section>

        <section id="today" className="shell section-block" aria-labelledby="today-title">
          <div className="section-heading"><div><p className="kicker">Today in the Tri-Cities</p><h2 id="today-title">The local signal,<br />without the scavenger hunt.</h2></div><p>Current official updates, practical context, and a direct path back to the source.</p></div>
          {liveState === "loading" && !liveData ? <div className="loading-state" role="status"><span className="loading-mark" />Building today&apos;s verified briefing…</div> : liveData && visibleNotices.length > 0 ? <div className="today-layout"><div className="notice-stack">{visibleNotices.slice(0, 5).map((notice, index) => <article className={`notice-card city-accent-${notice.communityId}`} key={notice.id}><div className="notice-index">{String(index + 1).padStart(2, "0")}</div><div><p className="micro-label">{communityName(notice.communityId)} · {notice.kind.replaceAll("-", " ")} · {lifecycleLabel(notice)}</p><h3>{notice.title}</h3><p>{notice.summary}</p><SourceLine item={notice} /><a className="text-link" href={notice.canonicalUrl}>Read official update ↗</a></div></article>)}</div><aside className="action-rail"><p className="kicker">Useful right now</p><h3>Fast paths to local help</h3>{visibleServices.slice(0, 5).map((service) => <a href={service.sourceUrl} key={service.id}><span>{service.title}</span><b aria-hidden="true">↗</b></a>)}<a className="emergency-link" href={countyEmergencyResource.sourceUrl}><span>County emergency resources</span><b aria-hidden="true">↗</b></a></aside></div> : <EmptyState title="No current notices were returned.">That means the feed is empty or unavailable—not that nothing is happening. Official service links remain available.</EmptyState>}
        </section>

        <section id="opportunities" className="opportunity-section" aria-labelledby="opportunity-title"><div className="shell section-block"><div className="section-heading light-heading"><div><p className="kicker">Opportunity Center</p><h2 id="opportunity-title">What can you<br /><em>do with this?</em></h2></div><p>Deadlines, savings, public input, family actions, and work—published only when the evidence supports a next move.</p></div>{qualityState === "loading" ? <div className="loading-state dark-loading" role="status"><span className="loading-mark" />Checking for supported opportunities…</div> : opportunities.length > 0 ? <div className="intelligence-grid">{opportunities.slice(0, 6).map((item) => <IntelligenceCard item={item} saved={savedItems.includes(item.id)} onSave={toggleSaved} key={item.id} />)}</div> : <EmptyState title="No supported opportunities in this view.">We do not turn vague announcements into opportunities. Try another community or return after the next source collection.</EmptyState>}</div></section>

        <section id="decisions" className="shell section-block" aria-labelledby="decisions-title"><div className="section-heading"><div><p className="kicker">Decision Decoder</p><h2 id="decisions-title">Public business,<br />translated into action.</h2></div><p>What is being decided, what it could change, and where residents can verify or participate.</p></div>{decisions.length > 0 ? <div className="decision-grid">{decisions.slice(0, 4).map((item) => <article className="decision-card" key={item.id}><div className="decision-stage"><span>{item.decisionStage?.replaceAll("-", " ") ?? "public decision"}</span><b>{communityName(item.communityId)}</b></div><h3>{item.title}</h3><p><strong>Confirmed:</strong> {item.confirmedFact}</p><p><strong>Possible implication:</strong> {item.cautiousImplication}</p><p><strong>Resident move:</strong> {item.action}</p><a href={item.canonicalUrl}>Open source record ↗</a></article>)}</div> : visibleMeetings.length > 0 ? <div className="decision-grid">{visibleMeetings.slice(0, 4).map((meeting) => <article className="decision-card" key={meeting.id}><div className="decision-stage"><span>meeting announced</span><b>{communityName(meeting.communityId)}</b></div><h3>{meeting.title}</h3><p><strong>When:</strong> {meeting.timingLabel ?? `${meeting.dateLabel} · ${meeting.timeLabel}`}</p><p><strong>What we know:</strong> An official meeting record is available. Agenda interpretation is not yet supported by collected evidence.</p><p><strong>Resident move:</strong> Review the agenda or meeting details at the source.</p><a href={meeting.canonicalUrl}>Open meeting information ↗</a></article>)}</div> : <EmptyState title="No public decisions are ready to decode.">A meeting title alone is not enough to claim what will be decided.</EmptyState>}</section>

        <section id="change-map" className="change-section" aria-labelledby="change-title"><div className="shell section-block"><div className="section-heading"><div><p className="kicker">Change Map</p><h2 id="change-title">Where the area<br />is changing.</h2></div><p>A compact project and place view. We show source-stated locations only—never invented map points.</p></div>{projects.length > 0 ? <div className="change-layout"><div className="place-index" aria-hidden="true"><span>Geneva</span><i /><span>Batavia</span><i /><span>St. Charles</span></div><div className="project-list">{projects.slice(0, 6).map((item) => <article className="project-card" key={item.id}><div className="project-marker" aria-hidden="true" /><div><p className="micro-label">{communityName(item.communityId)} · {item.changeKind?.replaceAll("-", " ") ?? "local change"}</p><h3>{item.title}</h3><p>{item.confirmedFact}</p><dl><div><dt>Place</dt><dd>{item.location ?? "Location detail not provided by source"}</dd></div><div><dt>Watch</dt><dd>{item.action}</dd></div></dl><a href={item.canonicalUrl}>View project source ↗</a></div></article>)}</div></div> : <EmptyState title="No mappable projects have enough location evidence yet.">Projects will appear when a source provides a usable place description. No coordinates are inferred.</EmptyState>}</div></section>

        <section id="life-guides" className="shell section-block" aria-labelledby="guides-title"><div className="section-heading"><div><p className="kicker">Everyday life</p><h2 id="guides-title">Three ways to<br />make the week easier.</h2></div><p>Family timing, mobility changes, and service navigation in one consistent format.</p></div><div className="guide-grid">
          <article className="guide-panel guide-family"><span className="guide-number">01</span><p className="kicker">Family Compass</p><h3>Keep the household ahead of deadlines.</h3>{family.length > 0 ? family.slice(0, 3).map((item) => <a href={item.canonicalUrl} key={item.id}><strong>{item.title}</strong><span>{item.action}</span></a>) : visibleEvents.slice(0, 3).map((event) => <a href={event.canonicalUrl} key={event.id}><strong>{event.title}</strong><span>{event.timingLabel ?? event.dateLabel} · {event.location}</span></a>)}{family.length === 0 && visibleEvents.length === 0 && <p className="panel-empty">No current family records in this view.</p>}<div className="verified-shortcuts" aria-label="Verified family resource shortcuts"><a href="https://www.geneva304.org/default.aspx">D304</a><a href="https://www.bps101.net/">BPS101</a><a href="https://district.d303.org/">D303</a><a href="https://www.gpld.org/">Geneva Library</a><a href="https://www.bataviapl.org/">Batavia Library</a><a href="https://www.scpld.org/programs-events/">St. Charles Library</a></div></article>
          <article className="guide-panel guide-mobility"><span className="guide-number">02</span><p className="kicker">Move Better</p><h3>Know what may change the trip.</h3>{mobility.length > 0 ? mobility.slice(0, 3).map((item) => <a href={item.canonicalUrl} key={item.id}><strong>{item.title}</strong><span>{item.cautiousImplication}</span></a>) : <p className="panel-empty">No source-backed mobility changes are ready. This is not a claim that roads or transit are clear.</p>}<div className="verified-shortcuts"><a href="https://www.kanehealth.com/Pages/Transportation.aspx">Ride in Kane ↗</a></div></article>
          <article className="guide-panel guide-well"><span className="guide-number">03</span><p className="kicker">Live Well</p><h3>Find the right place to start.</h3>{liveWell.length > 0 ? liveWell.slice(0, 3).map((item) => <a href={item.canonicalUrl} key={item.id}><strong>{item.title}</strong><span>{item.action}</span></a>) : visibleServices.slice(0, 3).map((service) => <a href={service.sourceUrl} key={service.id}><strong>{service.title}</strong><span>{service.description}</span></a>)}<div className="verified-shortcuts"><a href="https://www.kanehealth.com/Pages/Programs.aspx">Kane County health programs ↗</a></div></article>
        </div></section>

        <section id="insights" className="insight-section" aria-labelledby="insight-title"><div className="shell section-block"><div className="section-heading"><div><p className="kicker">Resident impact briefing</p><h2 id="insight-title">What might matter<br />next—and why.</h2></div><div><span className={`analysis-badge ${insightData?.mode === "ai" ? "is-ai" : ""}`}>{insightData?.mode === "ai" ? "AI-assisted analysis" : "Rules-based preview"}</span><p>Facts, cautious implications, unknowns, and source links stay visibly separate.</p></div></div>{insightState === "loading" && !insightData ? <div className="loading-state" role="status"><span className="loading-mark" />Building the impact briefing…</div> : insightData && insightData.insights.length > 0 ? <div className="insight-grid">{insightData.insights.slice(0, 3).map((insight) => <article className="insight-card" key={insight.itemId}><p className="micro-label">{communityName(insight.communityId)} · {insight.impactLevel}</p><h3>{insight.impact}</h3><dl><div><dt>Confirmed</dt><dd>{insight.confirmedFact}</dd></div><div><dt>Who</dt><dd>{insight.affected}</dd></div><div><dt>Best move</dt><dd>{insight.action}</dd></div><div><dt>Unknown</dt><dd>{insight.unknown}</dd></div></dl><a href={insight.sourceUrl}>Verify with {insight.sourceName} ↗</a></article>)}</div> : <EmptyState title="Impact analysis is temporarily unavailable.">Official updates and source links elsewhere on this page remain usable.</EmptyState>}<p className="disclaimer">{insightData?.disclaimer ?? "Analysis never replaces official instructions or emergency alerts."}</p></div></section>

        <section className="economy-section" aria-labelledby="economy-title"><div className="shell section-block"><div className="section-heading"><div><p className="kicker">Local economy & community needs</p><h2 id="economy-title">Signals of demand.<br />Not promises.</h2></div><p>Source-backed signals for businesses, workers, nonprofits, and community builders—with uncertainty made explicit.</p></div>{localEconomy.length > 0 ? <div className="economy-grid">{localEconomy.slice(0, 4).map((item) => <article key={item.id}><p className="micro-label">{communityName(item.communityId)} · {item.status}</p><h3>{item.title}</h3><p>{item.cautiousImplication}</p><small>{item.unknowns.length > 0 ? `Unknown: ${item.unknowns.join(" ")}` : "No material unknown recorded."}</small><a href={item.canonicalUrl}>Inspect the signal ↗</a></article>)}</div> : <EmptyState title="No economic signal has enough evidence in this view.">A gap, event, or construction notice does not prove commercial demand. We will label early evidence as Watch.</EmptyState>}<div className="economy-shortcuts"><span>Verified permanent resources</span><a href="https://www.kanecountyil.gov/WDD/Pages/Default.aspx">Kane County workforce services ↗</a><a href="https://www2.kanecountyil.gov/WDD/Pages/jobBoard.aspx">Kane County job board ↗</a></div></div></section>

        <section id="gap-map" className="gap-section" aria-labelledby="gap-title"><div className="shell gap-layout"><div className="gap-copy"><p className="kicker">Community Gap Map</p><h2 id="gap-title">What would make life<br /><em>better here?</em></h2><p>Share a constructive local need—an accessibility barrier, missing service, family support gap, or underused space. Contributions are reviewed before publication and are never treated as proof of community consensus.</p><ul><li>Use an approximate area, not a home address.</li><li>Do not include names, health details, or other personal information.</li><li>Describe the resident impact and a useful outcome.</li></ul></div><form className="gap-form" onSubmit={submitGap}><div className="field-row"><label>Community<select name="community" defaultValue={community === "all" ? "tri-cities" : community} required><option value="tri-cities">Across the Tri-Cities</option><option value="geneva">Geneva</option><option value="batavia">Batavia</option><option value="st-charles">St. Charles</option></select></label><label>Type of need<select name="category" defaultValue="services-and-programs" required>{gapCategories.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label></div><label>What is missing or getting in the way?<textarea name="summary" minLength={20} maxLength={360} required placeholder="Example: The trail connection ends before reaching the shopping area…" /></label><label htmlFor="gap-location">Approximate location <span>(optional)</span></label><input name="approximateLocation" maxLength={100} minLength={3} id="gap-location" placeholder="Cross streets, park, corridor, or neighborhood—not an address" /><label>How does this affect residents?<textarea name="residentImpact" minLength={20} maxLength={360} required placeholder="Who is affected, and what useful outcome would help?" /></label><button className="primary-button" type="submit" disabled={gapState === "sending"}>{gapState === "sending" ? "Sending for review…" : "Submit for moderation"}</button><p className={`form-status status-${gapState}`} role="status" aria-live="polite">{gapMessage}</p></form></div></section>

        <section id="sources" className="shell section-block source-section" aria-labelledby="sources-title"><div><p className="kicker">Trust center</p><h2 id="sources-title">Evidence you can inspect.</h2><p>Tri-Cities Compass is independent and is not an official government site. It reads public official sources, stores short factual excerpts, and links back to the publisher. It is not a replacement for official emergency alerts.</p><p className="permanent-sources">Official city homes: <a href="https://www.geneva.il.us/">Geneva</a> · <a href="https://www.bataviail.gov/">Batavia</a> · <a href="https://www.stcharlesil.gov/">St. Charles</a></p>{liveData?.cache && <p className="cache-note"><strong>{liveData.cache.stale ? "Last verified snapshot in use." : "Stored snapshot is within its freshness window."}</strong> Stored {formatDate(liveData.cache.storedAt)} · last successful collection {formatDate(liveData.cache.lastSuccessfulAt ?? undefined)}.</p>}</div>{liveData && <ul className="source-health" aria-label="Source health">{liveData.sources.map((source) => { const freshness = liveData.cache?.sources.find((item) => item.sourceId === source.sourceId); const state = freshness?.stale ? "stale—last verified record retained" : source.state; return <li key={source.id}><span className={`health-dot health-${freshness?.stale ? "failed" : source.state}`} aria-hidden="true" /><a href={source.url}>{source.name}</a><span>{source.itemCount} items · {state}{freshness?.lastSuccessfulAt ? ` · last success ${formatDate(freshness.lastSuccessfulAt)}` : ""}</span></li>;})}</ul>}</section>

        <aside className="emergency-banner"><div className="shell"><strong>Immediate danger?</strong><p>Call 911. Do not rely on this site for urgent safety information.</p><a href={countyEmergencyResource.sourceUrl}>Kane County emergency resources ↗</a></div></aside>
      </main>

      <footer className="site-footer"><div className="shell footer-inner"><div><strong>Tri-Cities Compass</strong><p>A source-first quality-of-life platform for Geneva, Batavia, and St. Charles.</p></div><div className="footer-links"><a href="#today">Today</a><a href="#opportunities">Opportunities</a><a href="#life-guides">Resident shortcuts</a><a href="#change-map">Change Map</a><a href="#gap-map">Share a need</a><a href="#sources">Trust center</a></div><p>Official-source excerpts · Visible uncertainty · Device-local preferences</p></div></footer>
      <nav className="mobile-nav" aria-label="Mobile navigation"><a href="#today"><span>●</span>Today</a><a href="#opportunities"><span>↗</span>Act</a><a href="#change-map"><span>◇</span>Change</a><a href="#gap-map"><span>＋</span>Improve</a></nav>
    </>
  );
}
