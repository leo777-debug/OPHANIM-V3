# Feed connection monitoring

Apply migrations with `node db/run-migrations.mjs` after configuring DATABASE_URL.
Operational metadata uses the private `ophanim_runtime` schema. It has RLS and no
browser-role grants or policies. No credentials or private feed bodies are stored.

Without a database, self-hosted instances persist metadata atomically in
OPHANIM_RUNTIME_DIR (default `.ophanim-runtime`, ignored by Git). This filesystem
mode is single-instance. On serverless hosting, configure PostgreSQL for shared
durability. If persistence fails the UI explicitly reports process-local storage.

Set HEALTH_CRON_SECRET privately and run `docker compose --profile health up -d`
for a self-hosted health worker. HEALTH_POLL_SECONDS is clamped to 300–86400
seconds; empty, nonnumeric, nonpositive and nonfinite values use 300 seconds.
The delay starts after each sweep completes, preventing overlapping sweeps.
APP_INTERNAL_URL must be an HTTP(S) origin without credentials, path, query or
fragment; it defaults to
http://ophanim:3000. A hosted scheduler can call GET /api/platform/health/cron with
Authorization: Bearer <HEALTH_CRON_SECRET>. The job is disabled without that secret.
Hosting does not become scheduled merely by adding this endpoint.

The worker receives only HEALTH_CRON_SECRET, HEALTH_POLL_SECONDS and
APP_INTERNAL_URL. Provider, database, AI and email credentials stay in the app.
Its container runs as the Node user with a read-only filesystem, dropped
capabilities, resource limits and a small private temporary filesystem. No host
port is published. Missing/invalid configuration stops the worker with a sanitized
message. Configure the dedicated secret identically in the app and worker.

The Compose health check reads an atomic local scheduler heartbeat; it sends no
request and cannot start another sweep. It is unhealthy until a sweep returns
HTTP 2xx, immediately after a failed sweep, or when a heartbeat becomes overdue.
Requests have a three-minute deadline. A running sweep has one minute of grace;
between sweeps the allowed age is the configured delay plus four minutes.
This verifies scheduler completion only. Individual feeds may be unavailable,
unconfigured or stale even while the scheduler is healthy; inspect Admin → Health
for connection observations and source views for item freshness. Docker does not
automatically restart a running container solely because it becomes unhealthy.

Tests use registered providers only, four requests at a time. Timeout is eight
seconds per request, redirects are rejected, public DNS addresses are pinned, and
responses are bounded. Optional local service origins must be explicitly trusted
with INTEGRATION_ALLOWED_ORIGINS. Metadata service addresses remain blocked.
Errors are conservative and never include credentials, configured URLs or raw
upstream bodies. Tests do not start scans, research, or send test email.

Admin → Health shows the last observed connection state. Configuration-only
integrations are amber, never green. Some integrations still need protocol-specific
connection adapters (including AIS subscriptions); this is not a feed-payload or
complete geographic coverage guarantee.

Sustained critical failures are tracked across runs. HEALTH_CRITICAL_INTEGRATIONS
defaults to usgs,nasa,cisa; HEALTH_ALERT_AFTER_MINUTES defaults to 30 (minimum 5).
Email requires RESEND_API_KEY, RESEND_FROM and comma-separated HEALTH_ADMIN_EMAILS.
One alert is sent per failure episode, with recovery resetting the episode. Delivery
failure remains eligible for retry. Missing email configuration is reported without
pretending an alert was sent. Use restricted transactional credentials and send to
your own administrators only.

Runtime metadata uses a separate two-connection pool, a three-second connection
budget and five-second query/statement budgets. A failure opens a 30-second
storage circuit so a single news response does not repeat slow connection attempts
for every article bucket. Memory fallback remains explicitly labelled. Production
runtime connections verify certificates. Organization/application queries use the
existing separate pool and are not governed by this metadata circuit.
