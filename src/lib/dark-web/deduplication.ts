import type { NormalizedMention, SourceChainLabel } from './types';

export interface MentionDuplicateCandidate { id: string; contentHash: string; title?: string; originalText: string; sourceName: string; sourceReference?: string; publishedAt?: string; }
export interface DuplicateAssessment { label: SourceChainLabel; similarity: number; rationale: Record<string, unknown>; anchorMentionId?: string; }
function tokens(value: string): Set<string> { return new Set(value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((token) => token.length > 2)); }
function similarity(left: string, right: string): number { const a = tokens(left); const b = tokens(right); const shared = [...a].filter((token) => b.has(token)).length; return a.size || b.size ? shared / (a.size + b.size - shared) : 0; }
function timingNear(left?: string, right?: string): boolean { return Boolean(left && right && Math.abs(Date.parse(left) - Date.parse(right)) <= 1000 * 60 * 60 * 72); }
export function assessSourceChain(mention: NormalizedMention, existing: MentionDuplicateCandidate[]): DuplicateAssessment {
  let best: { candidate: MentionDuplicateCandidate; score: number; sharedReference: boolean } | undefined;
  for (const candidate of existing) { const score = candidate.contentHash === mention.contentHash ? 1 : similarity(`${candidate.title ?? ''} ${candidate.originalText}`, `${mention.title ?? ''} ${mention.originalText}`); const sharedReference = Boolean(candidate.sourceReference && mention.sourceReference && candidate.sourceReference === mention.sourceReference); if (!best || score > best.score) best = { candidate, score, sharedReference }; }
  if (!best || best.score < 0.35) return { label: 'independent_source', similarity: best?.score ?? 0, rationale: { reason: 'No material text overlap with known mentions.' } };
  if (best.score === 1) return { label: 'likely_copy', similarity: 1, anchorMentionId: best.candidate.id, rationale: { reason: 'Exact normalized content hash match.' } };
  if (best.score >= 0.78 && (best.sharedReference || timingNear(best.candidate.publishedAt, mention.publishedAt))) return { label: 'likely_copy', similarity: best.score, anchorMentionId: best.candidate.id, rationale: { reason: 'High text overlap with shared reference or near publication time.' } };
  return { label: 'possible_copy', similarity: best.score, anchorMentionId: best.candidate.id, rationale: { reason: 'Material text overlap; original-source relationship remains uncertain.' } };
}
