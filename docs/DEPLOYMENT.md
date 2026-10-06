# Deployment

Ophanim is a single Next.js deployment backed by PostgreSQL. Existing map routes and provider wrappers execute in the same application; Ophanim does not require a second Osiris deployment.

## Required production configuration

- `DATABASE_URL` - PostgreSQL connection string
- `APP_URL` - public canonical application URL
- `WATCHLIST_CRON_SECRET` - bearer secret for the watchlist cron service
- `IMPORT_CRON_SECRET` - bearer secret for the shared legacy and generic import worker

Optional settings include Resend credentials, AI defaults, provider-specific credentials, and `UMAMI_ENDPOINT` plus `UMAMI_WEBSITE_ID` for self-hosted opt-in analytics. With no Umami variables, the application sends no telemetry request.

## Render

`render.yaml` provisions the web service, PostgreSQL database, and separate cron services for watchlists, intelligence alerts, disruption synchronization, and imports. Migration execution is serialized by an advisory lock in `db/run-migrations.mjs`. Render's `preDeployCommand` runs migrations before a release; the container startup command repeats the safe migration check for non-Render deployments.

The import cron calls `/api/imports/cron`, which processes both legacy import jobs and generic entity imports. Do not expose cron secrets to browsers.

## Containers

`Dockerfile` builds the standalone Next.js output and runs as a non-root `nextjs` user. `docker-compose.yml` uses the `ophanim`, `ophanim-cache`, and `ophanim-intel` internal service names. Optional CLI providers remain backend-only and must be configured through environment variables.

## Database migration policy

Run migrations with `node db/run-migrations.mjs`. Do not edit a migration that has already been applied to a shared database; create a later numbered migration for corrective schema work. Back up production PostgreSQL before a large import or deployment.
