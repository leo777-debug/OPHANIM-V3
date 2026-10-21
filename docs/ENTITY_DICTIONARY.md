# Deterministic entity dictionary

The Stories view uses a dated English/Arabic country and territory dictionary,
a packaged port reference and Ophanim's curated place/airport/organization list. An entity match is a
textual reference candidate, not an event location, exposure, nationality finding
or validated identity. No coordinates are created from country-name matches.

Country/territory labels cover 249 manually scoped region codes. They were generated
on 2026-10-20 from Node 24.19.0, ICU 78.3, CLDR 48.0 and Unicode 17.0 using
Intl.DisplayNames. The date is local generation, not upstream publication. Version
and provenance are packaged in country-gazetteer.json and the existing provider
registry/integration catalogue. No runtime service or key is required. Source:
https://cldr.unicode.org/. Unicode License v3 permits commercial use; the full
copyright/permission notice is retained in public/reference/UNICODE-LICENSE.txt.
Labels do not state a position on sovereignty or boundaries.

Normalized whole-word matching uses a precompiled token trie. Arabic conjunction
and preposition prefixes are supported; ordinary word substrings are excluded.
Longer country phrases suppress contained country tokens in the same span, so
South Sudan alone does not also link Sudan. A separately mentioned Sudan still
links. Accented names retain their original display and a limited normalized alias.

Bare English Chad, Jordan and Georgia are withheld; explicit country phrases and
unambiguous Arabic labels can match. Bare Arabic Mali (also financial language)
and Oman/Amman are withheld; explicit country/sultanate phrases can match. This
favours precision and can miss real news references. These rules are reviewed
configuration, not AI guesses. No pronoun-like US alias is introduced.

People remain excluded unless a supplied reviewed dictionary entry declares a
public role. No private-name, phone, social-account or location-tracking extraction
was added. Explicit IMO/MMSI/ICAO24 identifiers retain the earlier validation rules.
Cross-feed linkage remains limited to the feeds wired into each evidence view;
the broader city/asset gazetteer and universal entity graph are unfinished.

## Port reference

Stories loads the port dictionary as a separate client chunk when opened; the
initial map does not need this reference chunk. It derives 3,924 identities from
the existing 3,962-record Marnet/searoute-py 1.6.0 port reference, pinned to dataset
date 2026-05-17 and SHA-256
`8398cb9554a19cf37f53f932f3842f58fbd94fce4c8e2704c3f5a4205ea5977e`.
Apache-2.0 attribution and the existing original notice are retained. The reference
date is not an event observation, operating-status check or completeness claim.

Aliases require explicit port phrases, such as `Port of Durres`, `Durres port`,
or marked reference codes such as `port ALDRZ`. Arabic `ميناء` can prefix the
original source name; this is not a translated Arabic-name catalogue. Bare city
names and codes are not added. 516 ambiguous alias occurrences are withheld;
shared marked codes can still identify the source record. Existing curated
Jebel Ali and Rotterdam identities are preserved. Some entries are inland/dry
ports. No geometry is copied into the mention dictionary, and a name match never
creates event coordinates, vessel identity, closure or exposure.

Regenerate with `node scripts/generate-port-gazetteer.mjs`. The generator verifies
the bundled original hash before producing the dictionary and small catalogue
metadata. It performs no network request. Review aliases and attribution after
any source update. A failed reference-chunk load leaves curated matching usable
with an explicit unavailable message. No model, API key or optional worker is
needed for country/port matching or the linked-evidence view.

## Cross-feed links

Stories links explicit entity mentions across currently loaded news, USGS seismic
and fire records. Its bipartite graph joins evidence to dictionary/identifier
mentions; shared names do not prove shared events, identities or causation.
Each original source link/time, manually reviewed or unreviewed trust, and
fresh/stale/unknown/replay state remains visible. Undated/future observations
remain distinct. Replay never renews dates or enables current convergence.

The normalized-event adapter requires an explicit authorized organization scope;
the public graph excludes private and missing scopes without exposing rejected
counts. This is a data-projection guard, not a substitute for server authorization.
The displayed graph is bounded to 1,000 records and 30 mentions per record, with
an omitted-record count. The source table describes loaded evidence and missing
dates/matches, not worldwide/geographic coverage or incident absence. The graph
does not generate alerts or persist cluster/entity membership history.

Regenerate with `node PARITY/generate-country-gazetteer.mjs`, review every changed
label/alias, retain the Unicode notice, and run checks. Regeneration changes the
recorded version/date to the actual local runtime. It is not a scheduled importer.
No World Monitor code, data, style, asset, embed or service was used.
