# Private SDK setup

The SDK worker is optional. Public map feeds do not require it. The current store
is process-local, is cleared on restart and supports one explicitly configured
organization per deployment. It is not durable multi-tenant ingestion.

1. Find your organization's UUID in your administration records. Do not use its
   display name or slug as `SDK_ORGANIZATION_ID`.
2. In uncommitted `.env` or your host dashboard set `SDK_ORGANIZATION_ID` to that
   UUID and `SDK_INGEST_KEY` to a credential you generate and keep server-side.
   Do not place either credential in a browser setting or source file.
3. Restart Ophanim. Open Admin → Integrations → Optional service setup. Select
   Private SDK ingestion, review the configuration step, then select **Send
   synthetic test event** in step 3. Administration access and the matching
   organization are required. The server supplies its credential; the browser
   never receives it. This exercises credential/schema validation without storing,
   mapping or streaming the diagnostic. It does not prove an external sender is
   running. The generic integration-card test remains configuration-only.
4. Your authorized backend posts JSON to `/api/sdk/ingest`. Current compatibility
   contract: `{ "source": "your-service", "apiKey": "<server credential>",
   "entities": [{ "id": "asset-1", "name": "Your operational asset",
   "position": { "lat": 0, "lng": 0 }, "timestamp": "<actual ISO observation time>" }] }`.
   Prefer `Authorization: Bearer <server credential>` and omit the JSON apiKey;
   the older body credential remains compatible. Replace placeholders privately;
   no working key is included here. Omit timestamp
   if unknown; Ophanim records receipt time separately instead of inventing one.
5. Read `/api/sdk/ingest` or connect to `/api/sdk/stream` from a signed-in browser
   belonging to that organization. Signed-out requests receive 401; other
   organizations receive 403. Missing settings produce a clear 503 state.

For a sender connectivity check, post the same payload with `"diagnostic": true`.
The response must say `"accepted": 1`, `"rejected": 0`, `"diagnostic": true` for
one valid entity. This sender-to-ingestion test never creates a live object.
Do not put a real person's location in a diagnostic. Test events have unknown
observation time unless explicitly supplied. The server records receipt separately.

Limits: 1 MB streamed JSON body, 500 entities/request, 30 authenticated requests/minute per worker, 10,000
stored entities with oldest-entry eviction, last 100 ingestion records. Use small
JSON payloads. Invalid/future observation times are flagged, missing confidence
remains unknown, and zero confidence is preserved. Changing the configured
organization resets the process-local store and closes old streams. SSE checks
the store every five seconds and closes after one minute for session revalidation;
clients should reconnect. It is not a streaming upstream-source guarantee.

Use only authorized organization assets and permitted public safety information.
Do not send private-person tracking, targeting or strike-prediction data.
Scoped organization API keys, durable storage and multi-worker fanout are still
pending; see PARITY/REPORT.md. The wizard does not save configuration or credentials.
