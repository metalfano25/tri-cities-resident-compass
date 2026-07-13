# Tri-Cities Resident Compass

A mobile-first resident dashboard prototype for Geneva, Batavia, and St. Charles, Illinois.

The site brings together clearly attributed shortcuts for city notices, public works, events, civic meetings, resident services, and Kane County emergency information. This first version uses balanced demonstration data and always links residents back to the authoritative source.

## Important status

- This is an independent prototype, not a government website.
- The current cards are demonstration content, not live alerts.
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

The current prototype does not require environment variables, a database, or persistent storage.

## Product direction

The next production milestone is replacing the demonstration records with permitted official feeds or curated adapters that preserve:

- publisher and canonical URL;
- jurisdiction and affected area;
- source-updated and retrieval times;
- freshness and failure states;
- balanced coverage across all three communities.

See the resident-facing source policy in the application before connecting live data.
