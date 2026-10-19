# Feed connection monitoring

Apply migrations with `node db/run-migrations.mjs` after configuring DATABASE_URL.
Operational metadata uses the private `ophanim_runtime` schema. It has RLS and no
browser-role grants or policies. No credentials or private feed bodies are stored.

Without a database, self-hosted instances persist metadata atomically in
OPHANIM_RUNTIME_DIR (default `.ophanim-runtime`, ignored by Git). This filesystem
mode is single-instance. On serverless hosting, configure PostgreSQL for shared
durability. If persistence fails the UI explicitly reports process-local storage.

Set HEALTH_CRON_SECRET privately and run `docker compose --profile health up -d`
for a five-minute self-hosted health worker. HEALTH_POLL_SECONDS can increase that
interval; it cannot lower it below five minutes. APP_INTERNAL_URL defaults to
http://ophanim:3000. A hosted scheduler can call GET /api/platform/health/cron with
Authorization: Bearer <HEALTH_CRON_SECRET>. The job is disabled without that secret.
Hosting does not become scheduled merely by adding this endpoint.

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
