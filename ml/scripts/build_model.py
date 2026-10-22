"""CPU merge/export after held-out acceptance; all intermediate files external."""
import argparse
import json
import os
import subprocess
import sys
import re
from pathlib import Path
from model_store import root,inside,manifest,verify,register

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--version',required=True);p.add_argument('--base',default='base/Qwen--Qwen3-4B-Instruct-2507');p.add_argument('--llama-cpp',required=True,help='Pinned llama.cpp source directory');p.add_argument('--quantizer',required=True);p.add_argument('--evaluation',required=True,help='Held-out comparison.json with accepted=true');p.add_argument('--ollama',default='ollama');args=p.parse_args()
    store=root(40*1024**3)
    evaluation=json.loads(__import__('pathlib').Path(args.evaluation).read_text())
    if evaluation.get('accepted') is not True:raise RuntimeError('Adapter not accepted on held-out metrics. Keep base + RAG.')
    adapter=inside(store,f'adapters/{args.version}');base=inside(store,args.base);merged=inside(store,f'merged/{args.version}')
    metrics=json.loads((adapter/'run_metrics.json').read_text())
    if metrics.get('smoke_only') or metrics.get('full_training_completed') is not True:raise RuntimeError('Smoke or incomplete adapters cannot be deployed')
    if Path(args.evaluation).resolve() != (adapter/'comparison.json').resolve():raise RuntimeError('Use this adapter version\'s registered held-out comparison.json')
    provenance=json.loads((adapter/'base_revision.json').read_text())
    if evaluation.get('adapter_version')!=args.version or evaluation.get('base_revision')!=provenance:raise RuntimeError('Evaluation belongs to a different adapter or base revision')
    if not re.fullmatch('[a-f0-9]{64}',evaluation.get('dataset_sha256','')):raise RuntimeError('Held-out dataset hash missing')
    sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'eval'))
    from compare import gate
    scores=evaluation.get('models',{})
    adapted='continued-pretrained' if provenance.get('method')=='continued_pretraining' else 'fine-tuned'
    if not gate(scores.get('base',{}),scores.get(adapted,{})):raise RuntimeError('Reported metrics do not satisfy the release gate')
    entries=manifest(store)['files']
    for folder in (adapter,base):
        files=[f for f in entries if inside(store,f['path']).is_relative_to(folder)]
        if not files:raise RuntimeError(f'No registered files in {folder}')
        disk_files=[f for f in folder.rglob('*') if f.is_file() and '.cache' not in f.parts]
        registered={f['path'] for f in files}
        if any(f.relative_to(store).as_posix() not in registered for f in disk_files):raise RuntimeError('Unregistered model input; register/verify provenance before loading')
        for f in files:verify(store,f['path'])
    revision=json.loads((adapter/'base_revision.json').read_text())['revision']
    if any(f['version']!=revision for f in entries if inside(store,f['path']).is_relative_to(base)):raise RuntimeError('Base revision differs from training base')
    if merged.exists():raise RuntimeError('Merged version exists; no overwrites')
    import torch
    from transformers import AutoModelForCausalLM,AutoTokenizer
    from peft import PeftModel
    model=AutoModelForCausalLM.from_pretrained(base,torch_dtype=torch.float16,device_map='cpu',local_files_only=True,trust_remote_code=False)
    merged_model=PeftModel.from_pretrained(model,adapter,local_files_only=True).merge_and_unload()
    merged_model.save_pretrained(merged,safe_serialization=True,max_shard_size='2GB')
    AutoTokenizer.from_pretrained(base,local_files_only=True).save_pretrained(merged)
    del merged_model,model
    for file in merged.iterdir():
        if file.is_file():register(store,file,'ophanim-logistics',args.version,'Qwen/Qwen3-4B-Instruct-2507','Apache-2.0',evaluation)
    gguf=inside(store,f'gguf/ophanim-logistics-{args.version}-f16.gguf')
    if gguf.exists():raise RuntimeError('GGUF version exists')
    subprocess.run([sys.executable,str(__import__('pathlib').Path(args.llama_cpp)/'convert_hf_to_gguf.py'),str(merged),'--outfile',str(gguf),'--outtype','f16'],check=True)
    register(store,gguf,'ophanim-logistics',args.version,'Qwen/Qwen3-4B-Instruct-2507','Apache-2.0',evaluation)
    for quant in ('Q4_K_M','Q5_K_M','Q8_0'):
        output=inside(store,f'gguf/ophanim-logistics-{args.version}-{quant}.gguf')
        if output.exists():raise RuntimeError('Quantisation output exists')
        subprocess.run([args.quantizer,str(gguf),str(output),quant],check=True)
        register(store,output,'ophanim-logistics',args.version,'Qwen/Qwen3-4B-Instruct-2507','Apache-2.0',evaluation)
    q4=verify(store,f'gguf/ophanim-logistics-{args.version}-Q4_K_M.gguf')
    modelfile=inside(store,f'gguf/Modelfile-{args.version}')
    modelfile.write_text(f'FROM "{q4.as_posix()}"\nPARAMETER num_ctx 8192\nPARAMETER temperature 0.2\nSYSTEM You are Ophanim. Facts come only from supplied sources; missing facts are not found. Follow mode and task tags.\n',encoding='utf-8')
    register(store,modelfile,'ophanim-logistics',args.version,'Qwen/Qwen3-4B-Instruct-2507','Apache-2.0',evaluation)
    # The Ollama daemon must already have inherited OLLAMA_MODELS. Client env
    # cannot relocate a running daemon; require it started through the runbook.
    print(f'Ensure the Ollama daemon uses OLLAMA_MODELS={os.environ["OLLAMA_MODELS"]}',flush=True)
    subprocess.run([args.ollama,'create',f'ophanim-logistics:{args.version}','-f',str(modelfile)],check=True)
