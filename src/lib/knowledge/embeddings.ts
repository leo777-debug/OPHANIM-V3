import { validateAiBaseUrl } from '@/lib/ai/providers/openai-compatible-provider';
import type { EmbeddingSettings } from './settings';

export function embeddingConfig() {
  return { baseUrl: process.env.EMBEDDING_BASE_URL, model: process.env.EMBEDDING_MODEL, apiKey: process.env.EMBEDDING_API_KEY };
}
export async function embedTexts(texts: string[], settings?:EmbeddingSettings): Promise<number[][]> {
  const config = settings ?? embeddingConfig();
  if (!config.baseUrl || !config.model) throw new Error('Configure the embedding server in AI SETUP or EMBEDDING_BASE_URL / EMBEDDING_MODEL.');
  await validateAiBaseUrl(config.baseUrl);
  const url = `${config.baseUrl.replace(/\/(?:v1\/?)?$/, '')}/v1/embeddings`;
  const response = await fetch(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(120_000),
    headers: { 'Content-Type': 'application/json', ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}) },
    body: JSON.stringify({ model: config.model, input: texts, dimensions: 1024 }) });
  if (!response.ok) throw new Error(`Embedding server returned ${response.status}`);
  const body = await response.json() as { data?: Array<{ index: number; embedding: number[] }> };
  const data = body.data?.sort((a, b) => a.index - b.index);
  if (!data || data.length !== texts.length || data.some((d, i) => d.index !== i || !Array.isArray(d.embedding) || d.embedding.length !== 1024 || d.embedding.some((n) => !Number.isFinite(n)))) throw new Error('Embedding server must return one finite 1024-dimensional vector per input.');
  return data.map((d) => d.embedding);
}
export function vectorLiteral(vector: number[]): string {
  if (vector.length !== 1024 || vector.some((n) => !Number.isFinite(n))) throw new Error('Invalid embedding vector.');
  return `[${vector.join(',')}]`;
}
