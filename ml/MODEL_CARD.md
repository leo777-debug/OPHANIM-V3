# Ophanim Logistics model card

Status: development, base model + prompts. No fine-tuned release. A three-step
CPU LoRA smoke run used a tiny random test fixture, not the 4B base model. Real
measurements are in FINAL_REPORT.md and eval/REPORT.md. The provisional 4B model
fails the founder's 8 tokens/second CPU gate and the initial grounded-QA evaluation.

Base: Qwen/Qwen3-4B-Instruct-2507, [Apache-2.0 licence](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507/blob/main/LICENSE).
Commercial use and modification are allowed; preserve licence, notices and
copyright, mark modifications; no trademark grant. Backup Phi-4-mini-instruct
uses [MIT](https://huggingface.co/microsoft/Phi-4-mini-instruct/blob/main/LICENSE).
Embedding Qwen3-Embedding-0.6B uses
[Apache-2.0](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B).

One adapter covers `[mode: logistics]` and `[mode: general]` task tags. Intended
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
