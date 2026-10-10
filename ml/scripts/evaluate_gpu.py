"""Held-out generation on Kaggle GPU, sequential base/adapter memory usage."""
import argparse
import gc
import json
import sys
import time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'eval'))
from compare import score,aggregate,gate
from model_store import root

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--dataset',required=True);p.add_argument('--version',required=True);args=p.parse_args()
    store=root(1024**3)
    import torch
    from transformers import AutoModelForCausalLM,AutoTokenizer,BitsAndBytesConfig
    from peft import PeftModel
    if not torch.cuda.is_available():raise RuntimeError('GPU evaluation requires CUDA')
    adapter=store/'adapters'/args.version;revision=json.loads((adapter/'base_revision.json').read_text())
    rows=[json.loads(l) for l in (Path(args.dataset)/'test.jsonl').read_text(encoding='utf-8').splitlines()]
    if any(r['split']!='test' or r['customer_data'] is not False for r in rows):raise RuntimeError('Invalid held-out dataset')
    tokenizer=AutoTokenizer.from_pretrained(revision['model'],revision=revision['revision'])
    reports={}
    for name in ('base','fine-tuned'):
        model=AutoModelForCausalLM.from_pretrained(revision['model'],revision=revision['revision'],device_map={'':0},torch_dtype=torch.float16,attn_implementation='eager',quantization_config=BitsAndBytesConfig(load_in_4bit=True,bnb_4bit_quant_type='nf4',bnb_4bit_compute_dtype=torch.float16))
        if name=='fine-tuned':model=PeftModel.from_pretrained(model,adapter)
        model.eval();results=[]
        for i,row in enumerate(rows):
            text=tokenizer.apply_chat_template(row['messages'][:2],tokenize=False,add_generation_prompt=True)
            inputs=tokenizer(text,return_tensors='pt').to('cuda');torch.cuda.synchronize();started=time.monotonic()
            with torch.inference_mode():tokens=model.generate(**inputs,max_new_tokens=600,do_sample=False,pad_token_id=tokenizer.eos_token_id)
            torch.cuda.synchronize();elapsed=time.monotonic()-started;generated=tokens[0,inputs['input_ids'].shape[1]:];output=tokenizer.decode(generated,skip_special_tokens=True)
            r={'id':row['id'],'mode':row['mode'],'task':row['task'],'language':row['language'],'output':output,'metrics':score(row,output),'latency_s':elapsed,'tokens_s':len(generated)/elapsed}
            if row['task']=='classify_document':
                r['gold_class']=row['target']['document_type']
                try:r['predicted_class']=json.loads(output).get('document_type','invalid')
                except Exception:r['predicted_class']='invalid'
            results.append(r);print(f'{name} held-out {i+1}/{len(rows)}',flush=True)
        groups={'all':results}
        for mode in ('logistics','general'):
            for lang in ('en','ar','mixed'):groups[f'{mode}/{lang}']=[r for r in results if r['mode']==mode and r['language']==lang]
        reports[name]={}
        for group,values in groups.items():
            metrics=aggregate(values);extract=[r for r in values if r['task'].startswith('extract_')]
            metrics['extraction_field_exact']=aggregate(extract).get('field_exact') if extract else None;reports[name][group]=metrics
        (adapter/f'{name}-heldout-predictions.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
        del model;gc.collect();torch.cuda.empty_cache()
    comparison={'models':reports,'accepted':gate(reports['base'],reports['fine-tuned']),'hardware':torch.cuda.get_device_name(0),'dataset_sha256':__import__('hashlib').sha256((Path(args.dataset)/'test.jsonl').read_bytes()).hexdigest(),'adapter_version':args.version,'base_revision':revision}
    (adapter/'comparison.json').write_text(json.dumps(comparison,indent=2),encoding='utf-8')
    (adapter/'REPORT.md').write_text('# Held-out GPU evaluation\n\n```json\n'+json.dumps(comparison,indent=2)+'\n```\n\nLarger configured model: not run. Human semantic review remains required.\n',encoding='utf-8')
    print(json.dumps({'accepted':comparison['accepted'],'hardware':comparison['hardware']},indent=2))
