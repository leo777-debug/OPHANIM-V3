# Private SDK setup

The SDK worker is optional. Public map feeds do not require it. The current store
is process-local, is cleared on restart and supports one explicitly configured
organization per deployment. It is not durable multi-tenant ingestion.

1. Find your organization's UUID in your administration records. Do not use its
   display name or slug as `SDK_ORGANIZATION_ID`.
2. In uncommitted `.env` or your host dashboard set `SDK_ORGANIZATION_ID` to that
   UUID and `SDK_INGEST_KEY` to a credential you generate and keep server-side.
   Do not place either credential in a browser setting or source file.
3. Restart Ophanim. Open Admin → Integrations. Its SDK test checks configuration
   only; it does not send a test entity or prove that an external sender is running.
4. Your authorized backend posts JSON to `/api/sdk/ingest`. Current compatibility
   contract: `{ "source": "your-service", "apiKey": "<server credential>",
   "entities": [{ "id": "asset-1", "name": "Your operational asset",
   "position": { "lat": 0, "lng": 0 }, "timestamp": "<actual ISO observation time>" }] }`.
   Replace placeholders privately; no working key is included here. Omit timestamp
   if unknown; Ophanim records receipt time separately instead of inventing one.
5. Read `/api/sdk/ingest` or connect to `/api/sdk/stream` from a signed-in browser
   belonging to that organization. Signed-out requests receive 401; other
   organizations receive 403. Missing settings produce a clear 503 state.

Limits: 500 entities/request, 30 accepted-key requests/minute per worker, 10,000
stored entities with oldest-entry eviction, last 100 ingestion records. Use small
JSON payloads; a fully streaming request-size guard remains outstanding. SSE checks
the store every five seconds and closes after one minute for session revalidation;
clients should reconnect. It is not a streaming upstream-source guarantee.

Use only authorized organization assets and permitted public safety information.
Do not send private-person tracking, targeting or strike-prediction data.
The setup wizard, send-test-event button, scoped organization API keys, durable
storage and multi-worker fanout are still pending; see PARITY/REPORT.md.
