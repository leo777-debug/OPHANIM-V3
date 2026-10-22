# Follow-up verification — 21 October 2026

| Requested item | Result | Evidence / remaining boundary |
| --- | --- | --- |
| Verified playable cameras | One public DarGlobal coastal player verified | `camera-playback.json`; AIDA/Yiti near Muscat, not priority cargo berths. Fifteen priority port approach/berth feeds remain unverified. |
| Live provider checks | Existing GUR/OpenSanctions parsers and public HIBP endpoint exercised | `public-sources.json`: 24 GUR entries, 20,434 OpenSanctions entries, HIBP public metadata HTTP 200. Licensing gates remain. |
| Customer exposure checks | Not configured | No verified-domain subscription supplied; keys intentionally blank at user request. No tenant exposure queries sent. |
| Real shipment replay / activation | Blocked by absent data | Read-only connected-database audit: zero shipments/arrival labels; no historical files supplied. `history-readiness.json` and worker `backtest-report.json`. No production model activated. |
| Advanced analysts | Implemented and software-tested, not accuracy-validated | Lognormal AFT with censoring, smoothed weather/queue Bayesian chain, regularized AR features and bounded ordered-precursor mining. AFT/Bayesian votes must beat simple specialists on a distinct weighting partition. |
| Road routing | Implemented in existing route/globe flow | Valhalla truck costing with selected depot/gate and dimensions/hazmat, tenant metadata persistence, separate corridor filters. Synthetic HTTP/browser integration passes; actual map/router deployment still required. |

Local validation: 353 TypeScript tests passed (two live tests skipped by default),
16 Python tests passed, production Next.js build passed, full migration/RLS tests
passed, real HTTP worker/database scoring test passed, targeted ESLint and Compose
configuration validation passed. The production browser check covers cold-start
withholding, a saved human call, public-camera gaps/player access and saved truck
leg/globe integration. See `tools/forecast/browser-report.json`.

The public player check uses only the documented YouTube IFrame API and stores
metadata, not media. Its advancing playback does not prove imagery age or surveyed
camera location. A commercial-restricted Dubai aggregator and exposed-CCTV
directories were excluded. GUR/OFAC-source entries remain screening evidence,
not confirmation or vessel locations. No production migrations or deployment were
applied, and no API keys were populated.

No real-data score or model activation is substituted with synthetic tests. The
automatic launch gate additionally requires thirty shock-period holdout cases;
missing history cannot be bypassed by a confident-looking Forecast Card.
