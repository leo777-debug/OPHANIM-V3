import { createHash } from 'node:crypto';
import type { DarkWebRawMention, NormalizedMention } from './types';

function plainText(value: string | undefined, max: number): string | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  return normalized || undefined;
}

export function safeSourceReference(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : undefined; }
  catch { return undefined; }
}

export function normalizeMention(providerId: string, raw: DarkWebRawMention): NormalizedMention {
  const originalText = plainText(raw.originalText, 20_000) ?? '';
  if (!originalText) throw new Error('Provider mention did not contain safe text.');
  const title = plainText(raw.title, 1000);
  return {
    ...raw,
    providerId,
    providerDocumentId: plainText(raw.providerDocumentId, 500) ?? createHash('sha256').update(originalText).digest('hex'),
    sourceName: plainText(raw.sourceName, 240) ?? 'Unknown source',
    sourceReference: safeSourceReference(raw.sourceReference),
    originalText,
    translatedText: plainText(raw.translatedText, 20_000),
    title,
    originalLanguage: plainText(raw.originalLanguage, 24),
    sourceReliability: Math.min(100, Math.max(0, Math.round(Number(raw.sourceReliability) || 0))),
    matchedIdentifiers: [...new Set((raw.matchedIdentifiers ?? []).map((value) => plainText(value, 500)).filter((value): value is string => Boolean(value)))],
    threatCategories: [...new Set(raw.threatCategories.map((value) => plainText(value, 80)).filter((value): value is string => Boolean(value)))],
    contentHash: createHash('sha256').update(`${title ?? ''}\n${originalText}`).digest('hex'),
    reviewStatus: 'new',
    sourceChainLabel: 'relationship_unknown',
    independentSourceCount: 0,
  };
}
