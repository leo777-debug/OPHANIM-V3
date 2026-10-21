# Restricted Recon diagnostics

The bundled optional worker makes one TLS-verified HTTPS HEAD request on port 443
for an exact operator-approved public host. It returns selected security headers,
HTTP status and TLS certificate metadata. It does not scan ports, validate
vulnerabilities, enumerate subdomains, exploit targets, read response bodies or
follow redirects. Missing headers are observations, not vulnerability findings;
risk remains unknown. Private/metadata/reserved addresses are always blocked,
including mixed public/private DNS answers. The chosen public address is pinned
to the socket while TLS verifies the original hostname.

Configure only the central private server environment:

- SCANNER_KEY: dedicated worker token, at least 32 characters; never an AI/API key.
- SCANNER_ORGANIZATION_ID: UUID of the one organization authorized to use this worker.
- SCANNER_ALLOWED_TARGETS: comma-separated exact hostnames or canonical IPv4 addresses
  you own or have permission to inspect. No URLs, CIDRs, wildcard or private hosts.
- SCANNER_URL: the worker origin; the Compose overlay supplies its internal origin.
- INTEGRATION_ALLOWED_ORIGINS: explicitly trust a local external worker origin;
  the overlay supplies its internal origin.

Run `docker compose -f docker-compose.yml -f docker-compose.recon.yml --profile recon up -d --build`.
The worker receives only its token and approved hosts, runs non-root/read-only with
resource limits and dropped capabilities, and publishes no host port. It receives
no database, AI, email or organization credentials. The image contains Ophanim's
own code, with no external scanner package or downloaded tool.

GET /health requires the dedicated Bearer token and makes no target request.
Ready means the service is configured, not that targets are reachable. Supported
modes are quick, headers, ssl and tech; they all use the same bounded HEAD
observation. Tech mode does not infer installed versions or vulnerabilities.

The app accepts POST /api/scanner with a JSON object containing only target and
type. It requires sign-in, cyber:write permission, the configured organization,
same-origin checks and an exact approved target. GET returns 405 and never runs an
inspection. Five requests/minute/user and five/minute/worker plus two concurrent
worker requests bound load. Each target request has a six-second total DNS/socket
deadline; app-to-worker transport has eight seconds and a 2 MB response bound.
Credential headers stay between app and worker. Worker failures are sanitized;
responses are private/no-store and exclude cookies, response bodies and arbitrary
worker fields. The UI links to sign-in or Integrations for unavailable services.

The old unauthenticated GET/query-key proxy is intentionally retired. External
workers must implement the dedicated Bearer-token contract and limited modes.
There is no automatic migration of credentials and no target permission is
inferred from merely knowing a hostname. Results are operational observations
from an authorized target; record any target-specific rights in your deployment's
operator register. Do not archive or redistribute target content under this feature.

Local HTTP fixture tests verify the protocol without inspecting a real target.
Docker configuration validation does not establish container runtime isolation;
see PARITY evidence for whether actual container execution was available.
