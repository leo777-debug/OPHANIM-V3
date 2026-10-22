# Public advisory update channel

The advisory page uses GET /api/public-intelligence/stream, an unauthenticated
Server-Sent Events notification channel. It contains only a revision hash, a
check time, polling interval and failed-source count. It never queries organization
records or sends credentials, private SDK events or complete news content.

The server checks the five non-country official advisory sources every 300 seconds
while browsers are subscribed. Each provider still obeys its own cache/cadence.
This is polling with push notifications, not upstream continuous streaming.
Country-specific FCDO advice follows the selected page's hourly cache and regular
browser refresh, not the shared notification feed.

One loop per active server instance coalesces concurrent subscribers. A changed
content/status revision triggers public-update; the browser then retrieves the
public advisory API. Heartbeats every 15 seconds describe transport only. A failed
poll creates no fabricated observation. Diagnostic/source details remain available
in the normal API. Browser polling every 300 seconds continues if SSE is unavailable.

Connections close after 55 seconds and native EventSource reconnects after three
seconds, fitting a 60-second handler budget. Disconnect and cancellation clear
timers/subscriptions. There is a limit of 200 simultaneous subscribers per instance
and 20 connection attempts per minute/client IP; excess requests return a retry
response. Tests exercise 1,000 listeners in a bounded hub, but that is not a claim
of 1,000 measured browser connections or multi-region load validation.

Different application instances poll independently. Provider caches, subscriptions
and revision state are process-local. A shared durable fanout service is still
required for synchronized multi-instance updates and comprehensive map-layer push.
Proxies must preserve text/event-stream and disable buffering. No deployment or
upstream streaming configuration is implied by adding this endpoint.
