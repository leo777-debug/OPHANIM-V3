# Run the trained adapter locally

The completed CPT adapter remains at
`D:\models\adapters\cpt-20261013-172004`. It needs the existing base model at
`D:\models\base\Qwen--Qwen3-4B-Instruct-2507`. Keep both folders on the external
disk. The adapter is experimental and failed production acceptance; this preview
does not merge weights, register an Ollama release or change Ophanim AI SETUP.

## Terminal preview

The CPU runner is installed at `D:\models\tools\adapter-chat-20261014`, with
its three source files registered by checksum in the external-drive manifest.
The repository source is `ml/scripts/chat_adapter.py`; the installed copy uses
the same model-store and base-verification helpers. Keeping the runner on D:
also avoids OneDrive hydration delays for Python source/cache files.

Connect Leonard External Drive, open **PowerShell**, and paste:

```powershell
$env:OPHANIM_MODELS_DIR='D:\models'
$env:PYTHONUTF8='1'
& 'D:\models\tools\ophanim-venv\Scripts\python.exe' 'D:\models\tools\adapter-chat-20261014\chat_adapter.py'
```

Run this from any folder. Startup can take several minutes. Wait for **Ready**, then enter a question with source
context on one line, for example:

```text
Context [demo]: Shipment DEMO contains 48 cartons. Question: How many cartons does shipment DEMO contain? Cite demo.
```

Use `/exit` or Ctrl+C to stop. Each question is independent. No automatic retrieval
or company-file access is provided by this terminal preview. Documents and answers
are not saved or sent to an external service. Missing context should produce
NOT FOUND; model errors are still possible. Full-precision CPU loading needs at
least 20 GiB available RAM and is slower than the base GGUF. Startup verifies the
adapter and approximately 8 GB of base weights, then loads about 16 GB of float32
weights into RAM. A missing drive, bad checksum or base-revision mismatch stops
the runner; it never downloads replacement models.

For a single prompt or general-mode preview:

```powershell
& 'D:\models\tools\ophanim-venv\Scripts\python.exe' 'D:\models\tools\adapter-chat-20261014\chat_adapter.py' --mode general --prompt 'Context [demo]: A storm closed a fictional port today. Question: Summarise the incident and cite demo.' --max-new-tokens 128
```

Output limits are 1–512 tokens, default 128. The preview limits input plus output
to 4,096 tokens. `--task` sets the task tag; `--mode` selects logistics or general.
This interactive test is not a benchmark or a production-quality endorsement.

On 14 October the real base plus CPT adapter loaded on the founder's CPU and
generated four tokens in 48.18 seconds including prefill for one synthetic
context/question. This is a bounded smoke test, not a standalone generation-speed
benchmark or a completed-answer quality test. Full-precision CPU preview can be
slow; the existing quantized base remains preferable for normal app use.

## Ophanim and Ollama

For company questions, use Ophanim's **Knowledge** page and its configured
base/external model with RAG. The terminal preview does not provide an API URL
for AI SETUP. Ollama requires a compatible GGUF model; the adapter safetensors
file cannot be imported as the complete model. The existing `build_model.py`
requires a passing held-out evaluation before merging and creating a trained
GGUF/Ollama release. That gate remains false for this version. Keep the
experimental folder for future review/resume; keep base + RAG as the default.

See [eval/CPT_REPORT.md](eval/CPT_REPORT.md) for the completed evaluation and
[TRAINING_RUNBOOK.md](TRAINING_RUNBOOK.md) for deployment instructions after a
future accepted version exists.
