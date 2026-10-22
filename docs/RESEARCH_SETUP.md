# Optional research service

Public feeds work without research. The bundled optional worker looks up two
official feeds and returns matching notices with their sources and dates. It does
not use AI, browse websites, confirm claims or establish risk.

## Start the bundled worker

1. Install Docker Desktop or Docker Engine and start it.

2. In the private, uncommitted .env or deployment environment, set
   AI_SANDBOX_RESEARCH_TOKEN to a dedicated random secret of at least 32
   characters. Your administrator should generate it with a password manager.
   Do not reuse a hosted AI key. Ophanim does not supply or request a real secret.
   No model or upstream API key is needed.

3. From the repository folder, run the command below. It builds the app and
   optional worker. The overlay sets the internal URL and allowed origin for you.

```shell
docker compose -f docker-compose.yml -f docker-compose.research.yml --profile research up -d --build
```

4. Open Admin → Integrations → Optional service setup, choose Isolated research
   sandbox and select **Test research connection**. Wait for the worker to become
   healthy. This authenticated health test verifies worker reachability, and
   explicitly reports upstreamTested: false. It does not prove source availability
   or isolation. The wizard accepts no keys and saves no configuration.

5. In the analyst, enter a public event or place and select **Source check**.
   Sign-in and research permission are required. Research must be enabled for your
   edition. Missing coverage and worker failures are shown explicitly.

To leave research disabled, keep AI_SANDBOX_RESEARCH_URL and
AI_SANDBOX_RESEARCH_TOKEN empty and do not enable the research Compose profile.

## What it covers

The worker uses only USGS magnitude 4.5+ past-day earthquake GeoJSON and active US
NWS warning text. It matches subject tokens in titles/excerpts, returning at most
12 notices. **Risk always remains unknown.** Keyword overlap is not corroboration;
no match does not imply safety or absence of disruption. Coverage is limited to
those two feeds, rather than global news or port notices.

Subject and private context never go upstream. Each fixed feed is fetched at most
once per five minutes per worker, including failure caching. Only public caches
stay in memory. Source publication times are preserved or unknown; source
retrieval and response time are separate. The analyst displays attribution,
licence, dates, uncertainty and limitations. No requests, context, secrets or raw
upstream errors are logged or persisted by the worker.

These existing registry sources share src/lib/intelligence/research-sources.json
with the worker and Integrations: licence name, commercial-use status, attribution,
rates, key requirements and limited coverage. USGS-produced earthquake data and
NWS-authored text are public domain; third-party media are excluded. Official
documentation:
https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits,
https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php,
https://www.weather.gov/disclaimer and
https://www.weather.gov/documentation/services-web-api.

## Isolation and limits

The container receives only its dedicated token. It has no host port, production
database credentials, host mounts or Docker socket. It runs as a non-root user
with a read-only filesystem, dropped capabilities and memory/process/CPU limits.
It cannot run browser tasks, code or operational actions. It requires authentication
for both health and research, limits requests to 16 KB and 20/minute, and allows
two concurrent research calls with bounded connections/timeouts.

Only fixed-source HTTPS requests are allowed. They pin validated public DNS
addresses, reject redirects, time out after eight seconds and cap responses at
4 MB. Callers cannot supply fetch URLs. Network-level egress restrictions remain
your deployment's responsibility. A restricted container is not a VM for executing
untrusted code. Use one worker/token per authorized application deployment.

## Deploying elsewhere or using your own worker

Set AI_SANDBOX_RESEARCH_URL to the private worker URL and use the same dedicated
token in the app and worker. For internal HTTP, add its exact scheme/host/port to
INTEGRATION_ALLOWED_ORIGINS. Do not use credentials, paths, wildcards or metadata
addresses in that allowlist. Public workers should use HTTPS. Restart the app
after changing server configuration.

For broader research, deploy a separately isolated authorized service implementing
authenticated GET /health and POST /v1/research. Give it no production database
credentials or operational actions. Preserve source URLs and dates; use only
permitted sources and do not bypass access restrictions. You are responsible for
that service's isolation, collection permissions and evidence quality.

Every application research request checks authenticated health before sending
context. Transport pins DNS, rejects redirects, allows eight seconds for health
and 45 seconds for research, and limits the response to 2 MB. An unavailable worker
receives no context. A health success alone does not certify isolation or trust.

```json
{"subject":"Port disruption reports","purpose":"confirm","context":"Only authorized operational context","policy":{"browserExecution":"sandbox_only","allowOperationalActions":false,"requireSourceAttribution":true,"riskAssessmentOnly":false}}
```

Allowed purposes are confirm and assess_risk. Return summary, riskIndicator
(unknown, low, moderate or high), uncertainty, sources (title, public URL, optional
publishedAt/excerpt/attribution/licence), collectedAt if known and limitations.
An external worker's attribution assertions need review; its risk labels are
assessments, not validated forecasts.

VoidAccess and Recon use separate contracts and credentials. This profile does
not package either service or a general browser sandbox. Leave their variables
empty when unavailable. See API_KEYS.md for the central configuration inventory.

## Verification limits

Real local HTTP tests cover authentication, research, body/rate limits, fixed
destinations, public addresses, caching, failures and shared registry metadata.
Compose configuration is checked separately. A running Docker engine is required
to verify the actual container. Local tests do not establish production isolation
or continuous upstream availability. No World Monitor code, assets or services
were used.
