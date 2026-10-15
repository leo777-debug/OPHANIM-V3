import { KnowledgeInputError } from './errors';
import type { OrganizationActor } from '@/lib/operations/types';
import { knowledgeTransaction } from './database';
import { embedTexts, vectorLiteral } from './embeddings';
import { getEmbeddingSettings } from './settings';
import type { KnowledgeChunk, KnowledgeFilters } from './types';

export function reciprocalRankFusion(lists: KnowledgeChunk[][], limit = 8): KnowledgeChunk[] {
  const scores = new Map<string, KnowledgeChunk>();
  for (const list of lists) list.forEach((item, index) => {
    const previous = scores.get(item.id);
    scores.set(item.id, { ...item, score: (previous?.score ?? 0) + 1 / (60 + index + 1) });
  });
  return [...scores.values()].sort((a, b) => (b.score! - a.score!) || String(b.published_at ?? '').localeCompare(String(a.published_at ?? ''))).slice(0, limit);
}
export function parseFilters(value: unknown): KnowledgeFilters {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object') throw new KnowledgeInputError('Invalid search filters.');
  const f = value as KnowledgeFilters;
  if (f.asOf && (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(f.asOf) || !Number.isFinite(Date.parse(f.asOf)))) throw new KnowledgeInputError('Invalid as-of date.');
  if (f.currentOnly !== undefined && typeof f.currentOnly !== 'boolean') throw new KnowledgeInputError('Invalid current-only filter.');
  if (f.currentOnly && f.asOf) throw new KnowledgeInputError('Choose current-only or as-of, not both.');
  if (f.documentTypes && (!Array.isArray(f.documentTypes) || f.documentTypes.length > 20 || f.documentTypes.some((t) => typeof t !== 'string' || t.length > 80))) throw new KnowledgeInputError('Invalid document types.');
  if (f.shipmentId && !/^[a-f0-9-]{36}$/i.test(f.shipmentId)) throw new KnowledgeInputError('Invalid shipment ID.');
  return { asOf: f.asOf, currentOnly: f.currentOnly, documentTypes: f.documentTypes, shipmentId: f.shipmentId };
}

export async function searchKnowledge(actor: OrganizationActor, question: string, filters: KnowledgeFilters = {}, options: {useEmbeddings?: boolean} = {}) {
  let vector: number[] | null = null; let warning: string | null = null;
  let embeddingModel: string | null = null;
  if(options.useEmbeddings !== false) {
    const settings=await getEmbeddingSettings(actor.organizationId,actor); embeddingModel=settings.model;
    try { [vector] = await embedTexts([`Instruct: Retrieve documents answering the question.\nQuery: ${question}`],settings); }
    catch { warning = 'Embedding server unavailable; searched full text only.'; }
  } else warning='Source-only search; no AI model was called.';
  const chunks = await knowledgeTransaction(actor, async (client) => {
    const values = [question, filters.documentTypes?.length ? filters.documentTypes : null, filters.asOf ?? null, filters.currentOnly ?? false, filters.shipmentId ?? null];
    // RLS enforces tenant access even without an organization predicate.
    const predicate = `d.status='ready'
      and ($2::text[] is null or c.document_type=any($2))
      and ($5::uuid is null or d.shipment_id=$5 or d.organization_id is null)
      and ($3::timestamptz is null or (c.published_at <= $3 and c.valid_from <= $3 and (c.valid_to is null or c.valid_to >= $3)))
      and (not $4::boolean or (coalesce(d.metadata->>'knowledge_period','')<>'past' and c.published_at <= now() and c.valid_from <= now() and (c.valid_to is null or c.valid_to >= now())))`;
    const lexical = await client.query<KnowledgeChunk>(`select c.*, ts_rank_cd(c.search_vector,websearch_to_tsquery('simple',$1)) as score
      from ophanim_knowledge_chunks c join ophanim_knowledge_documents d on d.id=c.document_id
      where ${predicate} and c.search_vector @@ websearch_to_tsquery('simple',$1)
      order by score desc, c.published_at desc nulls last limit 32`, values);
    let semantic: KnowledgeChunk[] = [];
    if (vector) {
      const result = await client.query<KnowledgeChunk>(`select c.*, 1-(e.embedding <=> $1::vector) as score
        from ophanim_knowledge_chunks c join ophanim_knowledge_documents d on d.id=c.document_id
        join ophanim_knowledge_embeddings e on e.chunk_id=c.id
        where ${predicate} and e.model=$6 and (e.embedding <=> $1::vector)<0.65
        order by e.embedding <=> $1::vector, c.published_at desc nulls last limit 32`, [vectorLiteral(vector), ...values.slice(1), embeddingModel]);
      semantic = result.rows;
    }
    return reciprocalRankFusion([lexical.rows, semantic]);
  });
  return { chunks, warning, searched: { question, filters, scopes: ['your organization', 'shared knowledge'] } };
}
