"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  communities,
  countyEmergencyResource,
  serviceShortcuts,
  type CommunityId,
} from "./data";
import type { LiveDataPayload, LiveEvent, LiveNotice } from "../lib/live-types";
import type { InsightPayload } from "../lib/insight-types";

type CommunityFilter = "all" | CommunityId;
type LoadState = "loading" | "ready" | "error";

const filters: Array<{ id: CommunityFilter; label: string }> = [
  { id: "all", label: "All Tri-Cities" },
  ...communities.map((item) => ({ id: item.id, label: item.shortName })),
];

const communityName = (id: CommunityId) =>
  communities.find((item) => item.id === id)?.shortName ?? id;

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
    timeZoneName: "short",
  }).format(new Date(value));

const todayLabel = () =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "America/Chicago",
  }).format(new Date());

function parseCommunity(value: string | null): CommunityFilter {
  return filters.some((filter) => filter.id === value)
    ? (value as CommunityFilter)
    : "all";
}

function LiveSourceLine({ item }: { item: LiveNotice | LiveEvent }) {
  return (
    <p className="source-line">
      <span className="source-state">Official source</span>
      <span aria-hidden="true">·</span>
      <span>{item.sourceName}</span>
      {"publishedAt" in item && item.publishedAt && (
        <>
          <span aria-hidden="true">·</span>
          <time dateTime={item.publishedAt}>published {formatDate(item.publishedAt)}</time>
        </>
      )}
      <span aria-hidden="true">·</span>
      <time dateTime={item.fetchedAt}>checked {formatDate(item.fetchedAt)}</time>
    </p>
  );
}

function DataState({ state, message, onRetry }: {
  state: LoadState;
  message?: string;
  onRetry: () => void;
}) {
  if (state === "loading") {
    return (
      <div className="data-state" role="status">
        <span className="loading-mark" aria-hidden="true" />
        <strong>Refreshing official sources…</strong>
        <span>Checking city feeds, calendars, and public listings.</span>
      </div>
    );
  }
  return (
    <div className="data-state data-state-error" role="status">
      <strong>Live information could not be refreshed.</strong>
      <span>{message ?? "Official shortcuts remain available below."}</span>
      <button className="secondary-button" type="button" onClick={onRetry}>Try again</button>
    </div>
  );
}

export default function Home() {
  const [community, setCommunity] = useState<CommunityFilter>("all");
  const [liveData, setLiveData] = useState<LiveDataPayload | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadMessage, setLoadMessage] = useState<string>();
  const [insightData, setInsightData] = useState<InsightPayload | null>(null);
  const [insightState, setInsightState] = useState<LoadState>("loading");

  const loadLiveData = useCallback(async () => {
    setLoadState("loading");
    setLoadMessage(undefined);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch("/api/live", {
        cache: "no-store",
        signal: controller.signal,
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error(`Source refresh returned ${response.status}`);
      const payload = (await response.json()) as LiveDataPayload;
      if (!Array.isArray(payload.notices) || !Array.isArray(payload.events)) {
        throw new Error("Source refresh returned an invalid response");
      }
      setLiveData(payload);
      setLoadState("ready");
    } catch (error) {
      setLoadState("error");
      setLoadMessage(
        error instanceof Error && error.name !== "AbortError"
          ? error.message
          : "The source refresh timed out.",
      );
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    const syncFromUrl = () =>
      setCommunity(parseCommunity(new URL(window.location.href).searchParams.get("community")));
    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    const refresh = window.setTimeout(() => void loadLiveData(), 0);
    return () => {
      window.clearTimeout(refresh);
      window.removeEventListener("popstate", syncFromUrl);
    };
  }, [loadLiveData]);

  useEffect(() => {
    if (!liveData) return;
    const controller = new AbortController();
    let requestTimeout: number | undefined;
    const start = window.setTimeout(() => {
      setInsightData(null);
      setInsightState("loading");
      requestTimeout = window.setTimeout(() => controller.abort(), 20_000);
      void fetch(`/api/insights?community=${encodeURIComponent(community)}`, {
        cache: "no-store",
        signal: controller.signal,
        headers: { accept: "application/json" },
      })
        .then(async (response) => {
          if (!response.ok) throw new Error(`Insight refresh returned ${response.status}`);
          const payload = (await response.json()) as InsightPayload;
          if (!Array.isArray(payload.insights)) throw new Error("Invalid insight response");
          if (payload.scope !== community) throw new Error("Insight scope did not match the selected community");
          setInsightData(payload);
          setInsightState("ready");
        })
        .catch(() => {
          if (!controller.signal.aborted) setInsightState("error");
        })
        .finally(() => window.clearTimeout(requestTimeout));
    }, 0);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(requestTimeout);
      controller.abort();
    };
  }, [community, liveData]);

  const selectedLabel = filters.find((item) => item.id === community)?.label ?? "All Tri-Cities";
  const visibleNotices = useMemo(
    () => (liveData?.notices ?? []).filter((item) => community === "all" || item.communityId === community),
    [community, liveData],
  );
  const visibleEvents = useMemo(
    () => (liveData?.events ?? []).filter((item) => item.category === "event" && (community === "all" || item.communityId === community)),
    [community, liveData],
  );
  const visibleMeetings = useMemo(
    () => (liveData?.events ?? []).filter((item) => item.category === "meeting" && (community === "all" || item.communityId === community)),
    [community, liveData],
  );
  const visibleServices = serviceShortcuts.filter(
    (item) => community === "all" || item.communityId === community,
  );
  const healthySources = liveData?.sources.filter((source) => source.state === "ok").length ?? 0;
  const modeLabel = liveData?.mode === "live"
    ? "All systems current"
    : liveData?.mode === "partial"
      ? "Some sources unavailable"
      : loadState === "loading"
        ? "Scanning official sources"
        : "Live refresh unavailable";

  function selectCommunity(next: CommunityFilter) {
    setCommunity(next);
    const url = new URL(window.location.href);
    if (next === "all") url.searchParams.delete("community");
    else url.searchParams.set("community", next);
    window.history.pushState({}, "", url);
  }

  return (
    <>
      <a className="skip-link" href="#today">Skip to today&apos;s updates</a>

      <header className="site-header">
          <div className="shell header-inner">
            <a className="brand" href="#top" aria-label="Tri-Cities Compass home">
              <span className="brand-mark" aria-hidden="true"><i />TC</span>
              <span><strong>Tri-Cities Compass</strong><small>Fox River · Illinois</small></span>
            </a>
            <nav aria-label="Page sections">
              <a href="#insights">AI briefing</a><a href="#today">Today</a><a href="#week">This week</a><a href="#services">Services</a>
            </nav>
            <button
              className="refresh-button"
              type="button"
              onClick={loadLiveData}
              disabled={loadState === "loading"}
              aria-busy={loadState === "loading"}
              aria-label={loadState === "loading" ? "Refreshing official sources" : "Refresh official sources"}
            >
              <span aria-hidden="true">↻</span><span className="refresh-label">{loadState === "loading" ? "Refreshing…" : "Refresh"}</span>
            </button>
          </div>
      </header>

      <main id="top">
        <div className="hero-surface">
          <section className="shell hero" aria-labelledby="today-title">
            <div className="hero-copy">
              <p className="eyebrow"><span className="signal-dot" /> {todayLabel()}</p>
              <h1 id="today-title">Your cities.<br /><em>In signal.</em></h1>
              <p className="hero-summary">A live resident briefing for Geneva, Batavia, and St. Charles—official updates, useful events, and the fastest path to local services.</p>
              <fieldset className="community-picker">
                <legend>Focus your briefing</legend>
                <div className="chip-row">
                  {filters.map((filter) => (
                    <label className={`community-chip city-${filter.id}`} key={filter.id}>
                      <input type="radio" name="community" value={filter.id} checked={community === filter.id} onChange={() => selectCommunity(filter.id)} />
                      <span><span className="chip-check" aria-hidden="true">●</span>{filter.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <p className="result-summary" aria-live="polite" aria-atomic="true">
                {loadState === "ready"
                  ? `${visibleNotices.length} current updates for ${selectedLabel}. Checked ${formatDate(liveData!.generatedAt)}.`
                  : loadState === "loading"
                    ? `Checking official sources for ${selectedLabel}.`
                    : `Live refresh is unavailable for ${selectedLabel}.`}
              </p>
            </div>

            <aside className="signal-panel" aria-label="Live briefing totals">
              <div className="signal-panel-head"><span>Live across the Tri-Cities</span><strong>{modeLabel}</strong></div>
              <div className="metric-grid">
                <div><strong>{liveData?.notices.length ?? "—"}</strong><span>Updates</span></div>
                <div><strong>{liveData ? visibleEvents.length : "—"}</strong><span>Events</span></div>
                <div><strong>{liveData ? visibleMeetings.length : "—"}</strong><span>Meetings</span></div>
                <div><strong>{healthySources}/{liveData?.sources.length ?? "—"}</strong><span>Sources healthy</span></div>
              </div>
              <p>Independent civic utility. Always confirm urgent details with the linked agency.</p>
            </aside>
          </section>
        </div>

      <section id="insights" className="insight-section" aria-labelledby="insight-title">
        <div className="shell section-block">
          <div className="insight-heading">
            <div>
              <p className="kicker">Resident impact briefing</p>
              <h2 id="insight-title">What could this<br /><em>mean for you?</em></h2>
            </div>
            <div className="insight-intro">
              <span className={`analysis-badge ${insightData?.mode === "ai" ? "is-ai" : ""}`}>
                {insightData?.mode === "ai" ? "AI-assisted analysis" : "Automated impact preview"}
              </span>
              <p>Practical implications drawn from current official records, with confirmed facts kept separate from cautious inference.</p>
              {insightData && <small>Analysis generated {formatDate(insightData.generatedAt)} · refreshed when official records change</small>}
            </div>
          </div>

          {insightState === "loading" && !insightData ? (
            <div className="insight-loading" role="status"><span className="loading-mark" aria-hidden="true" /><strong>Analyzing current local impacts…</strong><span>Checking what may change, who could be affected, and what residents can do.</span></div>
          ) : insightData && insightData.insights.length > 0 ? (
            <div className={`insight-grid ${insightState === "loading" ? "is-refreshing" : ""}`} aria-busy={insightState === "loading"}>
              {insightData.insights.map((insight, index) => (
                <article className={`insight-card level-${insight.impactLevel} city-accent-${insight.communityId}`} key={insight.itemId}>
                  <div className="insight-rank"><span>{String(index + 1).padStart(2, "0")}</span><span>{communityName(insight.communityId)}</span></div>
                  <div className="impact-meta"><span>{insight.impactLevel}</span><span>{insight.confidence} source detail</span></div>
                  <h3>{insight.impact}</h3>
                  <dl className="impact-facts">
                    <div><dt>Who</dt><dd>{insight.affected}</dd></div>
                    <div><dt>When</dt><dd>{insight.timing}</dd></div>
                    <div><dt>Best move</dt><dd>{insight.action}</dd></div>
                  </dl>
                  <details className="analysis-details">
                    <summary>See the evidence and reasoning</summary>
                    <div><strong>Confirmed by source</strong><p>{insight.confirmedFact}</p></div>
                    <div><strong>{insightData.mode === "ai" ? "AI assessment" : "Planning inference"}</strong><p>{insight.inference}</p></div>
                    <div><strong>What we don&apos;t know</strong><p>{insight.unknown}</p></div>
                  </details>
                  <a className="insight-source" href={insight.sourceUrl}>Verify with {insight.sourceName} <span aria-hidden="true">↗</span></a>
                </article>
              ))}
            </div>
          ) : (
            <div className="insight-loading"><strong>Impact analysis is temporarily unavailable.</strong><span>The official updates and source links below remain current and usable.</span></div>
          )}
          <p className="insight-disclaimer">{insightData?.disclaimer ?? "Analysis never replaces official instructions or emergency alerts."}</p>
        </div>
      </section>

      <section id="today" className="shell section-block today-section" aria-labelledby="today-updates-title">
        <div className="section-heading"><div><p className="kicker">Your daily briefing</p><h2 id="today-updates-title">What affects you now</h2></div><p>Recent official notices, prioritized for a quick scan.</p></div>
        <div className="briefing-layout">
          <div>
            {loadState !== "ready" && !liveData ? (
              <DataState state={loadState} message={loadMessage} onRetry={loadLiveData} />
            ) : visibleNotices.length === 0 ? (
              <div className="data-state"><strong>No recent updates were returned for {selectedLabel}.</strong><span>Use the shortcuts to check that community directly.</span></div>
            ) : (
              <div className={`today-grid ${loadState === "loading" ? "is-refreshing" : ""}`} aria-busy={loadState === "loading"}>
                {visibleNotices.map((update, index) => (
                  <article className={`update-card city-accent-${update.communityId} ${index === 0 ? "priority-card" : ""}`} key={update.id} style={{ "--delay": `${Math.min(index, 5) * 45}ms` } as React.CSSProperties}>
                    <div className="card-labels"><span className="type-label">{update.kind.replace("-", " ")}</span><span>{communityName(update.communityId)}</span><span className="live-label">Official notice</span></div>
                    <h3>{update.title}</h3>
                    <p className="card-copy">{update.summary}</p>
                    <LiveSourceLine item={update} />
                    <a className="text-link" href={update.canonicalUrl}>Read official update <span aria-hidden="true">↗</span></a>
                  </article>
                ))}
              </div>
            )}
          </div>
          <aside className="quick-rail" aria-labelledby="quick-title">
            <div className="rail-heading"><p className="kicker">Direct paths</p><h3 id="quick-title">Get it done</h3></div>
            {visibleServices.slice(0, 5).map((service, index) => (
              <a href={service.sourceUrl} className="quick-link" key={service.id}>
                <span>{String(index + 1).padStart(2, "0")}</span><strong>{service.title}</strong><i aria-hidden="true">↗</i>
              </a>
            ))}
            <a className="quick-link quick-emergency" href={countyEmergencyResource.sourceUrl}><span>!</span><strong>Kane County emergency resources</strong><i aria-hidden="true">↗</i></a>
          </aside>
        </div>
      </section>

      <section id="week" className="section-dark" aria-labelledby="week-title">
        <div className="shell section-block">
          <div className="section-heading"><div><p className="kicker">Next on the river</p><h2 id="week-title">The next two weeks</h2></div><p>Events and public meetings from official local calendars.</p></div>
          {liveData && visibleEvents.length > 0 ? (
            <div className={`event-list ${loadState === "loading" ? "is-refreshing" : ""}`} aria-busy={loadState === "loading"}>
              {visibleEvents.map((event) => (
                <article className={`event-row city-accent-${event.communityId}`} key={event.id}>
                  <div className="event-date" aria-hidden="true"><span>{event.dateLabel.split(" ")[0]}</span><strong>{event.dateLabel.match(/\d+/)?.[0] ?? "—"}</strong></div>
                  <div className="event-details"><div className="card-labels"><span>{communityName(event.communityId)}</span><span className="live-label">Official calendar</span></div><h3>{event.title}</h3><p className="event-meta">{event.dateLabel} · {event.timeLabel}</p><p>{event.location}</p><LiveSourceLine item={event} /></div>
                  <a className="row-link" href={event.canonicalUrl} aria-label={`View official event: ${event.title}`}>View event <span aria-hidden="true">↗</span></a>
                </article>
              ))}
            </div>
          ) : !liveData && loadState === "error" ? <DataState state={loadState} message={loadMessage} onRetry={loadLiveData} /> : <div className="data-state"><strong>{!liveData && loadState === "loading" ? "Loading upcoming events…" : "No upcoming events were returned."}</strong></div>}
        </div>
      </section>

      <section className="shell section-block" aria-labelledby="meetings-title">
        <div className="section-heading"><div><p className="kicker">Public business</p><h2 id="meetings-title">Civic meetings</h2></div><p>Official meeting dates with direct agenda and detail links.</p></div>
        {liveData && visibleMeetings.length > 0 ? (
          <div className={`meeting-grid ${loadState === "loading" ? "is-refreshing" : ""}`} aria-busy={loadState === "loading"}>
            {visibleMeetings.map((meeting) => (
              <article className={`meeting-card city-accent-${meeting.communityId}`} key={meeting.id}>
                <div className="card-labels"><span>{communityName(meeting.communityId)}</span><span className="live-label">Official calendar</span></div>
                <h3>{meeting.title}</h3>
                <dl className="meeting-facts"><div><dt>When</dt><dd>{meeting.dateLabel}, {meeting.timeLabel}</dd></div><div><dt>Where</dt><dd>{meeting.location}</dd></div></dl>
                <LiveSourceLine item={meeting} />
                <a className="text-link" href={meeting.canonicalUrl}>Open meeting information <span aria-hidden="true">↗</span></a>
              </article>
            ))}
          </div>
        ) : <div className="data-state"><strong>No meetings are available in the current response.</strong><span>Official agenda shortcuts remain available below.</span></div>}
      </section>

      <section id="services" className="section-soft" aria-labelledby="services-title">
        <div className="shell section-block">
          <div className="section-heading"><div><p className="kicker">Resident launchpad</p><h2 id="services-title">Skip the search.<br />Start the task.</h2></div><p>Direct links to the official organization responsible for each service.</p></div>
          <ul className="service-grid">
            {visibleServices.map((service, index) => (
              <li key={service.id}><a className="service-tile" href={service.sourceUrl}><span className="service-index">{String(index + 1).padStart(2, "0")}</span><span className="service-category">{service.category}</span><strong>{service.title}</strong><span>{service.description}</span><small>{service.jurisdiction} · {service.actionLabel} <b aria-hidden="true">↗</b></small></a></li>
            ))}
            <li><a className="service-tile emergency-tile" href={countyEmergencyResource.sourceUrl}><span className="service-index">!</span><span className="service-category">County resource</span><strong>{countyEmergencyResource.title}</strong><span>{countyEmergencyResource.description}</span><small>Kane County · {countyEmergencyResource.actionLabel} <b aria-hidden="true">↗</b></small></a></li>
          </ul>
        </div>
      </section>

      <section id="sources" className="shell section-block source-explainer" aria-labelledby="sources-title">
        <div><p className="kicker">Signal integrity</p><h2 id="sources-title">A compass,<br />not the source of record.</h2></div>
        <div className="explainer-copy"><p>This independent service reads public RSS, iCal, and municipal listings from Geneva, Batavia, St. Charles, and their public agencies. It is not operated by those agencies and is not an emergency alert replacement.</p><p>We retain short factual excerpts and canonical links—not full articles or agency images. The linked agency remains authoritative for accuracy, cancellations, eligibility, and current conditions.</p>
          {liveData && <ul className="source-health" aria-label="Live source status">{liveData.sources.map((source) => <li key={source.id}><span className={`health-dot health-${source.state}`} aria-hidden="true" /><a href={source.url}>{source.name}</a><span>{source.itemCount} items · {source.state}</span></li>)}</ul>}
        </div>
      </section>

      <aside className="emergency-banner" aria-labelledby="emergency-title"><div className="shell emergency-inner"><div><p className="kicker">Immediate help</p><h2 id="emergency-title">This is not an emergency service.</h2></div><p><strong>Call 911 for an emergency.</strong> Do not rely on this site for urgent safety information.</p></div></aside>
      </main>

      <footer className="site-footer"><div className="shell footer-inner"><div><strong>Tri-Cities Compass</strong><p>Independent civic utility for Geneva, Batavia, and St. Charles, Illinois.</p></div><div className="footer-links"><a href="#today">Today</a><a href="#services">Resident shortcuts</a><a href="#sources">Source policy</a></div><p className="footer-note">Official-source excerpts · Visible freshness · Call 911 for emergencies</p></div></footer>
      <nav className="mobile-nav" aria-label="Mobile page sections"><a href="#insights"><span>✦</span>Insights</a><a href="#today"><span>●</span>Today</a><a href="#week"><span>◇</span>Events</a><a href="#services"><span>↗</span>Services</a></nav>
    </>
  );
}
