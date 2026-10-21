# Deep Watch (dark-web monitoring)

Defensive monitoring of dark-web and underground-forum signals about **your own**
exposure: leaked credentials at your domains, and chatter naming your vessels,
ports, carriers, clients or lanes in contexts such as cargo theft, smuggling,
sanctions-evasion brokering, fraudulent bills of lading and logistics fraud.

It extends the existing dark-web core — no parallel tables or second pipeline:
`ophanim_dark_web_mentions`, the entity graph (`ophanim_entities` / aliases),
`ophanim_mention_entity_matches`, `ophanim_signal_assessments`, the review queue
and `ophanim_intelligence_alerts` / deliveries.

## How it works

1. **Watchlist = entity graph.** `POST /api/dark-web/entities/sync` (and the
   exposure cron) registers every live shipment's vessel (IMO/MMSI), carrier,
   origin/destination/transshipment ports (UN/LOCODE), container and B/L, the
   customer's email domain, and every open job file's references, ports and client
   domain. Delivered, cancelled, archived and synthetic items are skipped.
2. **Scoped queries.** Only those registered identifiers are sent to licensed
   sources (`allowedTerms`); any other query is refused by the adapter.
3. **Sources (pluggable, licensed, monitor-only).**
   - `hibp-domain-search` — Have I Been Pwned domain search (`HIBP_API_KEY`;
     domains must be verified with HIBP). Stores breach name and account **count**
     only, never addresses. Category `licensed_intelligence`.
   - `licensed-threat-feed` — your contracted breach / dark-web vendor over HTTPS
     (`DEEPWATCH_FEED_URL`, `DEEPWATCH_FEED_TOKEN`, optional
     `DEEPWATCH_FEED_CATEGORY`, `DEEPWATCH_FEED_NAME`).
   - `development-dark-web-fixtures` — synthetic `development_fixture` scenarios
     for tests and demos only (never in production), including one per logistics
     threat category.
   Ophanim never crawls marketplaces, never buys, posts, transacts or interacts.
4. **Hard filter.** Every result passes `isProhibitedContent()` before it is
   normalised, hashed or stored; matches (e.g. CSAM indicators) are dropped whole
   and only counted (`droppedProhibited`).
5. **Categories.** Provider tags are kept; keyword rules add `cargo_theft`,
   `smuggling`, `sanctions_evasion_brokering`, `fraudulent_bill_of_lading`,
   `logistics_fraud`.
6. **Matching, confidence, alerts.** The existing reconcile step matches mentions
   to entities (exact IMO/UN/LOCODE/domain down to weak name), scores confidence,
   opens a review item and queues alerts. Alert summaries now include
   **why this matched** (the strongest matched identifiers). Every item is labelled
   an unverified claim with its source; analysts mark false positives in the queue.
7. **Route corridor.** `GET /api/dark-web/corridor?shipmentId=|jobFileId=` returns
   mentions on that route's entities with source, category, review status and
   match reasons, plus the shipment's signal assessments (Route Lens layer).
8. **Forecast features.** `darkWebFeatures()` gives The Panel: live mention count,
   strongest match method (and rank), best assessment confidence, and the number of
   logistics threat categories — false positives and duplicates excluded.

## Schedules

`POST /api/dark-web/exposure` with `Authorization: Bearer $INTELLIGENCE_ALERT_CRON_SECRET`
refreshes each organization's watchlist and scans it; `/api/intelligence/cron`
(existing) delivers the alerts.

## Adding a source

Implement `DarkWebProvider` (`src/lib/dark-web/types.ts`): metadata with licence
and commercial-use decision, `validateConfiguration()` that fails without keys, a
`search()` that refuses queries outside `context.allowedTerms`, and existing
`source_category` values only. Register it in `src/lib/dark-web/index.ts`, add its
variables to the integrations catalogue and regenerate `.env.example`.

## Limits

Dark-web data is noisy and often unverifiable; treat every hit as a lead. Coverage
depends entirely on the licensed sources configured. Without keys, only the
synthetic fixtures exist (tests/demo).
