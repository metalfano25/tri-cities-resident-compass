# Tri-Cities Resident Compass

A mobile-first resident dashboard prototype for Geneva, Batavia, and St. Charles, Illinois.

The site brings together clearly attributed city notices, public works updates, events, civic meetings, resident services, and Kane County emergency information. It refreshes public official feeds and municipal listings through a server-side normalization layer, then links every item back to the authoritative source.

## Important status

- This is an independent prototype, not a government website.
- Current cards are fetched from public official sources when the page loads.
- The site is an aggregator, not a real-time or guaranteed-complete alert service.
- It is not an emergency alert replacement. Call 911 for emergencies.
- Exact dates, eligibility, cancellations, and current conditions must be verified at the linked official source.

## Run locally

Requirements: Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open the local URL printed by the development server.

## Validate

```bash
npm run lint
npm test
```

The test command creates a production build and verifies the server-rendered resident experience, source links, semantic landmarks, and safety disclosures.

## Import into Replit

1. In Replit, open **Create App → Import from GitHub**.
2. Connect the GitHub account that can access this repository.
3. Select `metalfano25/tri-cities-resident-compass` and import it.
4. Let Replit install the Node dependencies.
5. Use `npm run dev` for the workspace preview.

For Publishing, choose a web-server deployment such as Autoscale and use:

- Build command: `npm run build`
- Run command: `npm run start`

The official-data experience does not require a database or persistent storage. Its server must be allowed to make outbound HTTPS requests to the configured official sources. Add `OPENAI_API_KEY` to enable AI-assisted resident analysis.

## Live sources

- Geneva City News, Road Construction, and Special Events RSS feeds
- Batavia City and Park District iCal feeds
- Batavia City Live Feed
- St. Charles City News & Alerts and City Events listings

The API applies request timeouts, response-size limits, per-source failure isolation, balanced community caps, visible retrieval timestamps, and direct canonical links. When one source fails, other communities remain available and the source-health section reports the partial state.

## Resident impact briefing

`/api/insights` adds an evidence-bound interpretation layer over current official records. It returns up to three practical resident impacts with confirmed facts, cautious inference, affected groups, timing, one action, uncertainty, confidence, and the canonical official source.

Set `OPENAI_API_KEY` to enable AI-assisted analysis. `OPENAI_INSIGHT_MODEL` defaults to `gpt-5.6-terra`, and `AI_DAILY_CALL_LIMIT` defaults to 40. Without a key, the route returns a clearly labeled rules-based planning preview so the official-data experience remains usable. Model output uses a strict JSON schema, an eight-second timeout, source allowlisting by item ID, output-length caps, deterministic confirmed facts/actions/severity, and a high-risk exclusion path. D1 provides fingerprinted caching, an in-flight lock, and a daily call circuit breaker so public traffic cannot create unbounded model usage.

## Product direction

The next production milestone is expanding the permitted official adapters while preserving:

- publisher and canonical URL;
- jurisdiction and affected area;
- source-updated and retrieval times;
- freshness and failure states;
- balanced coverage across all three communities.

See the resident-facing source policy in the application before connecting live data.
