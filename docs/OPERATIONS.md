# Operations and Safety

## Health

- `/api/health` is a public, credential-free readiness endpoint that reports only safe status fields.
- `/api/platform/health` requires an authenticated organization manager and reports database reachability, required configuration status, provider metrics, and recent job runs.
- `/api/providers` exposes provider configuration and in-process metrics without exposing provider credentials.

## Notifications

Existing watchlist and intelligence notifications use the configured Resend integration and delivery logs. The generic platform notification table persists event intent, status, retry timing, and failures for future workflow delivery extensions. It does not expose recipients or provider credentials to browser clients.

## AI and research

OpenAI-compatible AI is constrained to summarization, explanations, follow-up search suggestions, and email summaries. It never chooses providers or executes searches. Optional browser research must run as a separately deployed, private sandbox endpoint and return source-attributed results. Do not deploy browser automation in the web service or against targets without authorization.

## Source handling

Provider metadata records coverage, freshness, licensing, configuration, and capability state. Treat provider output as attributable source material: persist evidence links where a workflow or an analyst decision relies on it. Source access controls must be enforced in the provider backend, never by client-side secrets.
