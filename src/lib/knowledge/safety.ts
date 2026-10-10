import type { ExtractedBlock, KnowledgeChunk, KnowledgeStatement, SharedMetadata } from './types';
import { createHash } from 'node:crypto';

export const NOT_FOUND = "I couldn't find this in your documents or Ophanim's knowledge";

// English/Arabic patterns plus role delimiters. Sanitisation is deliberately not
// advertised as a complete semantic injection detector; output has a quote gate.
export function neutraliseInstructions(text: string): string {
  return text.normalize('NFKC').replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .split('\n').filter((line) => !/(ignore\s+(all\s+)?(previous|prior|system)|system\s*prompt|developer\s*message|(?:send|reveal|exfiltrate).*(secret|password|api.key)|تجاهل.*(تعليمات|السابق)|اكشف.*(سر|مفتاح)|<\|(?:im_start|im_end|system)|\[INST\])/i.test(line)).join('\n').trim();
}

export function splitBlocks(blocks: ExtractedBlock[], max = 2400): ExtractedBlock[] {
  const chunks: ExtractedBlock[] = [];
  for (const block of blocks) {
    const text = neutraliseInstructions(block.text).replace(/\r/g, '').trim();
    if (!text) continue;
    // Keep ordinary tables atomic; very large tables split by rows with headings.
    let current = '';
    for (const line of text.split('\n')) {
      if (current.length + line.length + 1 > max && current) { chunks.push({ ...block, text: current }); current = ''; }
      for (let i = 0; i < line.length; i += max) {
        const part = line.slice(i, i + max);
        if (current.length + part.length + 1 > max && current) { chunks.push({ ...block, text: current }); current = ''; }
        current += `${current ? '\n' : ''}${part}`;
      }
    }
    if (current) chunks.push({ ...block, text: current });
  }
  return chunks;
}
export function hashContent(bytes: Uint8Array | string): string { return createHash('sha256').update(bytes).digest('hex'); }

export function validateSharedMetadata(value: unknown): SharedMetadata {
  const m = value as SharedMetadata;
  if (!m || m.commercial_use !== true || m.customer_data !== false || !m.licence?.trim() || /unknown|non.commercial/i.test(m.licence)
    || !m.source || !m.attribution || !m.region || !m.language || !m.reviewed_at || !m.published_at || !m.valid_from) throw new Error('Shared data requires reviewed commercial rights, attribution, dates and no customer data.');
  for (const url of [m.source_url, m.licence_url]) if (!url || !/^https?:\/\//.test(url)) throw new Error('Source and licence URLs are required.');
  for (const date of [m.reviewed_at, m.published_at, m.valid_from, m.valid_to]) if (date && !Number.isFinite(Date.parse(date))) throw new Error('Invalid source date.');
  if (m.valid_to && Date.parse(m.valid_to) < Date.parse(m.valid_from)) throw new Error('Invalid validity range.');
  if (m.knowledge_period !== undefined && !['past','present'].includes(m.knowledge_period)) throw new Error('Invalid shared knowledge period.');
  return m;
}

export function validateGroundedAnswer(output: string, chunks: KnowledgeChunk[]): KnowledgeStatement[] {
  const parsed = JSON.parse(output) as { statements?: KnowledgeStatement[] };
  if (!Array.isArray(parsed.statements) || parsed.statements.length > 12) throw new Error('Invalid grounded answer schema.');
  const sources = new Map(chunks.map((chunk) => [chunk.id, neutraliseInstructions(chunk.content)]));
  return parsed.statements.map((statement) => {
    if (!['FACT', 'INFERENCE', 'NOT FOUND'].includes(statement.label) || typeof statement.text !== 'string' || !Array.isArray(statement.citations)) throw new Error('Invalid statement.');
    if (statement.label === 'NOT FOUND') return { label: 'NOT FOUND', text: NOT_FOUND, citations: [] };
    if (!statement.citations.length || statement.citations.some((id) => !sources.has(id))) throw new Error('Unknown or missing citation.');
    // Fail closed: factual text itself must be verbatim supporting source text.
    // Free-form paraphrases/inferences cannot be automatically proven by a small
    // model and are rejected here until a separately evaluated verifier exists.
    if (statement.label !== 'FACT' || !statement.quote || statement.text !== statement.quote || !statement.citations.every((id) => sources.get(id)!.includes(statement.quote!))) throw new Error('Unsupported claim or inference.');
    if (statement.text.length > 900 || statement.text.length < 3) throw new Error('Invalid evidence quote.');
    return statement;
  });
}
