# Ophanim Logistics model card

Status: development, base model + prompts. No accepted trained release. The
founder selected continued pretraining (unlabelled next-token loss) rather than
supervised task training. `pretrain.py` uses the existing 4B weights with a QLoRA
adapter on GPU. The real-base CPU test completed two optimizer steps on 64 tokens
on 11 October 2026, saving a 23.6 MB adapter at
`D:\models\adapters\cpt-cpu-smoke-20261011-real4b`. It has 5,898,240 trainable
parameters, elapsed 104.88 seconds, training loss 5.4368, tiny validation loss
5.4578 → 5.4547, and adapter update L2 0.0217449. This proves the training path,
not useful task improvement; `smoke_only: true` prevents release. An older three-step
CPU LoRA smoke run used a tiny random test fixture, not the 4B base model. Real
measurements are in FINAL_REPORT.md and eval/REPORT.md. The provisional 4B model
fails the founder's 8 tokens/second CPU gate and the initial 50-case grounded-QA
evaluation. Three subsequent live RAG cases passed with valid evidence/refusal;
the completed held-out comparison below still fails the release gate.

On 13 October Kaggle version 3 completed CPT on a Tesla T4: 18 optimizer steps,
144,876 tokens, 385.93 seconds elapsed and 5.11 GiB peak allocated GPU memory.
Validation loss improved 2.303625 → 2.280127 and perplexity 10.0104 → 9.7779;
adapter parameter update L2 was 0.170264. The adapter is
`cpt-20261013-172004`, downloaded with verified producer checksums to
`D:\models\adapters\cpt-20261013-172004` on 14 October. The 23,631,240-byte
adapter requires the existing base weights; it is not a standalone model.
Both base and adapter completed 240 held-out task cases. Extraction field exact
tied at 99.38%, valid JSON regressed 94.17% → 93.33%, NOT FOUND tied at 8/8,
and unsupported/contract-failure proxy tied at 23/31. General Arabic and mixed
JSON/schema scores regressed. English task metrics did not improve. Held-out
corpus perplexity improved in every language but does not establish task quality.
**Not accepted:** keep base + RAG; no merged/GGUF/Ollama trained release is built.
See [eval/CPT_REPORT.md](eval/CPT_REPORT.md) for per-language/mode/task results,
GPU speed, confusion matrices, checksum and the report rebuild command. Larger
model and adapted CPU scores were not measured; semantic human review remains.
Version 2 allocated a Tesla T4 but failed the original disk preflight before any
optimizer step. The retry uses actual download sizes plus adapter checkpoint
headroom and pins the input bundle hash. Version 3 proves actual training and
fit on one 16 GB T4 for this small synthetic corpus, not production acceptance.

Base: Qwen/Qwen3-4B-Instruct-2507, [Apache-2.0 licence](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507/blob/main/LICENSE).
Commercial use and modification are allowed; preserve licence, notices and
copyright, mark modifications; no trademark grant. Backup Phi-4-mini-instruct
uses [MIT](https://huggingface.co/microsoft/Phi-4-mini-instruct/blob/main/LICENSE).
Embedding Qwen3-Embedding-0.6B uses
[Apache-2.0](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B).

One adapter covers both modes. CPT passages carry mode/domain tags; supervised
task prompts retain `[mode: logistics]` and `[mode: general]` task tags. Intended
use: document extraction, email understanding, classification, grounded QA,
public claim parsing, mistake explanations, incident summaries, cautious
forecasts and watch parsing for logistics/business risk. Rules decide; AI reads
and explains. No targeting or individual tracking.

Training source: generated synthetic templates under this repository's MIT
licence. No teacher model is used; no commercial API output is used for training.
No customer data, even uploaded RAG files, is included. Written consent and
redaction are required for any future real-document training (consent register).
Shared-source training requires licence-specific review, independent of indexing.

Not a source of facts: always use RAG. Small models can misread OCR, handwriting,
mixed scripts, tables and dates. Arabic and English must be evaluated separately.
Prompt filtering is defence in depth, not a guarantee that arbitrary generated
claims are supported. Grounded QA uses a conservative quote validation gate.

Artifacts live exclusively in OPHANIM_MODELS_DIR (Windows default D:\models).
See MODEL_SELECTION.md, TRAINING_RUNBOOK.md and eval/REPORT.md for evidence,
rebuild instructions and release gates; eval/CPT_REPORT.md records the completed
GPU comparison. Keep previous versions, including this experimental adapter.
