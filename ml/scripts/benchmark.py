import argparse
import json
import subprocess
from model_store import root,verify

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--llama-bench',required=True);p.add_argument('--model',default='gguf/unsloth--Qwen3-4B-Instruct-2507-GGUF/Qwen3-4B-Instruct-2507-Q4_K_M.gguf');p.add_argument('--layers',default='0,99');p.add_argument('--threads',default='4,8');args=p.parse_args()
    store=root(100*1024**2);model=verify(store,args.model)
    result=subprocess.run([args.llama_bench,'-m',str(model),'-t',args.threads,'-ngl',args.layers,'-p','128','-n','128','-r','3','-o','json'],capture_output=True,text=True,check=True)
    rows=json.loads(result.stdout);(store/'eval'/'benchmark.json').write_text(json.dumps(rows,indent=2),encoding='utf-8');(store/'eval'/'benchmark.log').write_text(result.stderr,encoding='utf-8')
    print(json.dumps([{'threads':r['n_threads'],'gpu_layers':r['n_gpu_layers'],'prompt_tokens':r['n_prompt'],'generation_tokens':r['n_gen'],'tokens_s':r['avg_ts'],'target_met':r['avg_ts']>=8 if r['n_gen'] else None} for r in rows],indent=2))
