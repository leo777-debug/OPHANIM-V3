# Shodan Integration

## Setup

The official REST API is used through native server-side `fetch` at
`https://api.shodan.io`; every upstream request includes the server-configured
`key` query parameter. Never put it in a `NEXT_PUBLIC_` variable or a browser URL.
Set `SHODAN_API_KEY` in Render's environment or an uncommitted `.env.local`.
Leave it blank to disable the paid integration. A missing key returns
`missing_key` with a configuration message. No credentials are included in
returned errors, banners, audit records or logs.

Sign-in and `cyber:read` permission are required for the dedicated tool. Scan
submission additionally requires `organization:manage` (workspace owner).
The existing session, membership and PostgreSQL audit mechanism is reused;
no schema migration is required. The public globe cannot use the paid key.
The legacy keyless InternetDB subnet-sweep tool remains a separate capability.

## Interface

Open **Recon > Shodan** on the globe. Select database search, count and facets,
IP/host lookup, DNS resolve, reverse DNS, or authorized active scan. Credits and
scan status have separate controls. Host lookups accept up to 20 comma-separated
IPv4/IPv6 addresses; unavailable hosts are reported individually. History and
minify flags are available; minify omits banners, as Shodan documents.

Global search passes `shodan: nginx` and filter queries through the classifier,
registry, enrichment manager and normalizer. Provider selection is deterministic;
AI never selects or operates Shodan. Search/host results retain upstream dates.
Shodan searches do not auto-run while typing: use the submit icon or Enter.
Direct global-search API calls must include `confirm=true`. For credit previews,
use the dedicated Recon tool, which checks credits before submitting a search.
Coordinates describe indexed hosts and may be approximate, not live asset tracks.

## API

All routes below use the existing authenticated session cookie. JSON responses
are `no-store`; server-side host/count caches are bounded and short-lived.

```text
GET /api/osint/shodan?operation=search&q=product%3Anginx%20country%3AAE&page=1&facets=port,org,country
GET /api/osint/shodan?operation=count&q=port%3A443&facets=org,country
GET /api/osint/shodan?operation=host&ip=8.8.8.8&history=false&minify=false
GET /api/osint/shodan?operation=hosts&ips=8.8.8.8,1.1.1.1
GET /api/osint/shodan?operation=resolve&hostnames=example.com
GET /api/osint/shodan?operation=reverse&ips=8.8.8.8
GET /api/osint/shodan?operation=api-info
GET /api/osint/shodan?operation=scan-status&scan_id=RETURNED_SCAN_ID
```

Search supports Shodan syntax including `port:`, `org:`, `country:`, `product:`,
`os:`, `hostname:` and `net:`. Facets and pagination are forwarded. Search results
include `ip_str`, port, organization, hostnames, product, transport, location,
timestamp and a banner excerpt limited to 1,000 characters. Counts do not consume
Shodan query credits; filtered searches and pagination can consume credits.
`api-info` exposes only plan and query/scan credits, with a 30-second cache.
Search checks credit information before execution and returns low-credit warnings.
The Recon form checks credits before a chargeable operation; when credits are low,
it displays the warning and requires another click to continue. API clients receive
warnings in `api-info` and should check them before submitting paid operations.

## Active Scan Authorization

Set `AUTHORIZED_SCAN_TARGETS` to owned/explicitly authorized IPs or CIDRs.
For multi-tenant deployments, use a JSON object mapping organization UUIDs to
allowlist arrays. A plain comma list is deployment-wide and authorizes those
same targets for all workspace owners; use it only for a single trust boundary.
Allowlisting is an operator assertion, not proof of ownership. Obtain written
authorization before configuring a target.

Requests require full containment of every target CIDR, not just its first IP.
IPv4 and IPv6 are supported. Hostnames, malformed ranges, missing confirmation,
empty allowlists and scans over 256 addresses are rejected before network calls.
Adjacent authorized ranges may jointly cover a requested range. Overlapping
requested ranges are counted conservatively for the credit estimate.

```json
{
  "ips": "YOUR_OWNED_IP_OR_CIDR",
  "confirm": true,
  "requestId": "a-new-uuid-for-this-confirmed-operation"
}
```

Send this JSON to `POST /api/osint/shodan` from the same origin. A database audit
reservation records the actor, organization, targets and time before contacting
Shodan. `requestId` is serialized by a PostgreSQL advisory lock; replaying it
returns the recorded result or `scan_pending`, never another scan. Shodan's scan
ID, credits left and status are returned. Status polling checks the organization
owns a recorded submission before contacting Shodan.

Submission POSTs are intentionally never retried, including on 429/5xx, because
Shodan does not document a submission idempotency key. A timeout or crash after
submission can leave an unconfirmed audit reservation. Do not send a new request
ID to bypass it; an administrator must reconcile it with Shodan's scan account.
No scheduled scans, exploit execution or Internet-wide scanning are implemented.

## Reliability And Limits

- Native client spaces upstream requests by at least one second per process.
  Multiple Render replicas share an account limit, not a distributed limiter;
  run one Shodan-calling instance or provide a shared coordinator before scaling.
- Read requests retry 429/5xx twice with exponential backoff and bounded
  Retry-After handling. Every request has a timeout; redirects are rejected.
- `SHODAN_CACHE_TTL_MS`: host/count cache, default 60,000, range 0-300,000.
- `SHODAN_TIMEOUT_MS`: request budget including wait/retry, default 25,000,
  range 1,000-30,000.
- `SHODAN_LOW_CREDITS`: warning threshold, default 10.
- HTTP 401, 403, 404, 429 and provider failures become actionable typed errors.
  Raw upstream errors and credential-bearing fetch exception messages are withheld.
- Scans require a plan with scan access and sufficient scan credits. Ophanim does
  not bypass plan restrictions. Commercial redistribution rights must be checked
  against the Shodan subscription agreement; no blanket licence is assumed.

## Tests

Run `npm test`; tests mock upstream HTTP and never run live scans. A valid Shodan
key and authenticated workspace are needed for a manual live read-only check.
Use **Count and facets** first, then a known IP lookup. Query credits may be
consumed by database searches. Active-scan tests use documentation-range fixtures
only and never contact live hosts.

Protocol reference: [Shodan REST API documentation](https://developer.shodan.io/api).
