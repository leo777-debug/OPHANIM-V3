# Deterministic entity dictionary

The Stories view uses a dated English/Arabic country and territory dictionary plus
Ophanim's small curated place/port/airport/organization list. An entity match is a
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

Regenerate with `node PARITY/generate-country-gazetteer.mjs`, review every changed
label/alias, retain the Unicode notice, and run checks. Regeneration changes the
recorded version/date to the actual local runtime. It is not a scheduled importer.
No World Monitor code, data, style, asset, embed or service was used.
