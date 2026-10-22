# Shared knowledge

`past/` holds historical disruptions; `present/` holds dated current snapshots.
Company uploads NEVER go here. Use `ml/scripts/import_knowledge.py` to download
or normalise sources, then the protected shared-ingestion route documented in
docs/KNOWLEDGE.md. Downloaded data is ignored by Git.

Every file requires `<file>.meta.json` with source, source_url, licence,
licence_url, commercial_use (boolean), reviewed_at, attribution, published_at,
valid_from, valid_to, region, language and customer_data=false. Missing or unknown
rights exclude the file. A public API does not establish a commercial licence.
EM-DAT and ACLED require founder-supplied commercial rights. ReliefWeb reports
retain original publisher rights. GDELT is supporting evidence only.

Keep original event dates when archiving old snapshots. Historical valid_to
must be explicit; undated/expired documents are excluded from current-only search.
Normalised event locations are approximate and nearest ports/airports are only
computed against a licence-cleared reference gazetteer, otherwise null/empty.
Hazard magnitude is not proof of port closure or shipment impact.
