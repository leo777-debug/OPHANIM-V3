# Knowledge operations

Apply additive migrations with `node db/run-migrations.mjs`. PostgreSQL must
provide pgvector. The security migration creates two NOLOGIN, NOBYPASSRLS roles
and grants membership to the migration account. If the web login differs, the
database administrator must grant it `ophanim_knowledge_app` and
`ophanim_knowledge_worker`. No anonymous table grants are added. Customer-facing
queries SET LOCAL ROLE and authenticated user/organization context in a transaction.

Files reuse the existing Supabase `ophanim-private` bucket. Without Supabase
backend storage, set KNOWLEDGE_STORAGE_DIR to a private directory outside the
repository/public web root. Storage credentials remain backend-only. Authentication
supports the existing Supabase and legacy sessions. Shared publishing requires
KNOWLEDGE_CRON_SECRET; an organization owner alone cannot publish global data.

Install Python ingestion dependencies from ml/requirements.txt, preferably in
an external-drive virtual environment, and set KNOWLEDGE_PYTHON to that Python.
Install Tesseract with eng+ara for scanned PDFs/images. Text PDF, DOCX, XLSX,
CSV, TXT/MD and plain-text EML are supported; HTML-only EML requires a text export.
MSG is excluded until a permissively licensed parser is reviewed. Files <=10 MB,
PDFs <=200 pages, <=2,000 chunks. Office expansion and extraction output are bounded.

Containers use the optional private Debian/Python extractor service via
KNOWLEDGE_EXTRACTOR_URL, because PDFium wheels require glibc while the web
container uses Alpine. Allow that exact internal origin in AI_LOCAL_BASE_URLS.
The service requires the worker secret and exposes no host port.
The Compose model profile also starts a scheduler that calls the authenticated
queue endpoint every minute. Set KNOWLEDGE_CRON_SECRET in the uncommitted .env.

Set EMBEDDING_BASE_URL, EMBEDDING_MODEL (Qwen3-Embedding-0.6B, 1,024 dimensions),
optional EMBEDDING_API_KEY. Allow local origins through AI_LOCAL_BASE_URLS. Keep
embedding model identity unchanged until a full reindex; dimensions alone do not
mean two embedding models share the same space. AI SETUP shows embedding settings.

Call GET /api/knowledge/cron every minute with Authorization: Bearer plus the
KNOWLEDGE_CRON_SECRET. This processes one file, retries errors up to three times,
reclaims crashed leases after 20 minutes and prioritises deletions. Configure a
worker with enough duration for the document size; a serverless 300-second limit
may require a long-running self-hosted worker. One bad file does not block others.
Deletion immediately excludes the document from search and asynchronously removes
private storage plus cascading chunks/embeddings/jobs. Retry failed storage deletes.

Open /knowledge to upload multiple files, inspect progress/errors, search without
AI, ask with citations and preview a cited page/row in extracted text. Original files
download as attachments with no-store/nosniff. /admin/knowledge lists shared rights,
validity and refresh timestamps for signed-in organization owners.

POST /api/knowledge/ask: `{question, mode?, filters?: {documentTypes?,asOf?,currentOnly?,shipmentId?}, config?}`.
RRF merges PostgreSQL simple full-text (Arabic Unicode supported) and cosine
vectors. If embeddings are unreachable, lexical search remains available with a
warning. Undated data is excluded by current/as-of filters. FACT statements are
verbatim quotations validated against every cited chunk. Free-form INFERENCE
is fail-closed until a separately evaluated support verifier is available.
This sacrifices recall to avoid unsupported generated claims; it does not prove
that a selected quotation fully answers a complex question. NOT FOUND includes
the searched query/scopes/filters. Model-memory answers are prohibited.

Shared import: send multipart `file` and `metadata` to POST /api/knowledge/shared
with the deployment secret. Every file requires reviewed commercial-use metadata;
unknown licences are denied. `ml/scripts/import_knowledge.py` builds events and
sidecars; do not put customer files into knowledge/. Stale snapshots preserve
original dates when archived. Refresh ingestion explicitly after changing rights.
Snapshots mark knowledge_period as past/present; current-only search excludes
past. Their published_at is the compilation time of the normalized snapshot,
not an invented source publication date. Original event start/end dates remain
inside records. As-of queries conservatively exclude snapshots compiled later.
The queue worker automatically marks shared present snapshots older than 30 days
as past without changing dates. The importer moves local snapshots to past on
each refresh. Changing other metadata or rights requires delete/reimport.

Run `npm test -- src/lib/knowledge` and `npx tsc --noEmit`.
Live RLS tests run when DATABASE_URL is set and otherwise visibly skip. They use
transactional fixtures and rollback; they test crafted SQL/vector searches, shared
visibility, cross-tenant writes/FKs, viewer permissions and deletion cascades.

Without a configured native PostgreSQL, `node db/test-isolated-rls.mjs` applies
every migration to disposable PostgreSQL WASM with real pgcrypto/pgvector and
runs those SQL isolation tests. Auth and Storage service schemas are test fixtures;
this does not test Supabase's HTTP storage API or concurrent worker locks. It
never reads or modifies the production database configuration. With the local
embedding endpoint and KNOWLEDGE_PYTHON configured, append
`src/lib/knowledge/pipeline.integration.test.ts` to exercise uploads, extraction,
real embeddings, retrieval, deduplication and deletion on synthetic files.
