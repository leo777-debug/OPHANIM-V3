"""Reproduce a readable CPT report from verified outputs; never run or tune models."""
import argparse
import json
import sys
from pathlib import Path

from model_store import root, inside, verify, checksum

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'eval'))
from compare import aggregate, gate, score


def pct(value):
    return 'N/A' if value is None else f'{100 * value:.2f}%'


def pair(base, adapted, key):
    return f'{pct(base.get(key))} / {pct(adapted.get(key))}'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--version', required=True)
    parser.add_argument('--dataset', required=True)
    parser.add_argument('--corpus', required=True)
    parser.add_argument('--report', default=str(Path(__file__).resolve().parents[1] / 'eval' / 'CPT_REPORT.md'))
    args = parser.parse_args()
    store = root(10 * 1024**2)
    print('Verifying imported artifacts and provenance...', flush=True)
    adapter = inside(store, f'adapters/{args.version}')
    files = [f for f in adapter.rglob('*') if f.is_file()]
    for file in files:
        verify(store, file.relative_to(store).as_posix())
    producer = json.loads((adapter / 'checksums.json').read_text(encoding='utf-8'))
    assert set(producer) == {f.relative_to(adapter).as_posix() for f in files if f.name != 'checksums.json'}
    for name, expected in producer.items():
        assert checksum(inside(store, f'adapters/{args.version}/{name}')) == expected
    comparison = json.loads((adapter / 'comparison.json').read_text(encoding='utf-8'))
    run = json.loads((adapter / 'run_metrics.json').read_text(encoding='utf-8'))
    provenance = json.loads((adapter / 'base_revision.json').read_text(encoding='utf-8'))
    test_file = Path(args.dataset) / 'test.jsonl'
    assert checksum(test_file) == comparison['dataset_sha256']
    assert comparison['adapter_version'] == args.version and comparison['base_revision'] == provenance
    for split, expected in provenance['corpus_sha256'].items():
        assert checksum(Path(args.corpus) / f'{split}.jsonl') == expected
    assert run['full_training_completed'] is True and run['smoke_only'] is False
    rows = [json.loads(line) for line in test_file.read_text(encoding='utf-8').splitlines()]
    truth = {r['id']: r for r in rows}
    results = {}
    print('Rechecking saved prediction scores against the frozen test set...', flush=True)
    for model in ('base', 'continued-pretrained'):
        values = json.loads((adapter / f'{model}-heldout-predictions.json').read_text(encoding='utf-8'))
        assert len(values) == len(rows) == len({v['id'] for v in values})
        assert {v['id'] for v in values} == set(truth)
        for value in values:
            assert value['metrics'] == score(truth[value['id']], value['output'])
        results[model] = values
    assert comparison['accepted'] == gate(comparison['models']['base'], comparison['models']['continued-pretrained'])
    weight = adapter / 'adapter_model.safetensors'
    lines = [
        '# Continued-pretraining evaluation — Kaggle version 3', '',
        '**Not accepted for release.** Real continued pretraining completed on 13 October 2026; '
        'outputs were downloaded and verified on 14 October. This is causal next-token training '
        'of existing Qwen weights through a QLoRA adapter, not supervised task training or training from scratch.', '',
        f'Adapter: `{weight}` ({weight.stat().st_size:,} bytes). Requires the verified base '
        f'`{store / "base" / "Qwen--Qwen3-4B-Instruct-2507"}`. No merged model, trained GGUF or Ollama release was created.', '',
        f'Adapter SHA-256: `{checksum(weight)}`. All {len(files)} imported files match the disk manifest; '
        'all producer checksums, evaluation IDs, saved scores, corpus hashes and local test-set hash were checked.', '',
        '[Private training notebook](https://www.kaggle.com/code/leonardvk/ophanim-continued-pretraining) '
        f'version 3; adapter version `{args.version}`. Base revision `{provenance["revision"]}`. '
        f'Task test SHA-256 `{comparison["dataset_sha256"]}`.', '',
        '## Training and data', '',
        f'Tesla T4, one 16 GB GPU, fp16/NF4, seed 42, rank-8 adapter (5,898,240 trainable parameters). '
        f'One epoch, {run["optimizer_steps"]} optimizer steps, {run["tokens_trained"]:,} tokens; '
        f'{run["elapsed_s"]:.2f} seconds including loading/validation after download, '
        f'{run["train_runtime"]:.2f} seconds training loop, {run["peak_cuda_gib"]:.2f} GiB peak allocated CUDA memory. '
        f'Training loss {run["train_loss"]:.6f}; validation loss '
        f'{run["initial_eval_loss"]:.6f} → {run["eval_loss"]:.6f}. Adapter update L2 {run["adapter_update_l2"]:.6f}.', '',
        'Free Kaggle GPU; no paid instance rented. The output records cost_usd=null, not a billed-cost measurement. '
        'Account quota after the job showed 1.43 hours used / 28.57 remaining; this includes setup and evaluation, '
        'and the earlier failed setup run. Training alone took about 6 minutes 26 seconds.', '',
        'CPT corpus: 1,440 synthetic MIT passages (1,200 train / 120 validation / 120 test), '
        '400 training passages per English/Arabic/mixed language and 600 per mode. '
        'Only six templates per mode/language: a small procedural starter corpus with overlapping subjects, '
        'not a diverse production corpus. No teacher outputs, customer files or changing real-world facts. '
        'Separate task fixtures: 2,880 MIT examples; 2,400 train / 240 validation / 240 test. '
        'Task training/validation fixtures were not used for CPT. Test: 86 English, 85 Arabic, 69 mixed, '
        '120 per mode; no test example was used for training or tuning.', '',
        '## Release decision', '',
        'Extraction field exact match tied at 99.38%; valid JSON regressed 94.17% → 93.33% '
        '(226/240 → 224/240); NOT FOUND tied at 8/8. General Arabic JSON fell 90.48% → 88.10%, '
        'and general mixed JSON fell 97.22% → 94.44%. The required strict improvements were not achieved. '
        'The unchanged unsupported-answer proxy was 23/31 (74.19%). Keep base + RAG. '
        'Lower held-out perplexity is evidence of language-loss improvement, not task acceptance. '
        'The held-out set must not be used to tune another run. '
        'The export preflight was exercised against this comparison and refused it before model loading or merging.', '',
        '## Task metrics', '',
        'Every paired cell is **base / continued-pretrained**. N/A means no eligible cases. '
        'Larger configured model: unavailable / not run for every metric. Extraction F1 is calculated '
        'only on extraction tasks; all-task field scores include mechanical targets for open-ended text.', '',
        '| Group | Rows | JSON | Schema | Extraction exact | Extraction F1 | All-task field exact | All-task field F1 | Exact output | Classification |',
        '| --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- |',
    ]
    groups = {'all': rows}
    for mode in ('logistics', 'general'):
        for lang in ('en', 'ar', 'mixed'):
            groups[f'{mode}/{lang}'] = [r for r in rows if r['mode'] == mode and r['language'] == lang]
    for group, subset in groups.items():
        ids = {r['id'] for r in subset}
        metrics = [comparison['models'][m][group] for m in results]
        extracts = [aggregate([r for r in results[m] if r['id'] in ids and r['task'].startswith('extract_')]) for m in results]
        cells = [pair(*metrics, k) for k in ('valid_json', 'schema_valid', 'extraction_field_exact')]
        cells += [pair(*extracts, 'field_f1')]
        cells += [pair(*metrics, k) for k in ('field_exact', 'field_f1', 'exact_match', 'classification_correct')]
        lines.append(f'| {group} | {len(subset)} | ' + ' | '.join(cells) + ' |')
    lines += ['', '## Grounded QA and speed', '',
        'QA answer accuracy is exact target matching on answerable questions and NOT FOUND detection on '
        'unanswerable questions. Citation correctness requires known chunk IDs and a verbatim quote with text=quote. '
        'The hallucination column is a **contract/unsupported-answer proxy**, including malformed JSON and missing '
        'quotes; it is not a human-assessed rate of fabricated facts. Neither model passed an answerable QA citation '
        'case (0/23); unanswerable detection was 8/8. One inspected Arabic output had an empty quote and a trailing '
        'JSON quotation mark. Semantic summaries, forecasts and Arabic fluency require independent human review.', '',
        'GPU throughput is generated tokens / generation-call elapsed time including prefill, measured sequentially '
        'with eager attention/NF4 and an unmerged adapter. It is not CPU speed, an optimized-server benchmark, '
        'or evidence that merging would have the same overhead.', '',
        '| Group | QA cases | Unanswerable | Answer | Citations | NOT FOUND | Unsupported proxy | GPU latency seconds | GPU tokens/s |',
        '| --- | ---: | ---: | --- | --- | --- | --- | --- | --- |']
    for group, subset in groups.items():
        qa = [r for r in subset if r['task'] == 'grounded_qa']
        metrics = [comparison['models'][m][group] for m in results]
        cells = [pair(*metrics, k) for k in ('answer_correct', 'citation_correct', 'not_found_correct', 'hallucination')]
        cells += [f'{metrics[0][k]:.2f} / {metrics[1][k]:.2f}' for k in ('latency_s', 'tokens_s')]
        lines.append(f'| {group} | {len(qa)} | {sum(r["unanswerable"] for r in qa)} | ' + ' | '.join(cells) + ' |')
    lines += ['', 'CPU Q4_K_M base: 4.51 tokens/s (4 threads), 4.45 (8 threads). '
        'UHD 620 Vulkan: 3.90 tokens/s, about 13.5% slower. The founder\'s i5-8350U has four physical '
        'cores/eight threads and 40 GB RAM. The ≥8 tokens/s main-model target remains unmet. '
        'Adapted CPU speed is not measured because the failed release gate blocks merging/export.', '',
        '## Held-out corpus loss', '', '| Language | Predicted tokens | Base loss | CPT loss | Base perplexity | CPT perplexity |',
        '| --- | ---: | ---: | ---: | ---: | ---: |']
    for language in ('en', 'ar', 'mixed'):
        a, b = [comparison['heldout_corpus_perplexity'][m][language] for m in results]
        lines.append(f'| {language} | {a["predicted_tokens"]} | {a["loss"]:.6f} | {b["loss"]:.6f} | {a["perplexity"]:.4f} | {b["perplexity"]:.4f} |')
    lines += ['', '## Per-task and language metrics', '',
        '| Task | Language | Rows | JSON | Schema | Field exact | Field F1 | Exact output |',
        '| --- | --- | ---: | --- | --- | --- | --- | --- |']
    for task, language in sorted({(r['task'], r['language']) for r in rows}):
        values = [[r for r in results[m] if r['task'] == task and r['language'] == language] for m in results]
        metrics = [aggregate(v) for v in values]
        cells = [pair(*metrics, k) for k in ('valid_json', 'schema_valid', 'field_exact', 'field_f1', 'exact_match')]
        lines.append(f'| {task} | {language} | {len(values[0])} | ' + ' | '.join(cells) + ' |')
    lines += ['', '## Classification confusion matrices', '',
        'Labels are compared exactly against fixed schema enums; uppercase prose labels are failures. '
        'Both models produced the same matrix. Small class counts limit conclusions.', '',
        '| Group | Gold → predicted | Count, base / CPT |', '| --- | --- | ---: |']
    for group in groups:
        matrices = [comparison['models'][m][group]['confusion_matrix'] for m in results]
        for label in sorted(set(matrices[0]) | set(matrices[1])):
            lines.append(f'| {group} | {label} | {matrices[0].get(label, 0)} / {matrices[1].get(label, 0)} |')
    lines += ['', f'Raw predictions, producer checksums, training logs and comparison: `{adapter}`. '
        'The weights and fixture datasets are external-drive artifacts, never committed.', '',
        'Rebuild this report without another model run:', '', '```powershell',
        r'& D:\models\tools\ophanim-venv\Scripts\python.exe ml/scripts/report_cpt.py `',
        f'  --version {args.version} `',
        f'  --dataset "{args.dataset}" `', f'  --corpus "{args.corpus}"', '```', '']
    Path(args.report).write_text('\n'.join(lines), encoding='utf-8')
    print(json.dumps({'verified_files': len(files), 'heldout_rows_per_model': len(rows),
                      'accepted': comparison['accepted'], 'adapter_sha256': checksum(weight), 'report': args.report}))


if __name__ == '__main__':
    main()
