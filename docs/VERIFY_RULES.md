# Ophanim Verify Rules

Milestone 0, 9 October 2026. Independent implementation; no World Monitor source,
API or embeds. Verify checks observable public events, not shipment risk scores.

## Flow

1. Text is required. An optional user-authorized URL is fetched as bounded text.
2. A rule parser proposes the claim; optionally, the configured AI resolves fields.
   Users review/correct type, coordinates/code, time window and exact entities.
3. A fixed claim-type allowlist selects registry providers. AI cannot alter it.
4. Checkers match dated observations to the confirmed place/window/entity.
5. Rules produce the verdict. AI can append a separately labelled INFERENCE.

All thresholds are in `src/lib/verify/types.ts`: default 24-hour claim window,
maximum seven days, 150 km hazard/news matching radius, minimum magnitude 4.5,
two independent trusted publishers, up to 50 evidence items. Airport matching
requires an exact ICAO code, not proximity. Exact entity names/IDs are required
for maritime and sanctions claims. Review geographic matching: the 150 km radius
is an explicit coarse assumption, not an assertion that an event hit a city.

## Checkers

| Type | Support | Contradiction / limits |
| --- | --- | --- |
| Earthquake | USGS record within radius/time, meeting stated magnitude | No matching quake is not contradictory evidence. Existing feed covers 4.5+ and last 24 hours only. |
| Airport | Exact-code closure notice; separately, fog/visibility or recorded diversions support disruption | Positive departures in a dated interval contained in the claim window contradict a total closure. Fog alone never confirms closure. Open-airport status alone does not refute disruption. |
| Storm/flood | Same event type, radius and window | Generic severe storm cannot prove a tropical cyclone. No forecast-cone inference. |
| Wildfire | EONET wildfire record with coordinates/time | No FIRMS connector in this checker; missing detections prove nothing. |
| Maritime | Exact entity, place/window and official attack/seizure/port-closure observation | AIS gaps or positions never prove attack/seizure/closure. |
| Sanctions | Exact entity, named and dated list with explicit listing | Missing listing remains neutral. A list date must parse successfully. |
| General news | Explicit event observation, place/window, approved trusted source tier | Social/unreviewed items cannot confirm a claim; keywords alone are not evidence. |
| Uncheckable | Opinions, predictions, motives, unsupported/negative claim forms | Returns "This can't be checked with data". Private-person claims are declined. |

Verdicts use credible evidence only (official, wire, established media):

- CONFIRMED: direct support from an official source or two independent trusted
  publishers, with no credible contradiction in the checked sources.
  Weather alone never establishes actual flight disruption, either.
- PARTLY TRUE: supported and contradicted aspects are both present. For the
  synthetic airport demo, fog/diversions support disruption, while departures
  contradict total closure. It is not proof that the airport was partly closed.
- DATA SAYS OTHERWISE: credible contradiction without credible supporting aspects.
- NOT CONFIRMED YET: no sufficient direct support or only low-trust observations.
- NOT CHECKABLE: no data verdict for opinions/predictions/motives.

Never output "FALSE". Missing/failed sources are not evidence. A confirmation is
limited to the sources checked, not a guarantee that every possible source was
searched. These are bounded public-event checkers, not universal fact-checking.

## Source Registry And Permissions

Existing USGS and NASA EONET providers are reused without changing defaults.
`official-sanctions-events` is also reused when configured, but records must
include exact entities and `listName`, `listDate`, `listed` inside its upstream
attributes. Existing War & Sanctions search results are not treated as current
dated list observations or live AIS verification.

New providers are catalogued in the existing intelligence registry. Query-only
providers do not run during unrelated background ingestion. Health/admin lists
their licences, commercial status, attribution, credentials and rate limits.

| New provider | Licence / terms | Commercial use | Attribution | Credentials | Default |
| --- | --- | --- | --- | --- | --- |
| NOAA Aviation Weather METAR | NWS public domain applies to NWS products; international/third-party reports require review | unknown until operator review | NOAA/NWS Aviation Weather Center; Ophanim interpretation, no endorsement | none | off |
| Configured public verification observations | Unknown until operator supplies terms/licence | unknown until reviewed | operator-supplied, required | none in this adapter; public HTTPS endpoint | off |

Primary documentation: [NWS use policy](https://www.weather.gov/disclaimer) and
[Aviation Weather data API](https://aviationweather.gov/data/api/). The NWS policy
explicitly distinguishes its products from third-party data; do not assume all
international METAR redistribution is cleared. The API documents 100 requests
per minute. This adapter additionally caps itself at five requests/minute per
process and caches each station for 60 seconds. Only METAR, not TAF, is connected.

Only after review, set `VERIFY_METAR_COMMERCIAL_USE=yes` to enable the new METAR
provider. No automatic default authorization is inferred from upstream availability.

The configurable observations adapter accepts an array of the existing
`NormalizedIntelligenceEvent` objects (HTTP application/json or plain JSON text,
max 1 MiB). It is not an airport movement/UKMTO/OpenSanctions API implementation.
Supply a legally usable public feed with factual typed observations:

```text
VERIFY_OBSERVATIONS_URL=https://your-reviewed-public-feed.example/events.json
VERIFY_OBSERVATIONS_LICENSE=<actual licence name>
VERIFY_OBSERVATIONS_TERMS_URL=<primary terms URL>
VERIFY_OBSERVATIONS_ATTRIBUTION=<required attribution>
VERIFY_OBSERVATIONS_COMMERCIAL_USE=yes
VERIFY_SOURCE_TIERS={"official-source":"official","wire-source":"wire","publisher":"established_media"}
VERIFY_SOURCE_GROUPS={"wire-source":"wire-original","publisher":"publisher-original"}
```

Source IDs with no configured trust tier are unverified, regardless of upstream
claimed trust. Review syndication/original reporting and assign independence
groups: unreviewed IDs share one group and cannot satisfy the two-publisher rule.
Do not promote a social source or syndicated copy just to get a confirmation.
Provider feed attributes include `airportCode`, `departures`, `intervalStart`,
`intervalEnd`, `diversions`, `closed`, `officialStatus`, `listName`, `listDate`,
`listed`, `claimObservation` and `explicitConfirmation` as applicable.
Missing fields are ignored, not guessed. Organization-scoped records are rejected.

## URL And Abuse Safety

- HTTP(S) only, standard ports; no embedded credentials.
- Reject reserved/private/loopback/link-local targets, all DNS answers and each
  redirect. Canonicalize resolved IPv6 addresses too. The socket is pinned to
  the checked address, retaining the original TLS hostname.
- Eight-second total fetch limit, three redirects, one MiB response bound; only
  uncompressed HTML/plain text articles. No scripts execute. htmlparser2 extracts
  up to 20,000 characters; a hash and fetch time accompany the private snapshot.
- Article text is unverified input, not independent evidence. It is not exposed
  in public shares. Evidence excerpts are capped at 240 characters and linked.
- Only retrieve articles when the user confirms permission. Configure
  `VERIFY_BLOCKED_HOSTS` for sites whose terms disallow retrieval. No paywall,
  login, anti-bot or access-control circumvention.
- Input 3,000 characters; request 16,000 bytes. Cross-origin mutations are denied.
- Ten mutations/minute/IP; twenty/minute/authenticated user. The counters are
  process-local; production must use a trusted forwarding proxy and a shared
  limiter for multiple instances. Browser rendering is not a live sandbox search.
- Private-person allegations are rejected by conservative heuristics. This is
  not exhaustive abuse classification; moderation is needed before open public
  deployment. Negative/compound unsupported forms are uncheckable rather than
  silently reversing their meaning.

## Storage, History And Shares

Apply the normal migration runner: schema `db/migrations/024_verify.sql`, followed
by `supabase/migrations/20261009141447_verify_security.sql`. Both organization-owned
tables have RLS and composite ownership/parent references. Existing security
migrations must be applied too; migration order is significant.

Signed-in users see their own organization-scoped history. Re-checks reference
the previous run and preserve it; they retain its confirmed time window. Backend
queries bind organization and user IDs from authentication, never the request.
Authenticated Data API users have SELECT only for their own membership/history;
they cannot insert fabricated verdicts or share snapshots. Writes/revocation run
through the trusted backend with application-level ownership checks. Anonymous
roles have no table access.

Shares are opt-in. The claim itself can contain sensitive words supplied by a
user, so the user must confirm that it contains no private/company data. A positive
whitelist excludes actor IDs, organization metadata, article text, configuration,
AI keys and previous-run IDs. Public pages show the finding, evidence, limitations,
check time and replay status only. Tokens contain 256 random bits and are hashed
in storage. Durable links expire after 30 days and can be revoked.

Without authentication/database, current checks are available for 30 minutes in
the server process; history explicitly says unavailable. Consent-based temporary
public shares are stored under the OS temp directory (not the repository), expire
after 30 minutes, and are deleted on expiration checks/creation cleanup. They can
be revoked by their opaque HttpOnly session cookie. This is development/single-
instance fallback, not durable or multi-instance storage. Restarting loses access
to temporary run history. Do not use fallback storage for production evidence retention.

## Testing And Demo

```bash
npx tsc --noEmit
npm test
npx eslint src/lib/verify src/components/verify src/app/verify src/app/api/verify src/lib/intelligence/event-provider.ts src/lib/intelligence/event-provider-registry.ts
npm run build
```

With `DATABASE_URL` absent the new live RLS test is visibly skipped. With it set,
`npx vitest run src/lib/verify/rls.integration.test.ts` expects a migrated,
non-production Supabase-compatible database and a role allowed to seed fixtures,
set `authenticated`, and roll back. It does not apply migrations silently. The test
checks real policy visibility, same-organization other-user denial, cross-tenant
references, anonymous grants and denial of client verdict insertion.

`test-artifacts/verify-smoke.cjs` uses Playwright (normal installed package or
`PLAYWRIGHT_MODULE` pointing to the bundled package) and installed Chrome. Set
`VERIFY_TEST_URL` to the running app if not localhost:3000. It verifies replay,
share/PNG/revocation, re-checks, parsing, scrollability and mobile overflow.

Five committed synthetic fixtures support offline rehearsal: Dubai fog,
earthquake, Red Sea AIS gap, sanctions, opinion. Every screen/image/share labels
them synthetic replay at its fixture time. They are not recordings of actual
Dubai flights, ship incidents, sanctions or USGS earthquakes. Replays are explicit
user choices, never a silent fallback to fabricated live results.

Screenshot OCR, natural-language watch creation and Milestones A-E are outside
this implementation. Live closure/flight histories, UKMTO and cyclone forecast
connectors need compliant sources before corresponding live acceptance demos.
