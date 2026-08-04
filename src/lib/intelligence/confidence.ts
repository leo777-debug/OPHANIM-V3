import type { SourceChainLabel } from '@/lib/dark-web/types';

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'insufficient';

export interface ConfidenceInput {
  matchStrength: number;
  sourceReliability: number;
  independentSourceCount: number;
  corroboratingSignals: number;
  observedAt?: string;
  evaluatedAt?: string;
  ambiguous?: boolean;
  sourceChainLabel?: SourceChainLabel;
  conflictingEvidence?: boolean;
}

export interface ConfidenceAssessment {
  score: number;
  level: ConfidenceLevel;
  breakdown: {
    matchStrength: number;
    sourceQuality: number;
    sourceIndependence: number;
    corroboration: number;
    recency: number;
    ambiguityPenalty: number;
    duplicationPenalty: number;
    conflictPenalty: number;
  };
}

const clamp = (value: number) => Math.min(100, Math.max(0, Math.round(value)));

function recencyScore(observedAt?: string, evaluatedAt = new Date().toISOString()): number {
  if (!observedAt) return 45;
  const age = Math.max(0, Date.parse(evaluatedAt) - Date.parse(observedAt));
  if (!Number.isFinite(age)) return 45;
  const days = age / 86_400_000;
  if (days <= 1) return 100;
  if (days <= 7) return 80;
  if (days <= 30) return 60;
  if (days <= 90) return 35;
  return 15;
}

export function classifyConfidence(score: number): ConfidenceLevel {
  if (score >= 75) return 'high';
  if (score >= 55) return 'medium';
  if (score >= 30) return 'low';
  return 'insufficient';
}

// This is evidence weighting, not a finding of truth or attribution.
export function assessConfidence(input: ConfidenceInput): ConfidenceAssessment {
  const matchStrength = clamp(input.matchStrength);
  const sourceQuality = clamp(input.sourceReliability);
  const sourceIndependence = clamp(Math.min(100, input.independentSourceCount * 34));
  const corroboration = clamp(Math.min(100, input.corroboratingSignals * 30));
  const recency = recencyScore(input.observedAt, input.evaluatedAt);
  const ambiguityPenalty = input.ambiguous ? 18 : 0;
  const duplicationPenalty = input.sourceChainLabel === 'likely_copy' ? 24 : input.sourceChainLabel === 'possible_copy' ? 12 : 0;
  const conflictPenalty = input.conflictingEvidence ? 30 : 0;
  const score = clamp(
    matchStrength * 0.42 + sourceQuality * 0.22 + sourceIndependence * 0.11 + corroboration * 0.13 + recency * 0.12
      - ambiguityPenalty - duplicationPenalty - conflictPenalty,
  );
  return { score, level: classifyConfidence(score), breakdown: { matchStrength, sourceQuality, sourceIndependence, corroboration, recency, ambiguityPenalty, duplicationPenalty, conflictPenalty } };
}
