export type CommunityId = "geneva" | "batavia" | "st-charles";

export type Jurisdiction =
  | "Geneva"
  | "Batavia"
  | "St. Charles"
  | "Kane County"
  | "Tri-Cities";

export type Freshness = "current" | "scheduled" | "evergreen" | "check-source";

export type RecordStatus =
  | "active"
  | "informational"
  | "registration-open"
  | "scheduled"
  | "verify-with-source";

export type UpdateKind = "notice" | "service" | "weather" | "community";
export type EventCategory = "family" | "outdoors" | "arts" | "civic" | "market";
export type ServiceCategory =
  | "utilities"
  | "waste"
  | "permits"
  | "report"
  | "alerts"
  | "emergency";

export interface SourceMetadata {
  sourceLabel: string;
  sourceUrl: string;
  jurisdiction: Jurisdiction;
  lastChecked: string;
  freshness: Freshness;
  status: RecordStatus;
}

export interface Community extends SourceMetadata {
  id: CommunityId;
  name: string;
  shortName: string;
  eyebrow: string;
  description: string;
  accent: string;
}

export interface TodayUpdate extends SourceMetadata {
  id: string;
  communityId: CommunityId;
  kind: UpdateKind;
  title: string;
  summary: string;
  actionLabel: string;
  priority: "standard" | "important";
  isDemo: boolean;
}

export interface UpcomingEvent extends SourceMetadata {
  id: string;
  communityId: CommunityId;
  category: EventCategory;
  title: string;
  description: string;
  dateLabel: string;
  timeLabel: string;
  location: string;
  costLabel: string;
  actionLabel: string;
  isDemo: boolean;
}

export interface PublicMeeting extends SourceMetadata {
  id: string;
  communityId: CommunityId;
  body: string;
  title: string;
  dateLabel: string;
  timeLabel: string;
  location: string;
  agendaLabel: string;
  isDemo: boolean;
}

export interface ServiceShortcut extends SourceMetadata {
  id: string;
  communityId: CommunityId | "all";
  category: ServiceCategory;
  title: string;
  description: string;
  actionLabel: string;
}

const DEMO_CHECKED_AT = "2026-07-12T09:00:00-05:00";

export const communities: Community[] = [
  {
    id: "geneva",
    name: "Geneva, Illinois",
    shortName: "Geneva",
    eyebrow: "City of Geneva",
    description: "City notices, public meetings, resident services, and nearby events.",
    accent: "#b5573f",
    sourceLabel: "City of Geneva",
    sourceUrl: "https://www.geneva.il.us/",
    jurisdiction: "Geneva",
    lastChecked: DEMO_CHECKED_AT,
    freshness: "current",
    status: "active",
  },
  {
    id: "batavia",
    name: "Batavia, Illinois",
    shortName: "Batavia",
    eyebrow: "City of Batavia",
    description: "Public works reminders, city events, and direct service-request links.",
    accent: "#2f6f68",
    sourceLabel: "City of Batavia",
    sourceUrl: "https://www.bataviail.gov/events",
    jurisdiction: "Batavia",
    lastChecked: DEMO_CHECKED_AT,
    freshness: "current",
    status: "active",
  },
  {
    id: "st-charles",
    name: "St. Charles, Illinois",
    shortName: "St. Charles",
    eyebrow: "City of St. Charles",
    description: "Local alerts, city events, and fast paths to everyday services.",
    accent: "#315d7a",
    sourceLabel: "City of St. Charles",
    sourceUrl: "https://www.stcharlesil.gov/Home",
    jurisdiction: "St. Charles",
    lastChecked: DEMO_CHECKED_AT,
    freshness: "current",
    status: "active",
  },
];

export const todayUpdates: TodayUpdate[] = [
  {
    id: "geneva-notifications",
    communityId: "geneva",
    kind: "notice",
    title: "Geneva notifications",
    summary:
      "Demo feed card: check the city's notification center for current closures, service changes, and public notices.",
    actionLabel: "Check Geneva notices",
    priority: "standard",
    isDemo: true,
    sourceLabel: "City of Geneva — Notify Me",
    sourceUrl: "https://www.geneva.il.us/list.aspx",
    jurisdiction: "Geneva",
    lastChecked: DEMO_CHECKED_AT,
    freshness: "check-source",
    status: "verify-with-source",
  },
  {
    id: "geneva-resident-services",
    communityId: "geneva",
    kind: "service",
    title: "Plan an errand with resident services",
    summary:
      "Demo reminder: confirm office details and the documents you need before visiting a city department.",
    actionLabel: "Browse resident services",
    priority: "standard",
    isDemo: true,
    sourceLabel: "City of Geneva — For Residents",
    sourceUrl: "https://geneva.il.us/327/For-Residents",
    jurisdiction: "Geneva",
    lastChecked: DEMO_CHECKED_AT,
    freshness: "evergreen",
    status: "informational",
  },
  {
    id: "batavia-public-works",
    communityId: "batavia",
    kind: "service",
    title: "Batavia public works schedules",
    summary:
      "Demo feed card: verify the official schedule before setting out yard waste, brush, or seasonal materials.",
    actionLabel: "View official schedules",
    priority: "standard",
    isDemo: true,
    sourceLabel: "Batavia Public Works — Schedules",
    sourceUrl: "https://www.bataviail.gov/o/pw/page/schedule",
    jurisdiction: "Batavia",
    lastChecked: DEMO_CHECKED_AT,
    freshness: "check-source",
    status: "verify-with-source",
  },
  {
    id: "batavia-report-concern",
    communityId: "batavia",
    kind: "community",
    title: "Spot a non-emergency city issue?",
    summary:
      "Use Batavia's official form to route pothole, sign, property, or other service concerns to the city.",
    actionLabel: "Report a concern",
    priority: "standard",
    isDemo: true,
    sourceLabel: "City of Batavia — Report a Concern",
    sourceUrl: "https://www.bataviail.gov/o/cob/page/report-a-concern",
    jurisdiction: "Batavia",
    lastChecked: DEMO_CHECKED_AT,
    freshness: "evergreen",
    status: "active",
  },
  {
    id: "stc-alerts",
    communityId: "st-charles",
    kind: "notice",
    title: "St. Charles alerts",
    summary:
      "Demo feed card: review the city's alert page for current municipal updates. No emergency is asserted by this demo.",
    actionLabel: "Check St. Charles alerts",
    priority: "standard",
    isDemo: true,
    sourceLabel: "City of St. Charles — STC Alerts",
    sourceUrl: "https://www.stcharlesil.gov/News-Events/STC-Alerts",
    jurisdiction: "St. Charles",
    lastChecked: DEMO_CHECKED_AT,
    freshness: "check-source",
    status: "verify-with-source",
  },
  {
    id: "stc-report-issue",
    communityId: "st-charles",
    kind: "community",
    title: "Send a service issue to St. Charles",
    summary:
      "Use the city's official service channel for non-emergency street, utility, code, or public-space concerns.",
    actionLabel: "Report an issue",
    priority: "standard",
    isDemo: true,
    sourceLabel: "City of St. Charles — Report an Issue",
    sourceUrl: "https://www.stcharlesil.gov/Services/Report-an-Issue",
    jurisdiction: "St. Charles",
    lastChecked: DEMO_CHECKED_AT,
    freshness: "evergreen",
    status: "active",
  },
];

export const upcomingEvents: UpcomingEvent[] = [
  {
    id: "geneva-demo-park-morning",
    communityId: "geneva",
    category: "outdoors",
    title: "Demo: morning in the parks",
    description:
      "A sample family-friendly listing showing how official park programming could appear. Confirm the real program and registration at the source.",
    dateLabel: "Sample date · Sat, Jul 18",
    timeLabel: "9:00–11:00 AM",
    location: "Geneva park location · verify before going",
    costLabel: "Check source",
    actionLabel: "Explore Geneva Park District",
    isDemo: true,
    sourceLabel: "Geneva Park District",
    sourceUrl: "https://www.genevaparks.org/",
    jurisdiction: "Geneva",
    lastChecked: DEMO_CHECKED_AT,
    freshness: "check-source",
    status: "verify-with-source",
  },
  {
    id: "geneva-demo-community-calendar",
    communityId: "geneva",
    category: "civic",
    title: "Demo: Geneva community calendar pick",
    description:
      "Sample calendar card for a city-hosted activity; the official city site remains the source of truth.",
    dateLabel: "Sample date · Wed, Jul 22",
    timeLabel: "6:00 PM",
    location: "Geneva · verify venue",
    costLabel: "Check source",
    actionLabel: "View city calendar",
    isDemo: true,
    sourceLabel: "City of Geneva",
    sourceUrl: "https://www.geneva.il.us/",
    jurisdiction: "Geneva",
    lastChecked: DEMO_CHECKED_AT,
    freshness: "check-source",
    status: "verify-with-source",
  },
  {
    id: "batavia-demo-market",
    communityId: "batavia",
    category: "market",
    title: "Demo: downtown market morning",
    description:
      "Sample listing for a local market-style event. Check Batavia's official event calendar for the live date, hours, and location.",
    dateLabel: "Sample date · Sat, Jul 18",
    timeLabel: "8:00 AM–12:00 PM",
    location: "Downtown Batavia · verify location",
    costLabel: "Free to browse · verify",
    actionLabel: "Check Batavia events",
    isDemo: true,
    sourceLabel: "City of Batavia — Events",
    sourceUrl: "https://www.bataviail.gov/events",
    jurisdiction: "Batavia",
    lastChecked: DEMO_CHECKED_AT,
    freshness: "check-source",
    status: "verify-with-source",
  },
  {
    id: "batavia-demo-family-event",
    communityId: "batavia",
    category: "family",
    title: "Demo: family activity downtown",
    description:
      "A sample all-ages card demonstrating filters for city, date, and cost. Confirm details with the publisher.",
    dateLabel: "Sample date · Sun, Jul 19",
    timeLabel: "1:00–3:00 PM",
    location: "Batavia · verify venue",
    costLabel: "Check source",
    actionLabel: "Browse official calendar",
    isDemo: true,
    sourceLabel: "City of Batavia — Events",
    sourceUrl: "https://www.bataviail.gov/events",
    jurisdiction: "Batavia",
    lastChecked: DEMO_CHECKED_AT,
    freshness: "check-source",
    status: "verify-with-source",
  },
  {
    id: "stc-demo-city-event",
    communityId: "st-charles",
    category: "arts",
    title: "Demo: evening along the Fox River",
    description:
      "Sample arts-and-community listing. Use the city calendar to confirm whether a matching event is scheduled.",
    dateLabel: "Sample date · Fri, Jul 17",
    timeLabel: "6:30–8:30 PM",
    location: "St. Charles · verify venue",
    costLabel: "Check source",
    actionLabel: "View St. Charles events",
    isDemo: true,
    sourceLabel: "City of St. Charles — City Events",
    sourceUrl: "https://www.stcharlesil.gov/News-Events/City-Events",
    jurisdiction: "St. Charles",
    lastChecked: DEMO_CHECKED_AT,
    freshness: "check-source",
    status: "verify-with-source",
  },
  {
    id: "stc-demo-family-outing",
    communityId: "st-charles",
    category: "family",
    title: "Demo: weekend family outing",
    description:
      "Sample event card illustrating an all-ages recommendation; confirm the actual program before making plans.",
    dateLabel: "Sample date · Sun, Jul 19",
    timeLabel: "10:00 AM–12:00 PM",
    location: "St. Charles · verify venue",
    costLabel: "Check source",
    actionLabel: "Browse city events",
    isDemo: true,
    sourceLabel: "City of St. Charles — City Events",
    sourceUrl: "https://www.stcharlesil.gov/News-Events/City-Events",
    jurisdiction: "St. Charles",
    lastChecked: DEMO_CHECKED_AT,
    freshness: "check-source",
    status: "verify-with-source",
  },
];

export const meetings: PublicMeeting[] = [
  {
    id: "geneva-demo-city-council",
    communityId: "geneva",
    body: "Geneva City Council",
    title: "Demo: upcoming council meeting",
    dateLabel: "Sample date · Mon, Jul 20",
    timeLabel: "7:00 PM · verify",
    location: "City Hall · verify room",
    agendaLabel: "Open Geneva agendas",
    isDemo: true,
    sourceLabel: "City of Geneva — Agenda Center",
    sourceUrl: "https://geneva.il.us/AgendaCenter",
    jurisdiction: "Geneva",
    lastChecked: DEMO_CHECKED_AT,
    freshness: "check-source",
    status: "verify-with-source",
  },
  {
    id: "batavia-demo-city-council",
    communityId: "batavia",
    body: "Batavia City Council",
    title: "Demo: upcoming council meeting",
    dateLabel: "Sample date · Mon, Jul 20",
    timeLabel: "7:00 PM · verify",
    location: "Batavia · verify venue",
    agendaLabel: "Check city information",
    isDemo: true,
    sourceLabel: "City of Batavia",
    sourceUrl: "https://www.bataviail.gov/events",
    jurisdiction: "Batavia",
    lastChecked: DEMO_CHECKED_AT,
    freshness: "check-source",
    status: "verify-with-source",
  },
  {
    id: "stc-demo-city-council",
    communityId: "st-charles",
    body: "St. Charles City Council",
    title: "Demo: upcoming council meeting",
    dateLabel: "Sample date · Mon, Jul 20",
    timeLabel: "7:00 PM · verify",
    location: "St. Charles · verify venue",
    agendaLabel: "Check city information",
    isDemo: true,
    sourceLabel: "City of St. Charles",
    sourceUrl: "https://www.stcharlesil.gov/Home",
    jurisdiction: "St. Charles",
    lastChecked: DEMO_CHECKED_AT,
    freshness: "check-source",
    status: "verify-with-source",
  },
];

export const serviceShortcuts: ServiceShortcut[] = [
  {
    id: "geneva-residents",
    communityId: "geneva",
    category: "utilities",
    title: "Resident services",
    description: "Start with Geneva's official directory for utilities and everyday city services.",
    actionLabel: "Open services",
    sourceLabel: "City of Geneva — For Residents",
    sourceUrl: "https://geneva.il.us/327/For-Residents",
    jurisdiction: "Geneva",
    lastChecked: DEMO_CHECKED_AT,
    freshness: "evergreen",
    status: "active",
  },
  {
    id: "geneva-notify",
    communityId: "geneva",
    category: "alerts",
    title: "Notification subscriptions",
    description: "Choose official email or text notification lists from the city.",
    actionLabel: "Manage notifications",
    sourceLabel: "City of Geneva — Notify Me",
    sourceUrl: "https://www.geneva.il.us/list.aspx",
    jurisdiction: "Geneva",
    lastChecked: DEMO_CHECKED_AT,
    freshness: "evergreen",
    status: "active",
  },
  {
    id: "geneva-agendas",
    communityId: "geneva",
    category: "permits",
    title: "Meetings and agendas",
    description: "Find official packets and notices for Geneva public bodies.",
    actionLabel: "Open Agenda Center",
    sourceLabel: "City of Geneva — Agenda Center",
    sourceUrl: "https://geneva.il.us/AgendaCenter",
    jurisdiction: "Geneva",
    lastChecked: DEMO_CHECKED_AT,
    freshness: "check-source",
    status: "active",
  },
  {
    id: "batavia-schedules",
    communityId: "batavia",
    category: "waste",
    title: "Public works schedules",
    description: "Check current collection and seasonal public works schedules.",
    actionLabel: "View schedules",
    sourceLabel: "Batavia Public Works — Schedules",
    sourceUrl: "https://www.bataviail.gov/o/pw/page/schedule",
    jurisdiction: "Batavia",
    lastChecked: DEMO_CHECKED_AT,
    freshness: "check-source",
    status: "active",
  },
  {
    id: "batavia-concern",
    communityId: "batavia",
    category: "report",
    title: "Report a concern",
    description: "Route a non-emergency neighborhood or service issue to the city.",
    actionLabel: "Start a report",
    sourceLabel: "City of Batavia — Report a Concern",
    sourceUrl: "https://www.bataviail.gov/o/cob/page/report-a-concern",
    jurisdiction: "Batavia",
    lastChecked: DEMO_CHECKED_AT,
    freshness: "evergreen",
    status: "active",
  },
  {
    id: "batavia-events",
    communityId: "batavia",
    category: "alerts",
    title: "City calendar",
    description: "Browse Batavia's official city events and confirm current details.",
    actionLabel: "Open calendar",
    sourceLabel: "City of Batavia — Events",
    sourceUrl: "https://www.bataviail.gov/events",
    jurisdiction: "Batavia",
    lastChecked: DEMO_CHECKED_AT,
    freshness: "check-source",
    status: "active",
  },
  {
    id: "stc-report",
    communityId: "st-charles",
    category: "report",
    title: "Report an issue",
    description: "Send a non-emergency service request through the city's official channel.",
    actionLabel: "Report an issue",
    sourceLabel: "City of St. Charles — Report an Issue",
    sourceUrl: "https://www.stcharlesil.gov/Services/Report-an-Issue",
    jurisdiction: "St. Charles",
    lastChecked: DEMO_CHECKED_AT,
    freshness: "evergreen",
    status: "active",
  },
  {
    id: "stc-alerts-shortcut",
    communityId: "st-charles",
    category: "alerts",
    title: "STC Alerts",
    description: "Check the city's official page for current municipal alerts and updates.",
    actionLabel: "Open alerts",
    sourceLabel: "City of St. Charles — STC Alerts",
    sourceUrl: "https://www.stcharlesil.gov/News-Events/STC-Alerts",
    jurisdiction: "St. Charles",
    lastChecked: DEMO_CHECKED_AT,
    freshness: "check-source",
    status: "active",
  },
  {
    id: "stc-property-info",
    communityId: "st-charles",
    category: "permits",
    title: "Property information map",
    description: "Open the city's public map service for jurisdiction-specific property information.",
    actionLabel: "Open property map",
    sourceLabel: "City of St. Charles — My Property Info",
    sourceUrl:
      "https://maphub.stcharlesil.gov/server/rest/services/Public/My_Property_Info/MapServer",
    jurisdiction: "St. Charles",
    lastChecked: DEMO_CHECKED_AT,
    freshness: "evergreen",
    status: "active",
  },
];

export const countyEmergencyResource: ServiceShortcut = {
  id: "kane-county-emergency",
  communityId: "all",
  category: "emergency",
  title: "Kane County emergency information",
  description:
    "For official county preparedness and emergency-management information. Call 911 for an immediate emergency.",
  actionLabel: "Open Kane County OEM",
  sourceLabel: "Kane County Office of Emergency Management",
  sourceUrl: "https://oem.kanecountyil.gov/",
  jurisdiction: "Kane County",
  lastChecked: DEMO_CHECKED_AT,
  freshness: "check-source",
  status: "active",
};

export const eventCategories: Array<{ id: "all" | EventCategory; label: string }> = [
  { id: "all", label: "All events" },
  { id: "family", label: "Family" },
  { id: "outdoors", label: "Outdoors" },
  { id: "arts", label: "Arts" },
  { id: "civic", label: "Civic" },
  { id: "market", label: "Markets" },
];
