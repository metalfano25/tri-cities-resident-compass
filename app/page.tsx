"use client";

import { useState } from "react";
import {
  communities,
  countyEmergencyResource,
  meetings,
  serviceShortcuts,
  todayUpdates,
  upcomingEvents,
  type CommunityId,
  type SourceMetadata,
} from "./data";

type CommunityFilter = "all" | CommunityId;

const filters: Array<{ id: CommunityFilter; label: string }> = [
  { id: "all", label: "All Tri-Cities" },
  ...communities.map((community) => ({
    id: community.id,
    label: community.shortName,
  })),
];

const communityName = (id: CommunityId) =>
  communities.find((community) => community.id === id)?.shortName ?? id;

const sourceState = (record: SourceMetadata) =>
  record.freshness === "check-source" || record.status === "verify-with-source"
    ? "Verify at source"
    : record.freshness === "evergreen"
      ? "Official resource"
      : "Current source";

function SourceLine({ record }: { record: SourceMetadata }) {
  return (
    <p className="source-line">
      <span className="source-state">{sourceState(record)}</span>
      <span aria-hidden="true">·</span>
      <span>{record.sourceLabel}</span>
      <span aria-hidden="true">·</span>
      <time dateTime={record.lastChecked} title="July 12, 2026 at 9:00 AM CT">
        demo checked Jul 12
      </time>
    </p>
  );
}

export default function Home() {
  const [community, setCommunity] = useState<CommunityFilter>("all");

  const selectedLabel =
    filters.find((filter) => filter.id === community)?.label ?? "All Tri-Cities";
  const visibleToday = todayUpdates.filter(
    (item) => community === "all" || item.communityId === community,
  );
  const visibleEvents = upcomingEvents.filter(
    (event) => community === "all" || event.communityId === community,
  );
  const visibleMeetings = meetings.filter(
    (meeting) => community === "all" || meeting.communityId === community,
  );
  const visibleServices = serviceShortcuts.filter(
    (service) => community === "all" || service.communityId === community,
  );

  function selectCommunity(next: CommunityFilter) {
    setCommunity(next);
    const url = new URL(window.location.href);
    if (next === "all") url.searchParams.delete("community");
    else url.searchParams.set("community", next);
    window.history.replaceState({}, "", url);
  }

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
            <strong>Independent demo</strong>
            <span>
              Sample listings are not live alerts. Always verify details with the linked official source.
            </span>
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
            <p className="eyebrow">Sunday, July 12 · Fox River communities</p>
            <h1 id="today-title">What affects me today?</h1>
            <p className="hero-summary">
              One clear starting point for timely city notices, events, meetings, and everyday services.
            </p>
            <p className="result-summary" aria-live="polite" aria-atomic="true">
              Showing {visibleToday.length} demo updates for {selectedLabel}.
            </p>
          </div>
        </section>

        <section id="today" className="shell section-block today-section" aria-labelledby="today-updates-title">
          <div className="section-heading">
            <div>
              <p className="kicker">Start here</p>
              <h2 id="today-updates-title">Today&apos;s resident updates</h2>
            </div>
            <p>Official destinations, clearly labeled demo context.</p>
          </div>

          <div className="today-grid">
            {visibleToday.map((update, index) => (
              <article className={`update-card ${index === 0 ? "priority-card" : ""}`} key={update.id}>
                <div className="card-labels">
                  <span className="type-label">{update.kind}</span>
                  <span>{communityName(update.communityId)}</span>
                  {update.isDemo && <span className="demo-label">Demo data</span>}
                </div>
                <h3>{update.title}</h3>
                <p className="card-copy">{update.summary}</p>
                <SourceLine record={update} />
                <a className="text-link" href={update.sourceUrl}>
                  {update.actionLabel}
                </a>
              </article>
            ))}
          </div>
        </section>

        <section id="week" className="section-tint" aria-labelledby="week-title">
          <div className="shell section-block">
            <div className="section-heading">
              <div>
                <p className="kicker">Plan ahead</p>
                <h2 id="week-title">This week around the Tri-Cities</h2>
              </div>
              <p>Sample events—confirm date, venue, and registration before going.</p>
            </div>
            <div className="event-list">
              {visibleEvents.map((event) => (
                <article className="event-row" key={event.id}>
                  <div className="event-date" aria-hidden="true">
                    <span>Sample</span>
                    <strong>{event.dateLabel.match(/\d+/)?.[0] ?? "—"}</strong>
                  </div>
                  <div className="event-details">
                    <div className="card-labels">
                      <span>{communityName(event.communityId)}</span>
                      <span className="demo-label">Demo event</span>
                    </div>
                    <h3>{event.title}</h3>
                    <p className="event-meta">{event.dateLabel} · {event.timeLabel}</p>
                    <p>{event.location} · {event.costLabel}</p>
                    <SourceLine record={event} />
                  </div>
                  <a className="row-link" href={event.sourceUrl} aria-label={`${event.actionLabel}: ${event.title}`}>
                    {event.actionLabel}
                  </a>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="shell section-block" aria-labelledby="meetings-title">
          <div className="section-heading">
            <div>
              <p className="kicker">Public business</p>
              <h2 id="meetings-title">Civic meetings</h2>
            </div>
            <p>Sample timing with direct links to public information.</p>
          </div>
          <div className="meeting-grid">
            {visibleMeetings.map((meeting) => (
              <article className="meeting-card" key={meeting.id}>
                <div className="card-labels">
                  <span>{communityName(meeting.communityId)}</span>
                  <span className="demo-label">Demo meeting</span>
                </div>
                <p className="meeting-body">{meeting.body}</p>
                <h3>{meeting.title}</h3>
                <dl className="meeting-facts">
                  <div><dt>When</dt><dd>{meeting.dateLabel}, {meeting.timeLabel}</dd></div>
                  <div><dt>Where</dt><dd>{meeting.location}</dd></div>
                  <div><dt>Agenda</dt><dd>Verify availability at the official source</dd></div>
                </dl>
                <SourceLine record={meeting} />
                <a className="text-link" href={meeting.sourceUrl}>{meeting.agendaLabel}</a>
              </article>
            ))}
          </div>
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
            <p className="kicker">How to use this site</p>
            <h2 id="sources-title">A compass, not the source of record</h2>
          </div>
          <div className="explainer-copy">
            <p>
              This independent prototype organizes links to public information. It is not operated by Geneva,
              Batavia, St. Charles, Kane County, or any park district. It is not an emergency alert replacement.
            </p>
            <p>
              Every time-sensitive item in this version is labeled <strong>Demo data</strong> and
              <strong> Verify at source</strong>. The linked public agency remains the authority for accuracy,
              cancellations, eligibility, and current conditions.
            </p>
          </div>
        </section>

        <aside className="emergency-banner" aria-labelledby="emergency-title">
          <div className="shell emergency-inner">
            <div>
              <p className="kicker">Immediate help</p>
              <h2 id="emergency-title">This is not an emergency service.</h2>
            </div>
            <p><strong>Call 911 for an emergency.</strong> Do not rely on this demo for urgent safety information.</p>
          </div>
        </aside>
      </main>

      <footer className="site-footer">
        <div className="shell footer-inner">
          <div>
            <strong>Tri-Cities Compass</strong>
            <p>Independent civic-utility prototype for Geneva, Batavia, and St. Charles, Illinois.</p>
          </div>
          <div className="footer-links">
            <a href="#today">Today</a>
            <a href="#services">Resident shortcuts</a>
            <a href="#sources">Source policy</a>
          </div>
          <p className="footer-note">Demo data · Verify at official sources · Call 911 for emergencies</p>
        </div>
      </footer>
    </>
  );
}
