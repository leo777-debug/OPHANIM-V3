"""Private, checksummed Kaggle inputs for continued pretraining (not SFT)."""
import argparse
import hashlib
import json
import zipfile
from pathlib import Path
from generate_pretraining_corpus import generate
from pretrain import load_corpus
from train import load_rows
from model_store import root, inside, register


def notebook():
    cells = []
    def md(value): cells.append({'cell_type': 'markdown', 'metadata': {}, 'source': value.splitlines(keepends=True)})
    def code(value): cells.append({'cell_type': 'code', 'metadata': {}, 'execution_count': None, 'outputs': [], 'source': value.splitlines(keepends=True)})
    md('# Ophanim continued pretraining\nThis trains an existing 4B model on unlabelled domain text using next-token loss and a QLoRA adapter. No customer documents. The bundled synthetic corpus is a small starter corpus, not evidence of production readiness. Attach ophanim-cpt-input.zip as a **private** dataset; select one 16 GB GPU and Internet on. Save & Run All for background execution. A completed run still needs held-out task gates and semantic review before release.')
    code("import os, pathlib, zipfile, json, hashlib\nROOT=pathlib.Path('/kaggle/working/ophanim')\nROOT.mkdir(exist_ok=True)\nos.environ.update(OPHANIM_MODELS_DIR='/kaggle/working/models',HF_HOME='/kaggle/working/models/hf-cache',HF_HUB_CACHE='/kaggle/working/models/hf-cache/hub',OLLAMA_MODELS='/kaggle/working/models/ollama')\narchives=list(pathlib.Path('/kaggle/input').rglob('ophanim-cpt-input.zip'))\nassert len(archives)==1, 'Attach the private CPT input dataset'\nwith zipfile.ZipFile(archives[0]) as z:\n    names=z.namelist()\n    assert len(names)==len(set(names)), 'Duplicate archive entries'\n    checks=json.loads(z.read('bundle_manifest.json'))\n    assert set(checks)==set(names)-{'bundle_manifest.json'}, 'Incomplete bundle'\n    for item in z.infolist():\n        target=(ROOT/item.filename).resolve()\n        assert target.is_relative_to(ROOT.resolve()) and '\\\\' not in item.filename and ':' not in item.filename, 'Unsafe archive'\n        data=z.read(item)\n        if item.filename!='bundle_manifest.json': assert hashlib.sha256(data).hexdigest()==checks[item.filename], 'Corrupted input'\n        target.parent.mkdir(parents=True,exist_ok=True)\n        target.write_bytes(data)\ntry:\n    from kaggle_secrets import UserSecretsClient\n    token=UserSecretsClient().get_secret('HF_TOKEN')\n    if token: os.environ['HF_TOKEN']=token\nexcept Exception: pass\n")
    code("# CUDA 12.4 supports T4 and P100; use fp16, never bf16.\n%pip install torch==2.6.0 --index-url https://download.pytorch.org/whl/cu124\n%pip install -r /kaggle/working/ophanim/ml/requirements-training.txt\n")
    code("import torch, subprocess, sys, datetime\nassert torch.cuda.is_available(), 'Choose GPU in Settings'\nprint('GPU:',torch.cuda.get_device_name(0))\nVERSION='cpt-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S')\nRESUME=None # Restore a previous output into models/adapters/VERSION before setting this. Keep its VERSION.\ncommand=[sys.executable,str(ROOT/'ml/scripts/pretrain.py'),'--corpus',str(ROOT/'corpus'),'--version',VERSION]\nif RESUME: command+=['--resume',RESUME]\nresult=subprocess.run(command)\nadapter=pathlib.Path('/kaggle/working/models/adapters')/VERSION\nprint('Training exit status:',result.returncode)\n")
    code("# Training loss/perplexity is not task quality. Compare untouched task tests.\nmetrics=json.loads((adapter/'run_metrics.json').read_text()) if (adapter/'run_metrics.json').exists() else {}\nif metrics.get('full_training_completed'):\n    subprocess.run([sys.executable,str(ROOT/'ml/scripts/evaluate_gpu.py'),'--dataset',str(ROOT/'dataset'),'--corpus',str(ROOT/'corpus'),'--version',VERSION],check=True)\nelse:\n    print('Incomplete run: package the checkpoints, then resume. No release.')\n")
    code("# Package even an incomplete run; never include the downloaded base/cache.\nfiles=[p for p in adapter.rglob('*') if p.is_file() and p.name!='checksums.json']\nassert files, 'No adapter or checkpoint files were produced'\nchecks={p.relative_to(adapter).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in files}\n(adapter/'checksums.json').write_text(json.dumps(checks,indent=2))\nwith zipfile.ZipFile('/kaggle/working/ophanim-output.zip','w',zipfile.ZIP_DEFLATED) as z:\n    for p in adapter.rglob('*'):\n        if p.is_file(): z.write(p,p.relative_to(adapter).as_posix())\ncomparison=json.loads((adapter/'comparison.json').read_text()) if (adapter/'comparison.json').exists() else {}\nprint('Output ready. Full training:',metrics.get('full_training_completed',False),'Accepted:',comparison.get('accepted',False))\n")
    return {'cells': cells, 'metadata': {'kernelspec': {'display_name': 'Python 3', 'language': 'python', 'name': 'python3'}, 'language_info': {'name': 'python'}}, 'nbformat': 4, 'nbformat_minor': 5}


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--corpus', required=True); p.add_argument('--dataset', required=True); p.add_argument('--version', required=True)
    args = p.parse_args(); store = root(100 * 1024**2)
    load_corpus(args.corpus)
    for split in ('train', 'validation', 'test'):
        rows = load_rows(Path(args.dataset) / f'{split}.jsonl')
        if any(r['split'] != split for r in rows): raise RuntimeError('Invalid evaluation split')
    repo = Path(__file__).resolve().parents[2]
    bundle = inside(store, f'kaggle-downloads/ophanim-cpt-{args.version}/ophanim-cpt-input.zip')
    if bundle.exists(): raise RuntimeError('Bundle version exists')
    bundle.parent.mkdir(parents=True, exist_ok=True)
    checks = {}
    with zipfile.ZipFile(bundle, 'x', zipfile.ZIP_DEFLATED) as z:
        files = [(f, f.relative_to(repo).as_posix()) for f in (repo / 'ml').rglob('*')
                 if f.is_file() and f.suffix in ('.py', '.json', '.txt', '.md') and '__pycache__' not in f.parts]
        for split in ('train', 'validation', 'test'):
            files.extend([(Path(args.corpus) / f'{split}.jsonl', f'corpus/{split}.jsonl'),
                          (Path(args.dataset) / f'{split}.jsonl', f'dataset/{split}.jsonl')])
        files.append((Path(args.corpus) / 'corpus_card.json', 'corpus/corpus_card.json'))
        for file, name in files:
            data = file.read_bytes(); checks[name] = hashlib.sha256(data).hexdigest(); z.writestr(name, data)
        z.writestr('bundle_manifest.json', json.dumps(checks, indent=2))
    register(store, bundle, 'ophanim-cpt-input', args.version, 'Qwen/Qwen3-4B-Instruct-2507', 'MIT / Apache-2.0')
    file = repo / 'ml/kaggle/ophanim_continued_pretraining.ipynb'
    file.write_text(json.dumps(notebook(), indent=2), encoding='utf-8')
    print(f'Private CPT bundle: {bundle}\nNotebook: {file}')
