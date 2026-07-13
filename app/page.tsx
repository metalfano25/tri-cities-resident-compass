"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  communities,
  countyEmergencyResource,
  serviceShortcuts,
  type CommunityId,
} from "./data";
import type {
  LiveDataPayload,
  LiveEvent,
  LiveNotice,
} from "../lib/live-types";

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

function LiveSourceLine({ item }: { item: LiveNotice | LiveEvent }) {
  return (
    <p className="source-line">
      <span className="source-state">Official source</span>
      <span aria-hidden="true">·</span>
      <span>{item.sourceName}</span>
      <span aria-hidden="true">·</span>
      {"publishedAt" in item && item.publishedAt && (
        <>
          <time dateTime={item.publishedAt}>published {formatDate(item.publishedAt)}</time>
          <span aria-hidden="true">·</span>
        </>
      )}
      <time dateTime={item.fetchedAt}>checked {formatDate(item.fetchedAt)}</time>
    </p>
  );
}

function DataState({
  state,
  message,
  onRetry,
}: {
  state: LoadState;
  message?: string;
  onRetry: () => void;
}) {
  if (state === "loading") {
    return (
      <div className="data-state" role="status">
        <strong>Refreshing official sources…</strong>
        <span>Checking city feeds, calendars, and public listings.</span>
      </div>
    );
  }

  return (
    <div className="data-state data-state-error" role="status">
      <strong>Live information could not be refreshed.</strong>
      <span>{message ?? "Official shortcuts remain available below."}</span>
      <button className="secondary-button" type="button" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

export default function Home() {
  const [community, setCommunity] = useState<CommunityFilter>("all");
  const [liveData, setLiveData] = useState<LiveDataPayload | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadMessage, setLoadMessage] = useState<string>();

  const loadLiveData = useCallback(async () => {
    setLoadState("loading");
    setLoadMessage(undefined);
    setLiveData(null);
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
    const refresh = window.setTimeout(() => void loadLiveData(), 0);
    return () => window.clearTimeout(refresh);
  }, [loadLiveData]);

  const selectedLabel =
    filters.find((item) => item.id === community)?.label ?? "All Tri-Cities";

  const visibleNotices = useMemo(
    () =>
      (liveData?.notices ?? []).filter(
        (item) => community === "all" || item.communityId === community,
      ),
    [community, liveData],
  );
  const visibleEvents = useMemo(
    () =>
      (liveData?.events ?? []).filter(
        (item) =>
          item.category === "event" &&
          (community === "all" || item.communityId === community),
      ),
    [community, liveData],
  );
  const visibleMeetings = useMemo(
    () =>
      (liveData?.events ?? []).filter(
        (item) =>
          item.category === "meeting" &&
          (community === "all" || item.communityId === community),
      ),
    [community, liveData],
  );
  const visibleServices = serviceShortcuts.filter(
    (item) => community === "all" || item.communityId === community,
  );

  function selectCommunity(next: CommunityFilter) {
    setCommunity(next);
    const url = new URL(window.location.href);
    if (next === "all") url.searchParams.delete("community");
    else url.searchParams.set("community", next);
    window.history.replaceState({}, "", url);
  }

  const modeLabel =
    liveData?.mode === "live"
      ? "Live official sources"
      : liveData?.mode === "partial"
        ? "Some sources unavailable"
        : loadState === "loading"
          ? "Refreshing official sources"
          : "Live refresh unavailable";

  return (
    <>
      <a className="skip-link" href="#today">
        Skip to today&apos;s updates
      </a>

      <header className="site-header">
        <div className="shell header-inner">
          <a className="brand" href="#top" aria-label="Tri-Cities Compass home">
            <span className="brand-mark" aria-hidden="true">TC</span>
            <span>
              <strong>Tri-Cities Compass</strong>
              <small>Geneva · Batavia · St. Charles</small>
            </span>
          </a>
          <nav aria-label="Page sections">
            <a href="#week">This week</a>
            <a href="#services">Shortcuts</a>
            <a href="#sources">About sources</a>
          </nav>
        </div>
      </header>

      <main id="top">
        <div className="notice-strip">
          <div className="shell notice-inner">
            <strong>{modeLabel}</strong>
            <span>
              Independent service. Always confirm urgent details with the linked agency.
            </span>
            {loadState !== "loading" && (
              <button className="strip-button" type="button" onClick={loadLiveData}>
                Refresh
              </button>
            )}
          </div>
        </div>

        <section className="shell hero" aria-labelledby="today-title">
          <fieldset className="community-picker">
            <legend>Show updates for</legend>
            <div className="chip-row">
              {filters.map((filter) => (
                <label className="community-chip" key={filter.id}>
                  <input
                    type="radio"
                    name="community"
                    value={filter.id}
                    checked={community === filter.id}
                    onChange={() => selectCommunity(filter.id)}
                  />
                  <span>
                    <span className="chip-check" aria-hidden="true">✓</span>
                    {filter.label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="hero-copy">
            <p className="eyebrow">{todayLabel()} · Fox River communities</p>
            <h1 id="today-title">What affects me today?</h1>
            <p className="hero-summary">
              Current city updates, upcoming events, public meetings, and official resident services in one place.
            </p>
            <p className="result-summary" aria-live="polite" aria-atomic="true">
              {loadState === "ready"
                ? `${visibleNotices.length} updates published in the last 21 days for ${selectedLabel}.`
                : loadState === "loading"
                  ? `Checking official sources for ${selectedLabel}.`
                  : `Live refresh is unavailable for ${selectedLabel}.`}
            </p>
          </div>
        </section>

        <section id="today" className="shell section-block today-section" aria-labelledby="today-updates-title">
          <div className="section-heading">
            <div>
              <p className="kicker">Latest from local agencies</p>
              <h2 id="today-updates-title">Recent resident updates</h2>
            </div>
            <p>Official excerpts with direct source links and visible retrieval times.</p>
          </div>

          {loadState !== "ready" ? (
            <DataState state={loadState} message={loadMessage} onRetry={loadLiveData} />
          ) : visibleNotices.length === 0 ? (
            <div className="data-state">
              <strong>No recent updates were returned for {selectedLabel}.</strong>
              <span>Use the resident shortcuts below to check that community directly.</span>
            </div>
          ) : (
            <div className="today-grid">
              {visibleNotices.map((update, index) => (
                <article className={`update-card ${index === 0 ? "priority-card" : ""}`} key={update.id}>
                  <div className="card-labels">
                    <span className="type-label">{update.kind.replace("-", " ")}</span>
                    <span>{communityName(update.communityId)}</span>
                    <span className="live-label">Live source</span>
                  </div>
                  <h3>{update.title}</h3>
                  <p className="card-copy">{update.summary}</p>
                  <LiveSourceLine item={update} />
                  <a className="text-link" href={update.canonicalUrl}>Read the official update</a>
                </article>
              ))}
            </div>
          )}
        </section>

        <section id="week" className="section-tint" aria-labelledby="week-title">
          <div className="shell section-block">
            <div className="section-heading">
              <div>
                <p className="kicker">Plan ahead</p>
                <h2 id="week-title">The next two weeks around the Tri-Cities</h2>
              </div>
              <p>Upcoming events from official city and park-district calendars.</p>
            </div>
            {loadState === "ready" && visibleEvents.length > 0 ? (
              <div className="event-list">
                {visibleEvents.map((event) => (
                  <article className="event-row" key={event.id}>
                    <div className="event-date" aria-hidden="true">
                      <span>{event.dateLabel.split(" ")[0]}</span>
                      <strong>{event.dateLabel.match(/\d+/)?.[0] ?? "—"}</strong>
                    </div>
                    <div className="event-details">
                      <div className="card-labels">
                        <span>{communityName(event.communityId)}</span>
                        <span className="live-label">Official calendar</span>
                      </div>
                      <h3>{event.title}</h3>
                      <p className="event-meta">{event.dateLabel} · {event.timeLabel}</p>
                      <p>{event.location}</p>
                      <LiveSourceLine item={event} />
                    </div>
                    <a className="row-link" href={event.canonicalUrl} aria-label={`View official event: ${event.title}`}>
                      View official event
                    </a>
                  </article>
                ))}
              </div>
            ) : loadState === "error" ? (
              <DataState state={loadState} message={loadMessage} onRetry={loadLiveData} />
            ) : (
              <div className="data-state">
                <strong>{loadState === "loading" ? "Loading upcoming events…" : "No upcoming events were returned."}</strong>
                <span>Official calendar links remain available in Resident shortcuts.</span>
              </div>
            )}
          </div>
        </section>

        <section className="shell section-block" aria-labelledby="meetings-title">
          <div className="section-heading">
            <div>
              <p className="kicker">Public business</p>
              <h2 id="meetings-title">Civic meetings</h2>
            </div>
            <p>Meeting dates from official municipal calendars; verify agendas at the source.</p>
          </div>
          {loadState === "ready" && visibleMeetings.length > 0 ? (
            <div className="meeting-grid">
              {visibleMeetings.map((meeting) => (
                <article className="meeting-card" key={meeting.id}>
                  <div className="card-labels">
                    <span>{communityName(meeting.communityId)}</span>
                    <span className="live-label">Official calendar</span>
                  </div>
                  <h3>{meeting.title}</h3>
                  <dl className="meeting-facts">
                    <div><dt>When</dt><dd>{meeting.dateLabel}, {meeting.timeLabel}</dd></div>
                    <div><dt>Where</dt><dd>{meeting.location}</dd></div>
                  </dl>
                  <LiveSourceLine item={meeting} />
                  <a className="text-link" href={meeting.canonicalUrl}>Open official meeting information</a>
                </article>
              ))}
            </div>
          ) : loadState === "error" ? (
            <DataState state={loadState} message={loadMessage} onRetry={loadLiveData} />
          ) : (
            <div className="data-state">
              <strong>No meetings are available in the current live response.</strong>
              <span>Use the official agenda and city-calendar shortcuts below.</span>
            </div>
          )}
        </section>

        <section id="services" className="section-tint" aria-labelledby="services-title">
          <div className="shell section-block">
            <div className="section-heading">
              <div>
                <p className="kicker">Get something done</p>
                <h2 id="services-title">Resident shortcuts</h2>
              </div>
              <p>Go straight to the official organization responsible for the service.</p>
            </div>
            <ul className="service-grid">
              {visibleServices.map((service) => (
                <li key={service.id}>
                  <a className="service-tile" href={service.sourceUrl}>
                    <span className="service-category">{service.category}</span>
                    <strong>{service.title}</strong>
                    <span>{service.description}</span>
                    <small>{service.jurisdiction} · {service.actionLabel}</small>
                  </a>
                </li>
              ))}
              <li>
                <a className="service-tile emergency-tile" href={countyEmergencyResource.sourceUrl}>
                  <span className="service-category">County resource</span>
                  <strong>{countyEmergencyResource.title}</strong>
                  <span>{countyEmergencyResource.description}</span>
                  <small>Kane County · {countyEmergencyResource.actionLabel}</small>
                </a>
              </li>
            </ul>
          </div>
        </section>

        <section id="sources" className="shell section-block source-explainer" aria-labelledby="sources-title">
          <div>
            <p className="kicker">Source health</p>
            <h2 id="sources-title">A compass, not the source of record</h2>
          </div>
          <div className="explainer-copy">
            <p>
              This independent service reads public RSS, iCal, and municipal listings from Geneva, Batavia,
              St. Charles, and their public agencies. It is not operated by those agencies and is not an emergency alert replacement.
            </p>
            <p>
              We retain short factual excerpts and canonical links—not full articles or agency images. The linked agency remains
              authoritative for accuracy, cancellations, eligibility, and current conditions.
            </p>
            {liveData && (
              <ul className="source-health" aria-label="Live source status">
                {liveData.sources.map((source) => (
                  <li key={source.id}>
                    <span className={`health-dot health-${source.state}`} aria-hidden="true" />
                    <a href={source.url}>{source.name}</a>
                    <span>{source.itemCount} items · {source.state}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <aside className="emergency-banner" aria-labelledby="emergency-title">
          <div className="shell emergency-inner">
            <div>
              <p className="kicker">Immediate help</p>
              <h2 id="emergency-title">This is not an emergency service.</h2>
            </div>
            <p><strong>Call 911 for an emergency.</strong> Do not rely on this site for urgent safety information.</p>
          </div>
        </aside>
      </main>

      <footer className="site-footer">
        <div className="shell footer-inner">
          <div>
            <strong>Tri-Cities Compass</strong>
            <p>Independent civic utility for Geneva, Batavia, and St. Charles, Illinois.</p>
          </div>
          <div className="footer-links">
            <a href="#today">Today</a>
            <a href="#services">Resident shortcuts</a>
            <a href="#sources">Source policy</a>
          </div>
          <p className="footer-note">Official-source excerpts · Visible freshness · Call 911 for emergencies</p>
        </div>
      </footer>
    </>
  );
}
