# Operations and Safety

## Health

- `/api/health` is a public, credential-free readiness endpoint that reports only safe status fields.
- `/api/platform/health` requires an authenticated organization manager and reports database reachability, required configuration status, provider metrics, and recent job runs.
- `/api/providers` exposes provider configuration and in-process metrics without exposing provider credentials.

## Notifications

Existing watchlist and intelligence notifications use the configured Resend integration and delivery logs. The generic platform notification table persists event intent, status, retry timing, and failures for future workflow delivery extensions. It does not expose recipients or provider credentials to browser clients.

## AI and research

OpenAI-compatible AI supports summaries, explanations, follow-up search suggestions,
logistics extraction and general-mode incident/claim tasks with strict output
validation. It never chooses providers or makes operational decisions. Knowledge
answers retrieve organization-scoped sources and validate quotations/citations.
See [Knowledge operations](KNOWLEDGE.md) for storage, queue, RLS and embedding setup,
and [the model report](../ml/FINAL_REPORT.md) for measured quality and release gates.
Optional browser research runs in a separate private sandbox endpoint.

## Source handling

Provider metadata records coverage, freshness, licensing, configuration, and capability state. Treat provider output as attributable source material: persist evidence links where a workflow or an analyst decision relies on it. Source access controls must be enforced in the provider backend, never by client-side secrets.
