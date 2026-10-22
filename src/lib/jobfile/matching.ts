// Attach incoming email, photos and messages to the job whose key ring holds
// their reference numbers. Anything ambiguous or unmatched goes to review with reasons.
import type { FoundReference, ReferenceType } from './identifiers';

export type KeyRingEntry = { jobFileId: string; jobNumber: string; type: ReferenceType; normalizedValue: string };
export type MatchCandidate = { jobFileId: string; jobNumber: string; score: number; reasons: string[] };
export type MatchDecision = { status: 'matched' | 'review'; jobFileId: string | null; candidates: MatchCandidate[]; reason: 'single_strong_match' | 'ambiguous' | 'weak' | 'no_match' };

const WEIGHT: Record<ReferenceType, number> = { awb: 1, bl: 1, hawb: 0.9, hbl: 0.9, container: 0.8, booking: 0.7, delivery_order: 0.7, invoice: 0.6, customs_dec: 0.8, client_ref: 0.5, other: 0.3 };
const LABEL: Record<ReferenceType, string> = { awb: 'AWB', hawb: 'House AWB', bl: 'B/L', hbl: 'House B/L', container: 'Container', booking: 'Booking', invoice: 'Invoice', customs_dec: 'Customs declaration', delivery_order: 'Delivery order', client_ref: 'Client reference', other: 'Reference' };
// Container and AWB numbers can appear under a looser type in free text.
const COMPATIBLE: Partial<Record<ReferenceType, ReferenceType[]>> = { awb: ['awb', 'hawb'], hawb: ['hawb', 'awb'], bl: ['bl', 'hbl', 'booking'], hbl: ['hbl', 'bl'], booking: ['booking', 'bl'] };

export function matchReferences(found: FoundReference[], keyRing: KeyRingEntry[]): MatchDecision {
  const byJob = new Map<string, MatchCandidate>();
  for (const reference of found) {
    const types = COMPATIBLE[reference.type] ?? [reference.type];
    for (const entry of keyRing) {
      if (entry.normalizedValue !== reference.validation.normalized || !types.includes(entry.type)) continue;
      const candidate = byJob.get(entry.jobFileId) ?? { jobFileId: entry.jobFileId, jobNumber: entry.jobNumber, score: 0, reasons: [] };
      const weight = WEIGHT[entry.type] * (reference.validation.valid ? 1 : 0.3);
      candidate.score = Math.min(1.5, candidate.score + weight);
      candidate.reasons.push(`${LABEL[entry.type]} ${entry.normalizedValue} is on ${entry.jobNumber}'s key ring${reference.validation.valid ? '' : ' (number failed validation)'}`);
      byJob.set(entry.jobFileId, candidate);
    }
  }
  const candidates = [...byJob.values()].map(candidate => ({ ...candidate, score: Math.round(candidate.score * 100) / 100 })).sort((a, b) => b.score - a.score);
  if (!candidates.length) return { status: 'review', jobFileId: null, candidates, reason: 'no_match' };
  const [top, next] = candidates;
  if (top.score >= 0.8 && (!next || next.score < top.score * 0.5)) return { status: 'matched', jobFileId: top.jobFileId, candidates, reason: 'single_strong_match' };
  return { status: 'review', jobFileId: null, candidates, reason: next ? 'ambiguous' : 'weak' };
}
