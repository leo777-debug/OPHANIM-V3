import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('every exported HTTP method has a reviewed policy and no inventory drift', async () => {
  const { endpointPolicies } = await import('../../../STRESS_TEST/endpoint-policy.mjs');
  const current = endpointPolicies();
  const saved = JSON.parse(readFileSync('STRESS_TEST/endpoint-policies.json', 'utf8'));
  expect(current).toEqual(saved);
  expect(new Set(current.map((entry: { method: string; path: string }) => `${entry.method} ${entry.path}`)).size).toBe(current.length);
});
