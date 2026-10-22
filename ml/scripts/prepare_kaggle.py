"""Produce a private Kaggle input bundle and executable notebook, no customers."""
import argparse
import json
import zipfile
from pathlib import Path
from model_store import root,inside


def notebook():
    cells=[]
    def markdown(text):cells.append({'cell_type':'markdown','metadata':{},'source':text.splitlines(keepends=True)})
    def code(text):cells.append({'cell_type':'code','metadata':{},'execution_count':None,'outputs':[],'source':text.splitlines(keepends=True)})
    markdown('# Ophanim dual-mode QLoRA\nRun after the 17 October 2026 competition. Attach the private synthetic input bundle. Choose one T4/P100 GPU, Internet on, then Save & Run All. No customer data. Check accelerator quota and 12-hour session limit before starting.')
    code("import os, pathlib, zipfile, json\nos.environ['OPHANIM_MODELS_DIR']='/kaggle/working/models'\nos.environ['HF_HOME']='/kaggle/working/models/hf-cache'\nos.environ['HF_HUB_CACHE']='/kaggle/working/models/hf-cache/hub'\nos.environ['OLLAMA_MODELS']='/kaggle/working/models/ollama'\ninputs=list(pathlib.Path('/kaggle/input').rglob('ophanim-input.zip'))\nassert len(inputs)==1, 'Attach the private dataset containing ophanim-input.zip'\nwork=pathlib.Path('/kaggle/working/ophanim'); work.mkdir(exist_ok=True)\nwith zipfile.ZipFile(inputs[0]) as z:\n    for item in z.infolist():\n        dest=(work/item.filename).resolve()\n        assert dest.is_relative_to(work.resolve()), 'Unsafe input archive'\n    z.extractall(work)\n# Optional gated-model token uses Kaggle Secrets, never print it. Qwen is ungated.\ntry:\n    from kaggle_secrets import UserSecretsClient\n    token=UserSecretsClient().get_secret('HF_TOKEN')\n    if token: os.environ['HF_TOKEN']=token\nexcept Exception:\n    pass\n")
    code("# CUDA 12.4 retains P100/Pascal support. Do not switch to a CUDA 13 wheel.\n%pip install torch==2.6.0 --index-url https://download.pytorch.org/whl/cu124\n%pip install -r /kaggle/working/ophanim/ml/requirements-training.txt\n")
    code("import torch, subprocess, sys\nassert torch.cuda.is_available(), 'Select GPU in notebook settings'\nprint(torch.cuda.get_device_name(0))\nVERSION='v1-after-competition'\nDATA='/kaggle/working/ophanim/dataset'\n# If resuming, attach previous output and set RESUME to its checkpoint directory.\nRESUME=None\ncommand=[sys.executable,'/kaggle/working/ophanim/ml/scripts/train.py','--dataset',DATA,'--version',VERSION]\nif RESUME: command += ['--resume',RESUME]\nsubprocess.run(command,check=True)\n")
    code("adapter=pathlib.Path('/kaggle/working/models/adapters')/VERSION\nmetrics=json.loads((adapter/'run_metrics.json').read_text())\nassert metrics['full_training_completed'], 'Budget stopped training; resume checkpoint in a new session'\nsubprocess.run([sys.executable,'/kaggle/working/ophanim/ml/scripts/evaluate_gpu.py','--dataset',DATA,'--version',VERSION],check=True)\n")
    code("# Always package logs and checkpoints, including timed-out runs when possible.\nimport hashlib\nfiles=[p for p in adapter.rglob('*') if p.is_file()]\nchecksums={str(p.relative_to(adapter)).replace('\\\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in files}\n(adapter/'checksums.json').write_text(json.dumps(checksums,indent=2))\nwith zipfile.ZipFile('/kaggle/working/ophanim-output.zip','w',compression=zipfile.ZIP_DEFLATED) as z:\n    for p in adapter.rglob('*'):\n        if p.is_file(): z.write(p,str(p.relative_to(adapter)))\nprint('Download ophanim-output.zip from Output. Accepted:',json.loads((adapter/'comparison.json').read_text())['accepted'])\n")
    return {'cells':cells,'metadata':{'kernelspec':{'display_name':'Python 3','language':'python','name':'python3'},'language_info':{'name':'python'}},'nbformat':4,'nbformat_minor':5}


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--dataset',required=True);p.add_argument('--version',default='v2-2026-10-10');args=p.parse_args();store=root(100*1024**2)
    repo=Path(__file__).resolve().parents[2];dataset=Path(args.dataset)
    for split in ('train','validation','test'):
        rows=[json.loads(l) for l in (dataset/f'{split}.jsonl').read_text(encoding='utf-8').splitlines()]
        if any(r.get('customer_data') is not False or r.get('source')!='synthetic-template' for r in rows):raise RuntimeError('No customer or unreviewed data may be uploaded to Kaggle')
    bundle=inside(store,f'kaggle-downloads/ophanim-input-{args.version}/ophanim-input.zip');bundle.parent.mkdir(parents=True,exist_ok=True)
    if bundle.exists():raise RuntimeError('Bundle version exists')
    with zipfile.ZipFile(bundle,'w',zipfile.ZIP_DEFLATED) as z:
        for file in (repo/'ml').rglob('*'):
            if file.is_file() and file.suffix in ('.py','.json','.txt','.md') and '__pycache__' not in file.parts and 'results' not in file.parts:z.write(file,str(file.relative_to(repo)))
        for split in ('train','validation','test'):z.write(dataset/f'{split}.jsonl',f'dataset/{split}.jsonl')
    notebook_path=repo/'ml'/'kaggle'/'ophanim_qlora.ipynb';notebook_path.parent.mkdir(exist_ok=True);notebook_path.write_text(json.dumps(notebook(),indent=2),encoding='utf-8')
    print(f'Private synthetic bundle: {bundle}\nNotebook: {notebook_path}')
