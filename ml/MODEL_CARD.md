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
broader held-out evaluation and full GPU training have not run.

On 13 October Kaggle version 3 was submitted for full CPT and held-out evaluation.
Version 2 allocated a Tesla T4 but failed the original disk preflight before any
optimizer step. The retry uses actual download sizes plus adapter checkpoint
headroom and pins the input bundle hash. Submission is not training completion;
no accepted GPU-trained model is claimed until results are available.

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
rebuild instructions and release gates. Keep the previous accepted version.
