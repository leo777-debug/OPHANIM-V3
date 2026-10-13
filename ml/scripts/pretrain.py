"""Continue pretraining an existing model on unlabelled domain text.

The objective is causal next-token prediction, including the whole passage.
QLoRA limits trainable parameters to fit a 16 GB GPU. CPU smoke uses the real
base weights; it proves gradient updates, not production model quality.
"""
import argparse
import hashlib
import json
import math
import random
import time
from pathlib import Path
from model_store import root, inside, manifest, verify, register


def load_corpus(folder):
    splits = {}
    seen = set()
    for split in ('train', 'validation', 'test'):
        rows = [json.loads(line) for line in (Path(folder) / f'{split}.jsonl').read_text(encoding='utf-8').splitlines()]
        if not rows:
            raise RuntimeError(f'Empty {split} corpus')
        for row in rows:
            if row.get('split') != split or row.get('customer_data') is not False or row.get('source') != 'synthetic-template' or row.get('licence') != 'MIT':
                raise RuntimeError('Only reviewed synthetic MIT text is accepted; customer uploads are never corpus inputs')
            digest = hashlib.sha256(row['text'].encode()).hexdigest()
            if row.get('content_hash') != digest or digest in seen:
                raise RuntimeError('Corrupt passage, duplicate, or split leakage')
            seen.add(digest)
        modes = {m: sum(r['mode'] == m for r in rows) for m in ('logistics', 'general')}
        if not modes['logistics'] or modes['logistics'] != modes['general']:
            raise RuntimeError('Both modes must be balanced')
        splits[split] = rows
    return splits


def pack(rows, tokenizer, length):
    """Pack complete passages with EOS; pad only the final short block.

    No supervised completion or chat template is used. Model.forward shifts
    labels for causal loss. Masking is exclusively for padding in collate().
    """
    if length < 2:
        raise ValueError('Sequence length must be at least two')
    buffer = []
    blocks = []
    for row in rows:
        buffer.extend(tokenizer(row['text'], add_special_tokens=False)['input_ids'])
        buffer.append(tokenizer.eos_token_id)
        while len(buffer) >= length:
            blocks.append({'input_ids': buffer[:length]})
            buffer = buffer[length:]
    if len(buffer) > 1:
        blocks.append({'input_ids': buffer})
    return blocks


def verified_base(store, relative, model_id):
    folder = inside(store, relative)
    files = [p for p in folder.rglob('*') if p.is_file() and '.cache' not in p.parts]
    entries = {f['path']: f for f in manifest(store)['files']}
    if not files or not any(p.suffix == '.safetensors' for p in files):
        raise RuntimeError('Complete base weights missing; run download_base_models first')
    versions = set()
    for file in files:
        rel = file.relative_to(store).as_posix()
        verify(store, rel)
        if entries[rel]['name'] != model_id:
            raise RuntimeError('Base model provenance mismatch')
        versions.add(entries[rel]['version'])
    if len(versions) != 1:
        raise RuntimeError('Mixed base revisions')
    return folder, versions.pop()


def run(args):
    # QLoRA saves adapter/optimizer checkpoints, never full 4B checkpoints.
    # The base downloader separately reserves its actual missing file bytes.
    checkpoint_reserve = 1024**3 if args.cpu_smoke else 2 * 1024**3
    store = root(checkpoint_reserve)
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig, Trainer, TrainerCallback, TrainingArguments
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
    config = json.loads(Path(args.config).read_text())
    random.seed(config['seed']); torch.manual_seed(config['seed'])
    splits = load_corpus(args.corpus)
    output = inside(store, f'adapters/{args.version}')
    if output.exists() and not args.resume:
        raise RuntimeError('Adapter version exists; choose a new version or resume its checkpoint')
    if args.resume and not Path(args.resume).resolve().is_relative_to(output):
        raise RuntimeError('Resume checkpoint must belong to this version')
    # Refuse unavailable hardware before creating output directories.
    if not args.cpu_smoke and not torch.cuda.is_available():
        raise RuntimeError('Full continued pretraining requires the Kaggle NVIDIA GPU. Use --cpu-smoke for a bounded real-model test.')
    if args.cpu_smoke:
        if not 1 <= args.steps <= 5:
            raise ValueError('CPU smoke is limited to 1–5 optimizer steps')
        torch.set_num_threads(4)
        base, revision = verified_base(store, args.base, config['model_id'])
        source = str(base)
        kwargs = dict(local_files_only=True, torch_dtype=torch.float16, device_map='cpu')
        hardware = 'Intel CPU; real 4B base, fp16 frozen storage, fp32 linear arithmetic'
    else:
        free, total = torch.cuda.mem_get_info()
        if total < 14 * 1024**3:
            raise RuntimeError('A 16 GB-class GPU is required')
        # Resume the recorded revision, not whichever Hub main exists today.
        recorded = json.loads((output / 'base_revision.json').read_text()) if args.resume else None
        revision = args.revision or (recorded['revision'] if recorded else None)
        base = inside(store, args.base)
        if not base.exists() or not any(base.glob('*.safetensors')):
            from huggingface_hub import model_info
            from download_base_models import download
            revision = revision or model_info(config['model_id']).sha
            if args.base != f'base/{config["model_id"].replace("/", "--")}':
                raise RuntimeError('Download the selected base into its registered model folder first')
            download(config['model_id'], 'base', revision=revision, extra_required_bytes=checkpoint_reserve)
        base, installed_revision = verified_base(store, args.base, config['model_id'])
        if revision and installed_revision != revision:
            raise RuntimeError('Installed base differs from the requested/resume revision; existing weights are never overwritten')
        revision = installed_revision
        source = str(base)
        kwargs = dict(local_files_only=True, device_map={'': 0}, torch_dtype=torch.float16,
                      quantization_config=BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type='nf4', bnb_4bit_use_double_quant=True, bnb_4bit_compute_dtype=torch.float16))
        hardware = torch.cuda.get_device_name(0)
        print(json.dumps({'gpu': hardware, 'free_gib': free / 1024**3, 'total_gib': total / 1024**3, 'fp16': True, 'bf16': False}), flush=True)
    output.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    tokenizer = AutoTokenizer.from_pretrained(source, trust_remote_code=False, local_files_only=True)
    tokenizer.pad_token = tokenizer.eos_token
    length = 32 if args.cpu_smoke else config['max_length']
    rows = list(splits['train']); random.Random(config['seed']).shuffle(rows)
    train = pack(rows, tokenizer, length)
    validation = pack(splits['validation'], tokenizer, length)
    if args.cpu_smoke:
        # At most a few short sequences, including both modes, never test rows.
        sample = [next(r for r in rows if r['mode'] == m and r['language'] == lang) for m in ('logistics', 'general') for lang in ('en', 'ar')]
        train = [{'input_ids': tokenizer(r['text'], add_special_tokens=False)['input_ids'][:length-1] + [tokenizer.eos_token_id]} for r in sample]
        validation = [pack([next(r for r in splits['validation'] if r['mode'] == m)], tokenizer, length)[0] for m in ('logistics', 'general')]
    corpus_hashes = {s: hashlib.sha256((Path(args.corpus) / f'{s}.jsonl').read_bytes()).hexdigest() for s in splits}
    metadata = {'model': config['model_id'], 'revision': revision, 'seed': config['seed'], 'method': 'continued_pretraining', 'corpus_sha256': corpus_hashes}
    if args.resume and json.loads((output / 'base_revision.json').read_text()) != metadata:
        raise RuntimeError('Resume base revision or corpus changed')
    (output / 'base_revision.json').write_text(json.dumps(metadata, indent=2))
    print(f'Loading existing {config["model_id"]}; causal next-token objective; {len(train)} train blocks', flush=True)
    model = AutoModelForCausalLM.from_pretrained(source, trust_remote_code=False, attn_implementation='eager', **kwargs)
    if not args.cpu_smoke:
        model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)
    model.config.use_cache = False
    model = get_peft_model(model, LoraConfig(r=config['rank'], lora_alpha=config['alpha'], lora_dropout=config['dropout'], target_modules=config['target_modules'], task_type='CAUSAL_LM'))
    if args.cpu_smoke:
        from cpu_training import optimise_frozen_linears
        print(f'CPU fp32 arithmetic enabled for {optimise_frozen_linears(model)} frozen linear layers; adapter parameters remain trainable', flush=True)
    model.print_trainable_parameters()
    before = {n: p.detach().float().clone() for n, p in model.named_parameters() if p.requires_grad}

    def collate(batch):
        n = max(len(r['input_ids']) for r in batch)
        ids = torch.full((len(batch), n), tokenizer.pad_token_id, dtype=torch.long)
        labels = torch.full_like(ids, -100); mask = torch.zeros_like(ids)
        for i, row in enumerate(batch):
            size = len(row['input_ids']); ids[i, :size] = torch.tensor(row['input_ids']); labels[i, :size] = ids[i, :size]; mask[i, :size] = 1
        return {'input_ids': ids, 'labels': labels, 'attention_mask': mask}

    class Budget(TrainerCallback):
        last_save = time.monotonic()
        def on_step_end(self, arguments, state, control, **kwargs):
            elapsed = time.monotonic() - started
            if state.global_step == min(5, state.max_steps):
                estimate = elapsed / state.global_step * state.max_steps
                print(f'Estimated run: {estimate / 3600:.2f} h; session budget {config["session_budget_seconds"] / 3600:.2f} h', flush=True)
                if estimate > config['session_budget_seconds']:
                    control.should_save = True; control.should_training_stop = True
            if time.monotonic() - self.last_save >= config['save_every_seconds'] or elapsed >= config['session_budget_seconds']:
                control.should_save = True; self.last_save = time.monotonic()
            if elapsed >= config['session_budget_seconds']:
                control.should_training_stop = True
            return control

    arguments = TrainingArguments(output_dir=str(output), num_train_epochs=config['epochs'], max_steps=args.steps if args.cpu_smoke else -1,
                                  per_device_train_batch_size=1, per_device_eval_batch_size=1,
                                  gradient_accumulation_steps=1 if args.cpu_smoke else config['gradient_accumulation'],
                                  learning_rate=config['learning_rate'], seed=config['seed'], data_seed=config['seed'], use_cpu=args.cpu_smoke,
                                  fp16=not args.cpu_smoke, bf16=False, gradient_checkpointing=True,
                                  gradient_checkpointing_kwargs={'use_reentrant': False}, logging_steps=1 if args.cpu_smoke else 5,
                                  save_strategy='steps', save_steps=20, save_total_limit=3, eval_strategy='steps', eval_steps=20,
                                  report_to='none', optim='adamw_torch', dataloader_num_workers=0)
    trainer = Trainer(model=model, args=arguments, train_dataset=train, eval_dataset=validation, data_collator=collate,
                      processing_class=tokenizer, callbacks=[Budget()])
    initial = trainer.evaluate()
    trained = trainer.train(resume_from_checkpoint=args.resume or None)
    metrics = trainer.evaluate(); metrics.update(trained.metrics)
    delta = sum((p.detach().float().cpu() - before[n].cpu()).pow(2).sum().item() for n, p in model.named_parameters() if p.requires_grad) ** 0.5
    metrics.update(method='continued_pretraining', objective='causal_next_token_all_text', real_base_model=True,
                   smoke_only=args.cpu_smoke, full_training_completed=not args.cpu_smoke and trainer.state.global_step >= trainer.state.max_steps,
                   initial_eval_loss=initial['eval_loss'], initial_perplexity=math.exp(min(initial['eval_loss'], 50)),
                   final_perplexity=math.exp(min(metrics['eval_loss'], 50)), adapter_update_l2=delta,
                   optimizer_steps=trainer.state.global_step, elapsed_s=time.monotonic()-started, hardware=hardware,
                   corpus_sha256=corpus_hashes, cost_usd=0 if args.cpu_smoke else None,
                   tokens_trained=(sum(len(r['input_ids']) for r in train) if trainer.state.global_step >= trainer.state.max_steps else None) if not args.cpu_smoke else args.steps * length,
                   available_training_tokens=sum(len(r['input_ids']) for r in train))
    if not math.isfinite(metrics['eval_loss']) or not delta > 0:
        raise RuntimeError('Non-finite loss or no adapter update; run is invalid')
    if not args.cpu_smoke:
        metrics['peak_cuda_gib'] = torch.cuda.max_memory_allocated() / 1024**3
    trainer.save_model(str(output)); trainer.state.save_to_json(str(output / 'training_log.json'))
    (output / 'run_metrics.json').write_text(json.dumps(metrics, indent=2))
    for file in output.rglob('*'):
        if file.is_file():
            register(store, file, 'ophanim-cpt-smoke' if args.cpu_smoke else 'ophanim-logistics', args.version, config['model_id'], 'Apache-2.0', metrics)
    print(json.dumps(metrics, indent=2), flush=True)


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--config', default=str(Path(__file__).resolve().parents[1] / 'configs' / 'continued_pretraining.json'))
    p.add_argument('--corpus', required=True); p.add_argument('--version', required=True)
    p.add_argument('--base', default='base/Qwen--Qwen3-4B-Instruct-2507')
    p.add_argument('--revision'); p.add_argument('--resume'); p.add_argument('--cpu-smoke', action='store_true')
    p.add_argument('--steps', type=int, default=2)
    run(p.parse_args())
