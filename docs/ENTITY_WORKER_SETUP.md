# Entity reference worker

The optional `intel` profile enriches permitted aircraft, vessel, company and
country identifiers using Wikidata structured data. It is reference context,
not live tracking, sanctions screening or identity confirmation. Fuzzy/name
matches can be wrong; verify the original source. Source publication dates are
unknown and are not replaced with the response time. Public roles such as CEO
or head of state may appear as source-attributed reference nodes; direct person
and IP profiling are disabled.

Wikidata structured data is CC0; its other page text has different terms:
https://www.wikidata.org/wiki/Wikidata:Licensing . The worker queries only the
fixed Wikidata API/SPARQL origins, through pinned public DNS, verified TLS,
eight-second deadlines, no redirects and a 2 MB JSON bound. The cache is bounded
and retains reference results for 24 hours. Operator/request limits and upstream
quotas still apply; endpoint reachability is not data freshness.

The legacy OpenSanctions bulk importer is disabled and never scheduled or fetched.
Commercial use/redistribution needs the appropriate agreement; merely being able
to download the file is insufficient. See https://www.opensanctions.org/licensing/ .
There is no automatic licence approval or unreviewed fallback to another feed.

Set central server configuration, with no browser credential storage:

- INTEL_API_TOKEN: dedicated worker token of at least 32 characters.
- INTEL_ORGANIZATION_ID: UUID of the one authorized organization.
- INTEL_URL: worker origin; the overlay supplies http://ophanim-intel:4000.
- INTEGRATION_ALLOWED_ORIGINS: trust a configured local external worker origin;
  the overlay supplies the internal origin.

Run `docker compose -f docker-compose.yml -f docker-compose.intel.yml --profile intel up -d --build`.
The resolver is no longer started/published by the default Compose services. The
optional worker runs non-root/read-only with limits and dropped capabilities,
has no host port, and receives only its own token. It has no application database,
AI, email or organization credentials. Health requires the token and performs no
upstream lookup; disabled sanctions status remains visible.

GET /api/entity/expand requires a real sign-in, intelligence:read permission and
the matching configured organization. Responses are private/no-store. The proxy
uses pinned bounded transport, filters graph fields and unreviewed person nodes,
and returns sanitized failures. Missing configuration/sign-in has an explicit
recovery link. The selected original map observation remains visible when optional
enrichment is unavailable. A public map link does not disclose its enrichment.

Worker HTTP tests use synthetic tokens and exercise health/auth/disabled sources
without querying a real entity. Full container execution is a separate check;
Compose configuration alone is not proof of container runtime isolation.
