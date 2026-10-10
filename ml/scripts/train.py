"""One balanced dual-mode QLoRA adapter. Full run is GPU-only; --smoke is CPU."""
import argparse
import json
import os
import random
import time
from pathlib import Path
from model_store import root,register


def load_rows(path):
    rows=[json.loads(line) for line in Path(path).read_text(encoding='utf-8').splitlines()]
    if any(r.get('customer_data') is not False or r.get('source')!='synthetic-template' or r.get('licence')!='MIT' for r in rows):
        raise RuntimeError('This training entry point accepts synthetic MIT template data only. Customer training requires a separately reviewed consent pipeline.')
    return rows


def run(args):
    store=root(20*1024**3 if not args.smoke else 64*1024**2)
    import torch
    from transformers import AutoModelForCausalLM,AutoTokenizer,BitsAndBytesConfig,Trainer,TrainerCallback,TrainingArguments,Qwen3Config,Qwen3ForCausalLM
    from peft import LoraConfig,get_peft_model,prepare_model_for_kbit_training
    config=json.loads(Path(args.config).read_text())
    random.seed(config['seed']);torch.manual_seed(config['seed'])
    output=store/'adapters'/args.version
    if not output.resolve().is_relative_to(store):raise ValueError('Invalid adapter version')
    if output.exists() and not args.resume:raise RuntimeError('Adapter version exists; choose a new version or --resume a checkpoint')
    output.mkdir(parents=True,exist_ok=True)
    started=time.monotonic()
    if args.smoke:
        torch.set_num_threads(2)
        # A randomly initialised toy fixture proves the PEFT/Trainer/checkpoint
        # path on CPU. It is not a trained Ophanim base or a deployable adapter.
        model=Qwen3ForCausalLM(Qwen3Config(vocab_size=256,hidden_size=32,intermediate_size=64,num_hidden_layers=2,num_attention_heads=4,num_key_value_heads=2,head_dim=8))
        data=[{'input_ids':torch.tensor([ord(c)%256 for c in '[mode: logistics][task: extract_awb] {"pieces":48}']),'labels':torch.tensor([ord(c)%256 for c in '[mode: logistics][task: extract_awb] {"pieces":48}'])} for _ in range(4)]
        validation=data
        tokenizer=None
    else:
        if not torch.cuda.is_available():raise RuntimeError('Full QLoRA requires a Kaggle/rented NVIDIA GPU; this CPU machine only runs --smoke.')
        free,total=torch.cuda.mem_get_info()
        if total<14*1024**3:raise RuntimeError('At least a 16 GB-class GPU is required')
        print(json.dumps({'gpu':torch.cuda.get_device_name(0),'total_gib':total/1024**3,'free_gib':free/1024**3,'fp16':True,'bf16':False}),flush=True)
        train=load_rows(Path(args.dataset)/'train.jsonl');val=load_rows(Path(args.dataset)/'validation.jsonl')
        if any(r['split']!='train' for r in train) or any(r['split']!='validation' for r in val):raise RuntimeError('Invalid splits; held-out test never trains or tunes')
        hashes=lambda rows:{__import__('hashlib').sha256(json.dumps(r['messages'][:2],sort_keys=True).encode()).hexdigest() for r in rows}
        test=load_rows(Path(args.dataset)/'test.jsonl')
        if hashes(train)&hashes(val) or hashes(train)&hashes(test) or hashes(val)&hashes(test):raise RuntimeError('Split leakage detected')
        counts={m:sum(r['mode']==m for r in train) for m in ('logistics','general')}
        if len(set(counts.values()))!=1:raise RuntimeError('Training modes must have equal counts')
        # Pin downloaded base revision once and persist it in the output metadata.
        from huggingface_hub import model_info
        revision=args.revision or model_info(config['model_id']).sha
        tokenizer=AutoTokenizer.from_pretrained(config['model_id'],revision=revision,trust_remote_code=False)
        tokenizer.pad_token=tokenizer.eos_token
        quant=BitsAndBytesConfig(load_in_4bit=True,bnb_4bit_quant_type='nf4',bnb_4bit_use_double_quant=True,bnb_4bit_compute_dtype=torch.float16)
        model=AutoModelForCausalLM.from_pretrained(config['model_id'],revision=revision,quantization_config=quant,device_map={'':0},torch_dtype=torch.float16,attn_implementation='eager',trust_remote_code=False)
        model=prepare_model_for_kbit_training(model,use_gradient_checkpointing=True)
        model.config.use_cache=False
        def encode(rows):
            encoded=[]
            for row in rows:
                prompt=tokenizer.apply_chat_template(row['messages'][:2],tokenize=False,add_generation_prompt=True)
                completion=row['messages'][2]['content']+tokenizer.eos_token
                prefix=tokenizer(prompt,add_special_tokens=False)['input_ids']
                suffix=tokenizer(completion,add_special_tokens=False)['input_ids']
                if len(prefix)+len(suffix)>config['max_length']:
                    raise RuntimeError(f'Example {row["id"]} exceeds max_length; do not truncate labels. Reduce schema/prompt verbosity or deliberately raise max_length after GPU memory profiling.')
                encoded.append({'input_ids':torch.tensor(prefix+suffix),'labels':torch.tensor([-100]*len(prefix)+suffix)})
            return encoded
        data=encode(train);validation=encode(val)
        (output/'base_revision.json').write_text(json.dumps({'model':config['model_id'],'revision':revision,'seed':config['seed'],'counts':counts},indent=2))
    lora=LoraConfig(r=config['rank'],lora_alpha=config['alpha'],lora_dropout=config['dropout'],target_modules=config['target_modules'],task_type='CAUSAL_LM')
    model=get_peft_model(model,lora);model.print_trainable_parameters()
    def collate(batch):
        length=max(len(r['input_ids']) for r in batch)
        ids=torch.full((len(batch),length),tokenizer.pad_token_id if tokenizer else 0,dtype=torch.long)
        labels=torch.full_like(ids,-100);mask=torch.zeros_like(ids)
        for i,row in enumerate(batch):
            n=len(row['input_ids']);ids[i,:n]=row['input_ids'];labels[i,:n]=row['labels'];mask[i,:n]=1
        return {'input_ids':ids,'labels':labels,'attention_mask':mask}
    class Budget(TrainerCallback):
        last_save=started
        def on_step_end(self,args_,state,control,**kwargs):
            elapsed=time.monotonic()-started
            if state.global_step==5:
                estimate=elapsed/state.global_step*state.max_steps
                print(f'Estimated training duration: {estimate/3600:.2f} hours; budget {config["session_budget_seconds"]/3600:.2f} hours',flush=True)
                if estimate>config['session_budget_seconds']:control.should_training_stop=True;control.should_save=True
            if time.monotonic()-self.last_save>=config['save_every_seconds']:
                control.should_save=True;self.last_save=time.monotonic()
            if elapsed>config['session_budget_seconds']:
                control.should_save=True;control.should_training_stop=True
            return control
    arguments=TrainingArguments(output_dir=str(output),num_train_epochs=config['epochs'],max_steps=3 if args.smoke else -1,
        per_device_train_batch_size=config['batch_size'],per_device_eval_batch_size=1,gradient_accumulation_steps=1 if args.smoke else config['gradient_accumulation'],
        learning_rate=config['learning_rate'],seed=config['seed'],data_seed=config['seed'],fp16=not args.smoke,bf16=False,use_cpu=args.smoke,
        gradient_checkpointing=not args.smoke,logging_steps=1 if args.smoke else 5,save_strategy='steps',save_steps=20,save_total_limit=3,
        eval_strategy='steps',eval_steps=20,report_to='none',optim='adamw_torch',dataloader_num_workers=0)
    trainer=Trainer(model=model,args=arguments,train_dataset=data,eval_dataset=validation,data_collator=collate,processing_class=tokenizer,callbacks=[Budget()])
    trained=trainer.train(resume_from_checkpoint=args.resume or None)
    trainer.save_model(str(output));metrics=trainer.evaluate();metrics.update(trained.metrics)
    metrics.update(smoke_only=args.smoke,elapsed_s=time.monotonic()-started,hardware='CPU toy fixture' if args.smoke else torch.cuda.get_device_name(0),cost_usd=0 if args.smoke else None,full_training_completed=not args.smoke and trainer.state.global_step>=trainer.state.max_steps)
    if not args.smoke:metrics['peak_cuda_gib']=torch.cuda.max_memory_allocated()/1024**3
    (output/'run_metrics.json').write_text(json.dumps(metrics,indent=2))
    trainer.state.save_to_json(str(output/'training_log.json'))
    for file in output.rglob('*'):
        if file.is_file():register(store,file,'ophanim-smoke' if args.smoke else 'ophanim-logistics',args.version,config['model_id'],'Apache-2.0',metrics)
    print(json.dumps(metrics,indent=2))


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--config',default=str(Path(__file__).resolve().parents[1]/'configs'/'qlora.json'));p.add_argument('--dataset');p.add_argument('--version',required=True);p.add_argument('--resume');p.add_argument('--revision');p.add_argument('--smoke',action='store_true');args=p.parse_args();run(args)
