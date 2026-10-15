import { describe, expect, it } from 'vitest';
import { platformError } from '@/lib/platform/http';
import { knowledgeError } from '@/lib/knowledge/http';
import { KnowledgeInputError } from '@/lib/knowledge/errors';
import { OrganizationAccessError } from '@/lib/operations/authorization';
describe('private operational error boundary', () => {
  it.each([platformError,knowledgeError])('never returns exception contents, stack, URL credentials or file paths', async (handler) => {
    const response=handler(new Error('synthetic-private-marker postgres://synthetic:test@db/private /tenant-b/file.txt'));
    expect(await response.text()).not.toContain('synthetic-private-marker');
  });
  it('preserves safe input explanations and permission denial', async () => {
    const invalid=knowledgeError(new KnowledgeInputError('Invalid document date.'));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({error:'Invalid document date.'});
    expect(knowledgeError(new OrganizationAccessError()).status).toBe(403);
  });
});
