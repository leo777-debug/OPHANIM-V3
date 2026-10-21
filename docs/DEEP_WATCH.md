# Deep Watch

Deep Watch extends migrations 011/012 and the existing dark-web scan, entity graph,
deduplication, match records, intelligence reviews, alerts and deliveries. It adds
no parallel mention or watchlist table.

`POST /api/dark-web/scan` first synchronizes active shipment entities. Queries must
exactly match a registered tenant entity/alias or one of its generated risk queries.
Appending an unrelated query or Boolean search expression is rejected. Shipments
register vessel IMO/MMSI, carrier, origin/destination and transshipment port codes,
recorded route terminals and explicitly supplied customer-contact/customer-asset domains. Shared carrier/port entities
retain shipment associations rather than replacing them on each synchronization.
The existing cyber inventory remains part of the graph. Domain ownership still
requires customer declaration and provider verification; registration alone does
not establish ownership or authorization to query third-party accounts.

The new HIBP adapter calls the documented
[`breacheddomain` API](https://haveibeenpwned.com/API/v3#BreachesForDomain) using
server-only `HIBP_API_KEY` and `HIBP_ORGANIZATION_ID`. The subscription must be
bound to the current tenant and the queried domain must be verified with HIBP.
Only breach-name/domain metadata is retained: no passwords, account aliases,
breach dumps, attachments, paste bodies or illicit-market content. Metadata is
labelled `licensed_intelligence`, with source attribution and unverified-claim
review semantics. Subscription limits/terms apply. The adapter enforces a
conservative one-request-per-minute process-local cooldown and honors 429
Retry-After. Distributed deployments must coordinate subscription quota upstream.
No live subscription was exercised during implementation.

Additional providers implement `DarkWebProvider` and register in `dark-web/index.ts`.
They must use a managed, lawful API; bind queries to the tenant graph; declare
source categories, licensing, retention, credentials and rate limits; and return
safe defensive **metadata only**. Never download raw dumps, attachments or illegal
content. The framework drops prohibited-content category/text markers before
normalization. This defensive check is not an illegal-content classifier and does
not authorize ingesting arbitrary forum text. A provider that cannot guarantee
safe metadata upstream is out of scope. No marketplace crawler is implemented.

Fixtures cover cargo theft, smuggling, sanctions-evasion brokering, fraudulent
bills of lading and logistics fraud. They retain `development_fixture`, remain
disabled in production and are excluded from forecast features. HIBP supplies
credential-exposure metadata; logistics chatter requires another reviewed managed
provider. Its existence must not be confused with live chatter coverage.

`GET /api/dark-web/corridor?shipment=UUID` returns entity matches and the existing
shipment signal assessments, with tenant predicates, match method, source
reliability, confidence and review state. Route Lens displays association-only
markers for unlocated mentions. They are not reported physical positions.
The existing operations desk remains the false-positive/review path. Forecast
snapshots record mention count, strongest match contribution and assessment
confidence, excluding fixtures and rejected/duplicate/closed mentions. Noisy
claims never become confirmed allegations or a prediction merely by matching.
