"""Compare OpenAI-compatible models; no teacher data generation or training."""
import argparse
import json
import os
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from collections import Counter,defaultdict
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from model_store import root


def leaves(value,prefix=''):
    if isinstance(value,dict):return {key:leaf for k,v in value.items() for key,leaf in leaves(v,f'{prefix}.{k}').items()}
    if isinstance(value,list):return {key:leaf for i,v in enumerate(value) for key,leaf in leaves(v,f'{prefix}[{i}]').items()}
    return {prefix:value}


def score(row,output):
    result={'valid_json':0,'schema_valid':0,'exact_match':0,'field_exact':0,'field_f1':0,'answer_correct':None,'citation_correct':None,'not_found_correct':None,'hallucination':None,'classification_correct':None}
    if row['task']=='grounded_qa':result.update(answer_correct=0,citation_correct=0,not_found_correct=0 if row['unanswerable'] else None,hallucination=1)
    if row['task']=='classify_document':result['classification_correct']=0
    try:pred=json.loads(output)
    except (ValueError,TypeError):return result
    result['valid_json']=1
    from jsonschema import validate,ValidationError
    try:validate(pred,row['schema']);result['schema_valid']=1
    except ValidationError:pass
    gold=leaves(row['target']);actual=leaves(pred);matched=sum(k in actual and actual[k]==v for k,v in gold.items())
    result.update(exact_match=int(pred==row['target']),field_exact=matched/max(len(gold),1),field_f1=2*matched/max(len(gold)+len(actual),1))
    if row['task']=='classify_document':result['classification_correct']=int(isinstance(pred,dict) and pred.get('document_type')==row['target']['document_type'])
    if row['task']=='grounded_qa':
        statements=pred.get('statements',[]) if isinstance(pred,dict) else []
        found=bool(statements) and all(s.get('label')=='NOT FOUND' for s in statements if isinstance(s,dict))
        sources={c['id']:c['content'] for c in row['context']}
        supported=bool(statements) and all(isinstance(s,dict) and (s.get('label')=='NOT FOUND' or (s.get('label')=='FACT' and bool(s.get('citations')) and s.get('text')==s.get('quote') and all(c in sources and isinstance(s.get('quote'),str) and s['quote'] in sources[c] for c in s['citations']))) for s in statements)
        result['not_found_correct']=int(found) if row['unanswerable'] else None
        result['citation_correct']=int(supported) if not found else None
        result['answer_correct']=int(found) if row['unanswerable'] else int(pred==row['target'])
        result['hallucination']=int((row['unanswerable'] and not found) or not supported)
    return result


def call(endpoint,row):
    base,model=endpoint
    headers={'Content-Type':'application/json'}
    key=os.environ.get('EVAL_API_KEY')
    if key:headers['Authorization']='Bearer '+key
    payload=json.dumps({'model':model,'messages':row['messages'][:2],'temperature':0,'max_tokens':600,'response_format':{'type':'json_object'}}).encode()
    started=time.monotonic()
    with urllib.request.urlopen(urllib.request.Request(base.rstrip('/')+'/chat/completions',payload,headers),timeout=900) as response:body=json.load(response)
    elapsed=time.monotonic()-started
    output=body['choices'][0]['message']['content']
    tokens=body.get('usage',{}).get('completion_tokens')
    return output,elapsed,tokens/elapsed if tokens else None


def aggregate(results):
    metrics={}
    for key in results[0]['metrics'] if results else []:
        values=[r['metrics'][key] for r in results if r['metrics'][key] is not None]
        metrics[key]=sum(values)/len(values) if values else None
    latencies=[r['latency_s'] for r in results if r.get('latency_s') is not None]
    speeds=[r['tokens_s'] for r in results if r.get('tokens_s') is not None]
    metrics.update(latency_s=sum(latencies)/len(latencies) if latencies else None,tokens_s=sum(speeds)/len(speeds) if speeds else None)
    confusion=Counter()
    for r in results:
        if r['task']=='classify_document':confusion[(r['gold_class'],r.get('predicted_class','invalid'))]+=1
    metrics['confusion_matrix']={f'{a} -> {b}':n for (a,b),n in confusion.items()}
    return metrics


def gate(base,tuned):
    # Every mode/language must meet the primary release metrics, not just the mean.
    for group in ('all','logistics/en','logistics/ar','general/en','general/ar'):
        if group not in base or group not in tuned:return False
        for metric in ('extraction_field_exact','valid_json','not_found_correct'):
            a=base[group].get(metric);b=tuned[group].get(metric)
            if a is not None and (b is None or b<=a):return False
        a=base[group].get('hallucination');b=tuned[group].get('hallucination')
        if a is not None and (b is None or b>a):return False
    return True


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--dataset',required=True);p.add_argument('--base',nargs=2,metavar=('URL','MODEL'));p.add_argument('--fine-tuned',nargs=2);p.add_argument('--larger',nargs=2);p.add_argument('--sample',type=int);p.add_argument('--concurrency',type=int,default=1);p.add_argument('--report',default=str(Path(__file__).with_name('REPORT.md')));args=p.parse_args()
    store=root(100*1024**2)
    rows=[json.loads(line) for line in Path(args.dataset).read_text(encoding='utf-8').splitlines()]
    if args.sample:
        # A balanced development sample, not the held-out test, for model selection.
        if any(r['split']=='test' for r in rows):raise RuntimeError('Selection sampling must use validation, not held-out test.')
        buckets=defaultdict(list)
        for row in rows:buckets[(row['mode'],row['task'],row['language'])].append(row)
        rows=[]
        while len(rows)<args.sample and any(buckets.values()):
            for bucket in buckets.values():
                if bucket and len(rows)<args.sample:rows.append(bucket.pop(0))
    reports={};lines=['# Model evaluation report','',f'Evaluation rows: {len(rows)}. No missing model is assigned a score.','']
    for name,endpoint in [('base',args.base),('fine-tuned',args.fine_tuned),('larger',args.larger)]:
        if not endpoint:lines.extend([f'## {name}','Not available / not run.','']);continue
        # Connection/availability failures are not model-quality measurements.
        try:
            with urllib.request.urlopen(endpoint[0].rstrip('/')+'/models',timeout=10) as response:
                listed=json.load(response).get('data',[])
            if not any(m['id']==endpoint[1] for m in listed):raise RuntimeError('Requested model not loaded')
        except Exception as e:raise RuntimeError(f'{name} endpoint unavailable; no evaluation scores recorded: {e}') from e
        results=[]
        def evaluate(row):
            try:output,elapsed,speed=call(endpoint,row);error=None
            except Exception as e:output='';elapsed=None;speed=None;error=str(e)
            metrics=score(row,output)
            result={'id':row['id'],'mode':row['mode'],'task':row['task'],'language':row['language'],'output':output,'metrics':metrics,'latency_s':elapsed,'tokens_s':speed,'error':error}
            if row['task']=='classify_document':
                result['gold_class']=row['target']['document_type']
                try:result['predicted_class']=json.loads(output).get('document_type','invalid')
                except Exception:result['predicted_class']='invalid'
            return result
        with ThreadPoolExecutor(max_workers=max(1,min(4,args.concurrency))) as pool:
          for i,result in enumerate(pool.map(evaluate,rows)):
            results.append(result)
            (store/'eval'/f'{name}-partial.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
            row=rows[i]
            print(f'{name} {i+1}/{len(rows)} {row["mode"]}/{row["task"]}/{row["language"]}',flush=True)
        if any(r['error'] for r in results):
            errors=sum(bool(r['error']) for r in results)
            raise RuntimeError(f'{errors} requests failed; partial predictions saved, no quality report recorded. Fix endpoint and rerun.')
        groups={'all':results}
        for mode in ('logistics','general'):
            for language in ('en','ar','mixed'):groups[f'{mode}/{language}']=[r for r in results if r['mode']==mode and r['language']==language]
        reports[name]={}
        lines.extend([f'## {name}: {endpoint[1]}',''])
        for group,values in groups.items():
            metrics=aggregate(values)
            extraction=[r for r in values if r['task'].startswith('extract_')]
            metrics['extraction_field_exact']=aggregate(extraction).get('field_exact') if extraction else None
            reports[name][group]=metrics
            lines.extend([f'### {group} ({len(values)} rows)','', '```json',json.dumps(metrics,indent=2),'```',''])
        (store/'eval'/f'{name}-predictions.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
    accepted=bool(args.fine_tuned and args.base and not args.sample and gate(reports.get('base',{}),reports.get('fine-tuned',{})))
    lines.extend(['## Acceptance',f'Fine-tuned adapter accepted: {accepted}. Full held-out results and human citation/summary review are required.','', 'Exact structured matching is intentionally conservative. Free-form summary/forecast/mistake correctness requires human review; exact-match is not a semantic quality score. CPU/GPU hardware must be recorded separately.'])
    Path(args.report).write_text('\n'.join(lines)+'\n',encoding='utf-8')
    (store/'eval'/'comparison.json').write_text(json.dumps({'models':reports,'accepted':accepted},indent=2),encoding='utf-8')
