# Public aviation disruption context

The Aviation disruptions page combines FAA public NAS status facts with selected
continental-US NOAA/NWS airport weather products. No key is required for this
subset. It is public awareness context, not flight planning, a complete NOTAM
service, a validated risk index or evidence that an airport is fully closed.

## Sources and rights

| Source | Scope and rights | Polling/cache |
| --- | --- | --- |
| FAA public NAS status XML | US government public-domain FAA-authored status facts; raw operator/third-party NOTAM reason text is not republished | 120-second instance cache; browser polls every 300 s |
| NOAA/NWS AWC METAR | US NWS products from selected K-stations; public-domain source products with attribution/no endorsement | 300-second station-selection cache; reports commonly update hourly, with specials |
| NOAA/NWS AWC TAF | Selected US NWS K-station terminal forecasts, kept separate from observations | 600-second cache; periodic bulletins and amendments |

Primary documentation: [FAA NAS status](https://nasstatus.faa.gov/),
[FAA XML user guide](https://nasstatus.faa.gov/static/media/NASStatusUserGuide.cccc6d48.pdf),
[federal open-data licensing](https://resources.data.gov/open-licenses/),
[AWC API and rate rules](https://aviationweather.gov/data/api/), and
[NWS reuse conditions](https://www.weather.gov/disclaimer).

The FAA rights assessment is limited to publicly published, FAA-authored status
facts and excludes full operator NOTAM wording. All new sources are declared in
the integration catalogue and event provider registry with commercial status,
attribution, limits and key requirements. The existing rights gate for broader
international METAR reports is retained. K-station scope is checked on both input
and returned records. No hidden international fallback is used.

FAA status categories include ground stops, ground-delay programmes, other delays
and closure/restriction notices. A closure entry can apply to limited aircraft,
exceptions or a daily schedule. Raw exception wording stays at the original source;
the panel flags condition tokens and links to that source. Published start/reopen
strings are retained as strings: a missing year does not become an invented date.
The feed's Update_Time is a collection timestamp, never notice issue/onset time.
FAA notices without source coordinates are listed without made-up map positions.

## Weather display thresholds

METAR observations retain observation time and reported station coordinates.
TAFs retain issue time, validity and individual forecast periods. Only unexpired,
dated periods contribute to the forecast watch maximum, reassessed at collection
time even when the underlying product is served from last-good cache. The original
retrieval timestamp is not rewritten. Future publication anomalies withhold current
watch classification. Observations older than 90 minutes and expired forecasts are
flagged. Missing reports/fields remain unknown.

Ophanim's display watch uses the maximum applicable value:

- Source category VFR 0, MVFR 40, IFR 70, LIFR 90, when provided.
- Visibility below 1 statute mile or ceiling below 500 ft: 90.
- Otherwise visibility below 3 miles or ceiling below 1,000 ft: 70.
- Otherwise visibility at most 5 miles or ceiling at most 3,000 ft: 40.
- Wind/gust at least 50 knots: 85; otherwise at least 35 knots: 60.
- Thunderstorm/freezing-rain weather code: 70.

Fractional and bounded visibility strings remain available alongside parsed values.
Ceilings use BKN/OVC/VV cloud bases or supplied vertical visibility. Zero means no
configured threshold exceeded, not safe operation. No classifiable fields means no
watch classification. TAF probability fields are shown as published without
inventing probabilities for unqualified periods. Confidence is not estimated.
FAA category display ranks are separate: ground stop 80, closure/restriction notice
70, ground delay 60, other delay notice 40; they are not validated impact measures.

## Transport and limits

Only fixed official HTTPS endpoints are fetched. Redirects are rejected, source
responses are streaming-bounded to 4 MB, timeouts/circuits/last-good stale responses
use the resilience helper, and no upstream error bodies are exposed. AWC requests
are spaced by at least 800 ms and capped at 40/minute/instance, below the documented
100/minute upstream maximum. At most 20 selected K-stations are accepted. Multiple
instances need shared egress budgeting for a coordinated global limit. Source 204
means no data, not normal weather or operations.

The map is optional and defaults off for a lighter page. It plots supplied METAR
station points only, with conflict/private SDK overlays disabled. Filtered CSV
includes source time, retrieval time and data mode. Full worldwide airport coverage,
global NOTAM adapters, calibrated disruption prediction and aircraft tracking are
outside this connector.
