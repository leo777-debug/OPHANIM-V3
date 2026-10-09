# OPHANIM

## Configurable Live Intelligence Platform

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://typescriptlang.org)
[![MapLibre](https://img.shields.io/badge/MapLibre-WebGL-396CB2)](https://maplibre.org)
[![License](https://img.shields.io/badge/License-MIT-2FD5CA)](LICENSE)

Ophanim combines a live intelligence globe with provider-based search, entity
tracking, watchlists, news, operational workflows, imports, AI summaries and
notifications. It builds directly on the existing Osiris source code; a second
Osiris deployment is not required.

[Platform architecture](docs/PLATFORM.md) |
[Deployment](docs/DEPLOYMENT.md) |
[Operations](docs/OPERATIONS.md) |
[World Monitor comparison and remaining gaps](docs/WORLD_MONITOR_COMPARISON.md)

## Features

### Atlas and Map Workspaces

- MapLibre globe with night, earth-colored and satellite basemaps.
- Independent globe workspace tabs and target-monitoring entry points.
- Existing aviation, maritime, infrastructure, cable, camera, hazard, conflict,
  markets and space-weather experiences retained.
- Provider-generated map layers, entity details and map-location navigation.
- Desktop and mobile controls for exploration and investigation.

Data coverage depends on the source and credentials. Static infrastructure and
reference layers are not live telemetry. Provider catalog entries and public
embeds are not proof of a working native data connector.

### Intelligence Desk

Open **INTEL DESK** in the atlas; on mobile use **NEWS** or **INTEL**.

- **News:** text search, publisher filters, keyword-score filters and time windows
  of 1, 6, 24 or 48 hours, seven days, or all loaded news.
- **Read activity:** persistent per-browser read tracking, unread filtering and
  bulk marking of matching stories.
- **Exports:** filtered CSV and JSON downloads; CSV strings are escaped to reduce
  spreadsheet formula-injection risk.
- **Timeline:** dated news and USGS earthquakes in one chronological view, with
  event-type filters, original source links and map navigation.
- **Regions:** report counts and distinct publisher counts for recognized region
  mentions, with approximate map locations.
- **Sources:** independent feed availability, item counts, checked times and most
  recent publication dates.
- **Clocks:** UTC, New York, London, Dubai, Singapore and Tokyo, using DST-aware
  time zones.
- Existing alerts, loaded-signal counts and target-monitoring controls retained.

The news route polls nine sources: **BBC, Al Jazeera, GDACS, NASA, CISA,
OSINTtechnical, Faytuks, Liveuamap and CyberKnow**. RSS and Telegram are loaded
together, and one failed source does not stop the others. The atlas refreshes news
every five minutes. Publisher limits mean time filters cover loaded stories, not
a complete historical archive.

Reachable feeds can contain old publications. Undated news is not assigned a
fabricated publication date. Keyword scores and regional mentions are discovery
aids, not validated threat assessments or evidence of correlated incidents.
Keyword-derived coordinates are approximate, not vessel or aircraft positions.

### Search and Providers

- Query classification and deterministic provider selection.
- Shared provider registry, enrichment and result-normalization contracts.
- Backend-only wrappers for configured external services and CLI tools.
- Generic entities, events, evidence and organization-scoped operational data.
- Existing RECON tools for DNS, WHOIS, IP, certificates, CVEs, sanctions and other
  configured intelligence sources.

Installing an optional tool or configuring a provider is still necessary where
required. A wrapper does not install the external tool or grant access to its
data. Use active scanning only for targets you own or are authorized to assess.

### Watchlists, Notifications and Operations

- Persisted watchlists, entity pages and provider checks.
- Resend integration for configured email notifications, delivery records and
  scheduled processing.
- Shipment imports, disruptions, rescue workflows and operational workspaces.
- Organization-scoped entities, events, cases, evidence and administration.

These workflows require the relevant authentication, database, provider and cron
configuration. They are not enabled simply by loading the public globe.

### AI and Local Models

Open **AI SETUP** in the atlas to enter a base URL, model name, optional API key
and enabled tasks. Use **Test connection**, then save the configuration.

| Provider preset | Default base URL |
| --- | --- |
| Ollama | `http://localhost:11434/v1` |
| LM Studio | `http://localhost:1234/v1` |
| Custom OpenAI-compatible server | Your compatible server URL |

Start the local model server and load a model first. Keyless servers can leave
the API key blank. Custom configurations must expose compatible chat completions;
this is not native support for every vendor's API format.

AI summarizes supplied context, explains it, suggests follow-up searches and
writes email summaries. It does not select search providers. Automatic briefing
intervals are off, 5, 15, 30 or 60 minutes and run only while the analyst component
is mounted, a configuration is saved and summarization is enabled. These are not
server-side background jobs.

**Localhost means the machine running Ophanim's backend**, not the visitor's
laptop. A Render deployment cannot reach your laptop's model through `localhost`.
Use a securely reachable model service when hosting remotely. Development permits
loopback model servers on ports 11434 and 1234; production private/local origins
must be explicitly allowed with `AI_LOCAL_BASE_URLS`, using origins without `/v1`.
Keep this allowlist narrowly scoped and keep model services authenticated when
exposed beyond your machine.

Optional isolated research has a separate deployment/configuration boundary; see
[sandbox research](docs/SANDBOX_RESEARCH.md). It is not enabled by selecting a
local model.

## Data Sources and Availability

| Area | Existing source integrations / configuration |
| --- | --- |
| Aircraft | OpenSky and ADS-B sources; coverage and rate limits vary |
| Ships | Regional Digitraffic AIS; optional AISStream, customer AIS and configured MarineTraffic access |
| Earthquakes | USGS |
| Fires and weather | NASA FIRMS and EONET integrations |
| News and advisories | Nine news sources listed above; existing broadcaster embeds |
| Cameras | Existing transport and public-camera integrations; upstream availability varies |
| Space weather | NOAA SWPC and existing satellite integrations |
| Cyber intelligence | Existing cyber-threat, malware, CVE and configured OSINT providers |
| Sanctions | Existing OpenSanctions and War & Sanctions integrations |
| Markets | Existing market and crypto APIs/panels |

The route named `/api/gdelt` currently reads GDACS, not a GDELT protest feed.
Conflict/reference markers and heuristic country-risk scores must not be
advertised as independently verified live intelligence. Third-party source terms,
attribution and access restrictions apply separately from this repository's
software license.

## Quick Start

```bash
git clone https://github.com/leo777-debug/OPHANIM-V3.git
cd OPHANIM-V3
npm install
npm run dev
```

Open the globe at [http://localhost:3000/atlas](http://localhost:3000/atlas).
Configure database/authentication before using protected operational workflows.
Keep secrets in uncommitted environment files, never in browser-exposed variables.

### Deployment

Ophanim runs as one Next.js application with PostgreSQL for persisted workflows.
The Render blueprint in [`render.yaml`](render.yaml) defines the web service,
database and cron workers. Review its plan selections before provisioning;
deploying the blueprint can create billable services.

See [deployment instructions](docs/DEPLOYMENT.md) for `DATABASE_URL`, `APP_URL`,
migrations and worker configuration. Other configured features can require:

- Resend: `RESEND_API_KEY`, `RESEND_FROM`.
- AI server defaults: `AI_BASE_URL`, `AI_MODEL`, optional `AI_API_KEY`, and
  `AI_ENABLED_TASKS`.
- Private/local AI access: `AI_LOCAL_BASE_URLS`.
- AISStream: `AIS_API_KEY`; other AIS sources have their own endpoint/credential
  settings.
- Worker bearer secrets: `WATCHLIST_CRON_SECRET`, `IMPORT_CRON_SECRET`,
  `DISRUPTION_SYNC_CRON_SECRET`, `INTELLIGENCE_ALERT_CRON_SECRET`.

Cron secrets are backend-only and must match the corresponding worker settings.
For standalone container deployment, this repository includes `Dockerfile` and
`docker-compose.yml`; build from this repository rather than pulling an unrelated
Osiris image. PostgreSQL and required environment values must still be configured.

## Verification

```bash
npm test
npx tsc --noEmit
npm run build
```

For the intelligence desk, open `/atlas`, select **INTEL DESK**, filter news,
download CSV/JSON, mark matching stories read and check **Unread** after reloading.
Then test **TIMELINE**, **REGIONS**, **SOURCES** and **CLOCKS**, including a mobile
viewport. The [comparison document](docs/WORLD_MONITOR_COMPARISON.md#testing)
contains detailed checks and the remaining capability gaps. Full World Monitor
parity is not claimed.

## Technology

Next.js 16 App Router, React 19, TypeScript, MapLibre GL, Framer Motion, Lucide,
PostgreSQL, Resend and Vitest. See [`package.json`](package.json) for dependency
versions and scripts.

## License and Attribution

MIT; see [LICENSE](LICENSE). Ophanim builds on the original Osiris work by
[simplifaisoul](https://github.com/simplifaisoul). Existing copyright and license
notices are preserved. External tools, datasets and media retain their own terms.
