# Ophanim model and knowledge implementation — 11 October 2026

The founder selected **continued pretraining of an existing model**, using causal
next-token loss on unlabelled domain text. The real Qwen 4B model completed a bounded
CPU training test and saved an adapter. **No accepted production model is released.**
The full GPU run needs a signed-in Kaggle account with an available accelerator;
the browser was signed out and no Kaggle API credentials were available. This
machine has no NVIDIA GPU. The founder's CPU also fails the main-model speed gate.
RAG ingestion, multilingual retrieval, actual SQL tenant isolation and three live
grounded-answer tests now pass. These small synthetic tests do not establish
competition readiness. Customer uploads are never training inputs.

## Where the model is

The actual test adapter is
`D:\models\adapters\cpt-cpu-smoke-20261011-real4b\adapter_model.safetensors`
(23,631,240 bytes). Its `run_metrics.json` records two optimizer steps, 64 training
tokens, nonzero adapter updates and `smoke_only: true`. This is training of the
chosen existing model, but only a pipeline test; it is not a useful trained release
or a standalone model. It requires the base weights. Full-model merging and release
are deliberately blocked until a completed GPU run passes the held-out gates.

Verified base weights are in `D:\models\base\Qwen--Qwen3-4B-Instruct-2507`,
revision `cdbee75f17c01a7cc42f958dc650907174af0554` (~8.045 GB). The base CPU GGUF
is under `D:\models\gguf\unsloth--Qwen3-4B-Instruct-2507-GGUF`. Embedding weights
are in `D:\models\embeddings\Qwen--Qwen3-Embedding-0.6B`, revision
`97b0c614be4d77ee51c0cef4e5f07c00f9eb65b3` (~1.192 GB). Downloads were checked
against upstream checksums and registered in `D:\models\manifest.json`. All weights,
caches, datasets and adapters stay on the external drive; existing unrelated files
were preserved.

## Model choice and measured hardware

Provisional main: Qwen3-4B-Instruct-2507, Apache-2.0. Backup: Phi-4-mini-instruct,
MIT. The complete candidate score table, newer Qwen3.5 comparison and licence links
are in [MODEL_SELECTION.md](MODEL_SELECTION.md); restrictions and intended use are
in [MODEL_CARD.md](MODEL_CARD.md). Only the provisional Qwen3 was benchmarked and
evaluated. Other candidates' CPU speed and task scores remain unmeasured. Newer
Gemma 4 E4B/E2B were checked but exceed the total-parameter cap despite their names.
Embeddings: Qwen3-Embedding-0.6B, Apache-2.0, multilingual, 1,024 dimensions;
downloaded, checksum-verified and served on CPU for the real retrieval tests.

Hardware: Intel i5-8350U, four physical cores/eight threads, Intel UHD 620, Windows,
40 GB RAM as supplied by the founder. This is not an eight-core CPU. Quantization:
Q4_K_M, 2,491,323,904 bytes, official llama.cpp Windows Vulkan build b11541.
Benchmark: 128 prompt tokens, 64 generation tokens, two repeats, short context.

| Backend | Threads | Generation tokens/s | Prefill tokens/s |
| --- | ---: | ---: | ---: |
| CPU | 4 | 4.51 | 11.21 |
| CPU | 8 | 4.45 | 11.51 |
| Vulkan full offload, UHD 620 | 4 | 3.90 | 10.91 |

Vulkan detected the integrated GPU but was approximately 13.5% slower. **The
required ≥8 generation tokens/s gate failed.** No claim is made about cold-load
time, longer context, GPU generation speed or another CPU. Raw measurements and
logs are in D:\models\eval. A temporary loopback llama-server was used only for
synthetic evaluation and stopped afterwards; no permanent model daemon was installed.

## RAG implementation and verification

Private company files reuse Supabase private storage or an explicitly configured
private filesystem. Documents/chunks/embeddings/jobs and organization embedding
settings have additive schema and RLS. Application transactions drop to a restricted
database role. Composite tenant foreign keys prevent linking a chunk to another
company's document, including shared/null scopes. Hybrid full-text/vector search
uses reciprocal rank fusion and date/type/shipment filters. Shared-source licensing
is checked before import; current-only searches exclude historical snapshots.

The Postgres queue provides progress, bounded retries, crash-lease recovery,
deduplication and asynchronous deletion cascades. Docker's optional profile includes
a private OCR extractor and queue scheduler. Knowledge UI provides multiple uploads,
status/errors, storage usage, search, questions, source previews and deletion. Shared
administration lists sources, licence links, dates and refresh status; publishing
requires the deployment secret, not just a company-owner login.

| Input | Implemented | Verification here |
| --- | --- | --- |
| Text PDF | pypdf, page references | Fixture passed |
| Scanned PDF, JPG/PNG | PDFium/Pillow + Tesseract eng/ara | Not run; host Tesseract absent |
| DOCX | Paragraphs/headings/tables | Table/reference fixture passed |
| XLSX/CSV | Sheets/row ranges/header retention | Fixtures passed |
| TXT/MD | Text/headings | English/Arabic fixtures passed |
| EML | Plain-text message parts | Fixture passed; HTML-only requires text export |
| MSG | Excluded | No reviewed permissive parser integrated |
| JSON/JSONL | Normalized shared-event text | Supported; per-event temporal retrieval needs further evaluation |

CSV extraction: 1,000 rows, 18,022 bytes, 0.330 seconds (~3,029 rows/s), **extraction
only**. A subsequent end-to-end test executed real Python extraction, CPU Qwen
embeddings, production application transactions, PostgreSQL SQL/RLS and pgvector.
Five readable synthetic text files became ready in 5.774 seconds (~52 files/minute);
one damaged PDF failed independently and remained queued for bounded retry. This
measures tiny fixtures, not throughput for large PDFs, OCR or spreadsheets. Arabic
ingestion exposed Windows CP1252 output errors; extraction now explicitly uses UTF-8.
The live test also exposed and fixed a vector SQL placeholder/type-binding error.

Six English/Arabic/cross-language/time-aware retrieval questions all found the
expected source in the top three results: recall@3 100%, mean reciprocal rank
0.917. Query latency was 0.406–0.462 seconds. Date filters, hash deduplication and
chunk/embedding deletion cascades passed. Raw results are in
`D:\models\eval\rag-pipeline-report.json`.

All **37 real migrations** were applied to a disposable PGlite PostgreSQL engine
with real pgvector and Supabase auth/storage schema fixtures. Executed tests showed
that A sees A + shared data, cannot read B through raw/lexical/vector crafted queries
or an invented organization setting, cannot write cross-tenant foreign keys, and
that viewers cannot write. Authenticated JWT membership and deletion cascades passed.
This is an executed isolation proof for the migrated SQL, not a native Supabase
deployment test. Production migrations, private Storage HTTP, authentication browser
flows and concurrent worker leases still require deployment verification. No production
database was changed. The ordinary suite skips database tests without DATABASE_URL;
`node db/test-isolated-rls.mjs` explicitly provisions the disposable test engine.

Injection tests passed for English/Arabic commands, role delimiters and secret
exfiltration instructions. Answer validation passed exact supporting quotations and
rejected fabricated company citations, unsupported text and free-form inferences.
The real local 4B model also passed three route tests over an ingested malicious
document: English question with a cited FACT, Arabic question with a cited FACT,
and an unsupported password question with canonical NOT FOUND. Known English/Arabic
instructions were stripped, no secret marker was emitted, and no grounding warning
occurred. Latencies were 97.24, 64.84 and 54.27 seconds respectively. The Arabic
question received an English verbatim quotation, so Arabic answer-language quality
is not established. Authentication actor acquisition was mocked; SQL/RLS, retrieval,
embeddings and generation were real. This proves these cases, not resistance to
arbitrary semantic injection or broad answer quality.
FACT is accepted only with matching verbatim quotations and known citations. Unsupported
output becomes NOT FOUND with the searched question/scopes/filters. INFERENCE is
currently rejected conservatively; relevance of a quotation to complex questions still
needs human evaluation. No reranker was added without retrieval evidence.

Source adapters normalize events and support nearest-port/airport lookup with a
separately licence-cleared gazetteer. Without that gazetteer, nearest lists are empty;
unknown coordinates stay null. USGS, GDELT metadata and Wikidata structured facts are
enabled with recorded rights. UCDP GED 26.1 is enabled under CC BY 4.0 with the
publisher's required publication attribution, verified at [UCDP downloads](https://ucdp.uu.se/downloads/).
NOAA IBTrACS, EONET, GDACS and ReliefWeb need
specific source/version rights review. EM-DAT/ACLED remain excluded pending commercial
licences; Wikipedia text remains disabled pending share-alike review. Ophanim provider
snapshots must inherit their providers' rights. No large source dataset was committed
or indexed. Suez/Red Sea/cyclone/port case-study curation remains outstanding.

## Dataset

Continued-pretraining version `cpt-v1-2026-10-10` contains **1,440 unlabelled MIT
synthetic passages**: train 1,200, validation 120, test 120. Each split balances both
modes and English/Arabic/mixed languages equally. Training has 400 passages per
language and 600 per mode (~499,630 characters). Its six procedural passage
templates per mode/language overlap in subject matter across splits. Exact hashes
are disjoint, but this is a small starter corpus, not an independent generalisation
benchmark or a sufficient production domain corpus. No current operational facts,
customer files, teacher output or real-event snapshots are training inputs. Expand
and review diverse licence-cleared domain text before expecting useful CPT gains.
The task fixtures below remain separate; CPT never uses their answer targets.

Version v3-2026-10-10: **2,880 synthetic MIT examples**, no teacher model/API,
customer documents or personal data. Train 2,400, validation 240, held-out test 240;
each split balances both modes. Train EN/AR/mixed: 809/799/792; validation and test
each: 86/85/69. QA unanswerable rates: train 78/309 (25.2%); validation/test each
8/31 (25.8%). Split deduplication, target-schema checks and container check digits
passed. Counts across all splits:

| Task | English | Arabic | Mixed |
| --- | ---: | ---: | ---: |
| AWB extraction | 45 | 45 | 42 |
| Bill of lading extraction | 45 | 44 | 42 |
| Invoice extraction | 45 | 44 | 42 |
| Packing list extraction | 45 | 44 | 42 |
| Booking confirmation extraction | 45 | 44 | 42 |
| Arrival notice extraction | 45 | 44 | 42 |
| Delivery order extraction | 45 | 44 | 42 |
| Email understanding | 45 | 44 | 42 |
| Document classification | 45 | 44 | 42 |
| Grounded QA, both modes | 126 | 125 | 120 |
| Mistake explanation | 45 | 42 | 42 |
| Claim parsing | 81 | 81 | 78 |
| Incident flagging | 81 | 81 | 78 |
| Event summary | 81 | 81 | 78 |
| Cautious forecast | 81 | 81 | 78 |
| Watch parsing | 81 | 81 | 78 |

v1 had an unanswerable sampling bug; v2 corrected it. v3 fixes nested array schemas
and uses the same QA schema irrespective of answerability. Earlier versions remain
on D: for provenance and must not be selected for training. See [DATA_CARD.md](DATA_CARD.md)
and the empty consent register. This starter corpus has narrow routes/events and
limited OCR variation; it is not evidence of production robustness.

## Training and evaluation

The **real 4B continued-pretraining CPU smoke test completed** on Intel i5-8350U:
two optimizer steps, 64 tokens, rank-8 LoRA with 5,898,240 trainable parameters.
Training runtime was 55.50 seconds; load/train/evaluate/save elapsed 104.88 seconds
(checksum preflight excluded). Training loss 5.4368; tiny validation loss changed
from 5.4578 to 5.4547, perplexity 234.58 to 233.85. Measured adapter update L2 was
0.0217449. These tiny measurements establish actual weight updates only; they are
not held-out task quality or evidence of meaningful improvement. Direct compute
charge was $0. Frozen weights used fp16 storage and fp32 linear arithmetic on CPU;
trainable adapter gradients were checked against reference arithmetic. A previous
native-fp16 attempt was stopped before any observed optimizer completion and has
an `aborted_run.json`, not a claimed trained adapter.

The earlier three-step **random toy fixture** remains separate: 38,592 parameters,
3,584 trainable, loss 5.4486, evaluation loss 5.4472, elapsed 0.759 seconds. Neither
smoke adapter can be released. There is no NVIDIA GPU here. Full training time,
peak VRAM, Kaggle cost and GPU quality/speed remain unknown. The new CPT notebook,
time-based checkpoint/resume workflow, pinned fp16/NF4 QLoRA configuration and cloud
backup script are supplied. One 16 GB GPU and completion within 12 hours still
require an actual run. The runbook preserves the original after-competition schedule;
the full job cannot start without Kaggle account access.

50 validation examples were generated by the quantized **base** model. All requests
completed. Historical v2 compact prompts omitted nested array descriptors; saved
outputs were rescored against corrected v3 schemas. This is not a fresh run of the
improved prompts. The evaluator also fixed a vacuous NOT FOUND check. Original raw
predictions remain on D:. Full mechanical metrics and confusion matrices are in
[eval/REPORT.md](eval/REPORT.md).

| Base evaluation group | Rows | Valid JSON | Schema valid | All-task field exact / F1 | Extraction field exact | Class accuracy |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| All | 50 | 100% | 68.0% | 51.1% / 51.9% | 99.3% | 2/3 |
| Logistics / EN | 11 | 100% | 81.8% | 68.2% / 68.2% | 100% | 1/1 |
| Logistics / AR | 11 | 100% | 81.8% | 74.1% / 75.8% | 100% | 1/1 |
| Logistics / mixed | 11 | 100% | 81.8% | 64.6% / 65.4% | 98.0% | 0/1 |
| General / EN | 6 | 100% | 33.3% | 12.2% / 12.6% | N/A | N/A |
| General / AR | 6 | 100% | 50.0% | 13.6% / 15.4% | N/A | N/A |
| General / mixed | 5 | 100% | 40.0% | 24.7% / 25.1% | N/A | N/A |

Grounded QA: answer-contract accuracy 0/5; supported-citation accuracy 0/5;
correct NOT FOUND 0/2. All five failed the conservative grounding contract
(reported hallucination-risk rate 100%). **This counts malformed/unsupported
answers as failures; it does not mean all five fabricated factual content.** There
was one QA example per EN/AR/mixed logistics group, one per EN/AR general group,
none in general/mixed. This denominator is too small for reliable estimates.
Overall request latency averaged 117.76 seconds with four requests queued concurrently;
throughput from response usage/latency averaged 0.715 tokens/s. Those values include
queue and prefill and are not the standalone 4.51 tokens/s generation benchmark.

Continued-pretrained production model: not available. Larger configured model: not evaluated. No held-out
test generation or semantic human review was done. Base vs tuned vs larger GPU/CPU
comparison is consequently incomplete; missing models receive no invented scores.
Release gate remains false. The subsequent three live RAG cases passed, but they
do not replace the historical 50-case evaluation or the untouched held-out comparison.
General-mode summaries, forecasts and Arabic quality need broader evaluation.

## Run and rebuild

1. Connect D: and follow [TRAINING_RUNBOOK.md](TRAINING_RUNBOOK.md) for the external
   Python environment, downloads, Windows environment variables and Kaggle bundle.
   All caches/weights/adapters/exports are under OPHANIM_MODELS_DIR. Existing untracked
   files are preserved; registered artifacts carry SHA-256, size, licence and version.
2. Configure DATABASE_URL, private storage, embedding endpoint/model and a worker
   secret in uncommitted .env; apply `node db/run-migrations.mjs`. Run the live RLS
   test before customer rollout. The local `embedding_server.py` serves verified
   external-drive weights at http://127.0.0.1:18081/v1 without automatic downloads.
   Use Qwen/Qwen3-Embedding-0.6B and allow that exact origin in AI_LOCAL_BASE_URLS.
   Native OCR requires Tesseract eng/ara; installation was blocked here.
3. Install Ollama separately; stop any existing daemon using a different cache,
   set OLLAMA_MODELS=D:\models\ollama, run `ollama serve`. Verify the GGUF with
   `ml/scripts/manage_models.py verify`, then `ollama create ophanim-logistics:base
   -f ml/Modelfile`. Explicitly install the embedding model on that daemon:
   `ollama pull qwen3-embedding:0.6b` (weights stay on D:). Embedding/Ollama blob
   integrity and an actual serving test remain unverified here.
4. Set OPHANIM_LOCAL_MODEL and OPHANIM_MODEL_FILE for the intended version.
   Allow the exact local origin in AI_LOCAL_BASE_URLS. In AI SETUP choose
   **Ophanim Logistics (local)**, select tasks, configure embeddings and test.
   Task model overrides use the configured endpoint. Missing disk/corrupt GGUF
   produces a clear status and configured fallback or no-AI mode. Disk verification
   plus a server model listing does not independently attest which file a remote
   daemon loaded; deploy the documented server under the administrator's control.
5. Docker alternative: `docker compose -f docker-compose.yml -f docker-compose.models.yml
   --profile local-models up --build -d`. The existing D: bind must exist; no weight
   pulls occur automatically. Inside containers, replace Modelfile FROM with the
   /models/gguf path before `ollama create`. Pull embeddings explicitly in the
   embedding container. Model/embedding services are CPU-only with loopback host
   ports; OCR/scheduler are private. Compose configuration passed validation;
   container builds/runtime were not tested: Docker Desktop failed to start its
   Ingest service because its `sailor-ingest.sock` file could not be accessed.
6. Open /knowledge, upload, inspect processing, search and ask with citations.
   Shared import and administration are described in [../docs/KNOWLEDGE.md](../docs/KNOWLEDGE.md).
   Full training/export must follow the acceptance gate; build_model rejects smoke,
   incomplete or unaccepted adapters. Keep previous versions for rollback.

## Remaining gates and founder decisions

Verification: production Next build, TypeScript, targeted TS/TSX lint and Compose
configuration validation passed. The AiAnalyst hydration/mode lint errors were fixed.
The app suite has 233 passing tests and five environment-dependent skips across
63 files; isolated SQL/RLS + real embedding/model tests
have four passing tests. Thirteen Python pipeline tests, Python compilation and
PowerShell syntax checks passed. This is not a repository-wide lint claim.

Sign in to a GPU-enabled Kaggle account to run the prepared CPT notebook and private
input bundle. Native PostgreSQL/Supabase private Storage, authenticated browser flows
and concurrent workers still need deployment tests. Fix Docker Desktop startup for
container runtime verification. Automatic approval review rejected the Windows OCR
installer action with **“blocked by policy”**; scanned-document OCR remains unverified.
Choose whether to evaluate a smaller 3B alternative or revise the ≥8 tokens/s target;
the current main model has not met it. Review source rights/gazetteer and curate
logistics-impact case studies. Evaluate improved prompts with real formatting and
human Arabic/summary/citation review before the 17 October demonstration. Afterwards,
run Kaggle 16 GB fit/time profiling, full continued pretraining and held-out comparison.
Full-model merging/quantization and Ollama installation are blocked on an accepted
adapter. Customer data remains RAG-only throughout.
