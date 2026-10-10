import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type { AiGenerationRequest, AiProviderConfig } from './providers/types';
import { getAiProvider } from './providers/registry';
import { validateAiBaseUrl } from './providers/openai-compatible-provider';
import { TASK_SCHEMAS } from './task-schemas';

const checksums = new Map<string,{mtime:number;size:number;hash:string}>();
export async function localModelStatus() {
  const root=process.env.OPHANIM_MODELS_DIR ?? 'D:\\models';
  const model=process.env.OPHANIM_LOCAL_MODEL ?? 'ophanim-logistics:base';
  try { await stat(root); } catch { return {available:false,path:root,model,version:null,message:`Model drive not found at ${root}`}; }
  try {
    const manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8')) as {files:Array<{path:string;sha256:string;version:string}>};
    const relative=process.env.OPHANIM_MODEL_FILE ?? 'gguf/unsloth--Qwen3-4B-Instruct-2507-GGUF/Qwen3-4B-Instruct-2507-Q4_K_M.gguf';
    const entry=manifest.files.find(f=>f.path===relative);
    if (!entry) throw new Error('Local model is not registered in manifest.json.');
    const resolvedRoot=await realpath(root); const file=await realpath(path.resolve(root,relative));
    if (!file.startsWith(resolvedRoot+path.sep)) throw new Error('Model path escapes the model drive.');
    const info=await stat(file); let cached=checksums.get(file);
    if (!cached || cached.mtime!==info.mtimeMs || cached.size!==info.size) {
      const digest=createHash('sha256'); for await(const block of createReadStream(file)) digest.update(block);
      cached={mtime:info.mtimeMs,size:info.size,hash:digest.digest('hex')}; checksums.set(file,cached);
    }
    if (cached.hash!==entry.sha256) throw new Error('Local model checksum failed; use a verified previous version.');
    const baseUrl=process.env.OPHANIM_LOCAL_BASE_URL ?? 'http://localhost:11434/v1';
    await validateAiBaseUrl(baseUrl);
    const response=await fetch(`${baseUrl.replace(/\/$/,'')}/models`,{redirect:'error',signal:AbortSignal.timeout(2500)});
    const payload=await response.json() as {data?:Array<{id:string}>};
    if (!response.ok || !payload.data?.some(m=>m.id===model)) throw new Error('Verified model is on disk; start the model server and load this version.');
    return {available:true,path:file,model,version:entry.version,message:'Checksum verified; model server lists this model.'};
  } catch(error) { return {available:false,path:root,model,version:null,message:error instanceof Error ? error.message:'Local model unavailable.'}; }
}

export async function generateWithRouting(config:AiProviderConfig | null,request:AiGenerationRequest) {
  if (!config?.enabledTasks.includes(request.task)) throw new Error('This AI task is disabled or no AI model is configured.');
  const override=config.taskModels?.[request.task];
  if (!override && TASK_SCHEMAS[request.task]) {
    const local=await localModelStatus();
    if (local.available) {
      try {
        const output=await getAiProvider().generate({...config,apiKey:'',baseUrl:process.env.OPHANIM_LOCAL_BASE_URL ?? 'http://localhost:11434/v1',model:local.model},request);
        return {output,model:local.model,fallback:false};
      } catch { /* Configured fallback is explicitly customer-selected. */ }
    }
  }
  if (config.model.startsWith('ophanim-logistics') && !(await localModelStatus()).available) throw new Error('Local model unavailable; configure another model in AI SETUP or use no-AI search.');
  return {output:await getAiProvider().generate({...config,model:override ?? config.model},request),model:override ?? config.model,fallback:!override && Boolean(TASK_SCHEMAS[request.task])};
}
