import { spawn } from 'node:child_process';
import path from 'node:path';
import type { ExtractedBlock } from './types';
import { fetchAiEndpoint } from '@/lib/ai/providers/openai-compatible-provider';

export async function extractDocument(fileName: string, bytes: Buffer): Promise<ExtractedBlock[]> {
  if (process.env.KNOWLEDGE_EXTRACTOR_URL) {
    const base=process.env.KNOWLEDGE_EXTRACTOR_URL;
    const response=await fetchAiEndpoint(`${base.replace(/\/$/,'')}/extract`,{method:'POST',timeoutMs:180_000,maxResponseBytes:12_000_000,headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.KNOWLEDGE_CRON_SECRET}`},body:JSON.stringify({file_name:fileName,content_base64:bytes.toString('base64')})});
    if(!response.ok)throw new Error(`Extraction service returned ${response.status}`);
    const body=await response.json() as {blocks:ExtractedBlock[]};
    if(!Array.isArray(body.blocks))throw new Error('Extractor returned invalid output.');
    return body.blocks;
  }
  return new Promise((resolve, reject) => {
    const child = spawn(/* turbopackIgnore: true */ process.env.KNOWLEDGE_PYTHON ?? 'python', [path.resolve('ml/scripts/extract_document.py')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = ''; let error = ''; let settled = false;
    const fail = (message: string) => { if (!settled) { settled = true; child.kill(); clearTimeout(timer); reject(new Error(message)); } };
    const timer = setTimeout(() => fail('Document extraction timed out after 3 minutes.'), 180_000);
    child.on('error', () => fail('Extraction runtime missing. Install ml/requirements.txt and set KNOWLEDGE_PYTHON.'));
    child.stdout.on('data', (data) => { output += data.toString(); if (output.length > 12_000_000) fail('Extracted text exceeds the limit.'); });
    child.stderr.on('data', (data) => { error = (error + data.toString()).slice(-2000); });
    child.stdin.on('error', () => fail('Extractor input failed.'));
    child.on('close', (code) => {
      clearTimeout(timer); if (settled) return; settled = true;
      if (code !== 0) { reject(new Error(`Extraction failed: ${error.slice(-500)}`)); return; }
      try { const parsed = JSON.parse(output) as { blocks: ExtractedBlock[] }; if (!Array.isArray(parsed.blocks)) throw new Error(); resolve(parsed.blocks); }
      catch { reject(new Error('Extractor returned invalid output.')); }
    });
    child.stdin.end(JSON.stringify({ file_name: fileName, content_base64: bytes.toString('base64') }));
  });
}
