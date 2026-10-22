# Connection-test credential isolation

Admin → Integrations accepts a registered integration ID only. Set credentials
in the private server environment, using the inventory in API_KEYS.md.

The compatible hosted AI probe sends AI_API_KEY only to AI_BASE_URL.
The embeddings probe sends only EMBEDDING_API_KEY to EMBEDDING_BASE_URL.
The Ollama / LM Studio probe is keyless, like the existing local inference path;
it never borrows either credential. An authenticated local gateway can instead
be configured explicitly as the compatible AI provider with its own AI settings.

All three probes use read-only model discovery. They normalize a pasted
completion endpoint and discard query parameters before making the request.
No prompts, research context or embedding input are sent. A successful connection
does not prove that a selected model is loaded or supports a particular task.

Malformed URLs, URL credentials and malformed AI authorization values produce
a generic persisted Error observation without a request, value echo or raw
exception. Connection transport pins DNS, rejects redirects, bounds response size
and enforces an overall deadline. Local HTTP requires an explicit allowed origin.

The regression suite includes a real loopback HTTP server that records the
authorization headers received by three separate provider paths. Its credentials
are synthetic test strings. No real key or external provider is used by this test.

No World Monitor code, assets, data or services were used.
