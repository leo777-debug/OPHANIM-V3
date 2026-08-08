import type { JsonObject } from './types';

export function text(value: unknown, label: string, maxLength = 1000, required = true): string | undefined {
  if (value === undefined || value === null || value === '') {
    if (required) throw new Error(`${label} is required.`);
    return undefined;
  }
  if (typeof value !== 'string') throw new Error(`${label} must be text.`);
  const result = value.trim();
  if (!result || result.length > maxLength) throw new Error(`${label} must be between 1 and ${maxLength} characters.`);
  return result;
}

export function key(value: unknown, label: string, maxLength = 120): string {
  const result = text(value, label, maxLength)!;
  if (!/^[a-z][a-z0-9_.-]*$/i.test(result)) throw new Error(`${label} contains unsupported characters.`);
  return result.toLowerCase();
}

export function uuid(value: unknown, label: string): string {
  const result = text(value, label, 36)!;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) throw new Error(`${label} must be a UUID.`);
  return result;
}

export function optionalDate(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error(`${label} must be an ISO date.`);
  return new Date(value).toISOString();
}

export function optionalScore(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const score = Number(value);
  if (!Number.isInteger(score) || score < 0 || score > 100) throw new Error(`${label} must be an integer from 0 to 100.`);
  return score;
}

export function object(value: unknown, label: string): JsonObject {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as JsonObject;
}

export function optionalUrl(value: unknown, label: string): string | undefined {
  const result = text(value, label, 2000, false);
  if (!result) return undefined;
  try {
    const url = new URL(result);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
    return url.toString();
  } catch {
    throw new Error(`${label} must be a safe HTTP(S) URL.`);
  }
}
