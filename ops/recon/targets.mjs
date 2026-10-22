import { isIP } from 'node:net';
export const MODES = ['quick', 'headers', 'ssl', 'tech'];
export function canonicalTarget(value) {
  if (typeof value !== 'string' || value.length > 253) return null;
  const host = value.trim().toLowerCase();
  if (!host || /[\s\/:@?#\\]/.test(host) || host.endsWith('.') || host.includes('*')) return null;
  if (isIP(host) === 4) return host;
  if (/^[0-9.]+$/.test(host) || !host.includes('.')) return null;
  return host.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) ? host : null;
}
export function approvedTargets(value = '') {
  const parts = value.split(',').map(value => value.trim()).filter(Boolean);
  if (!parts.length || parts.length > 100 || parts.some(value => !canonicalTarget(value))) return [];
  return [...new Set(parts.map(canonicalTarget))];
}
