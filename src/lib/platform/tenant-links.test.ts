import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn() }));
vi.mock('@/lib/db/pool', () => ({ db: () => ({ query: mocks.query, connect: async () => ({ query: mocks.query, release: mocks.release }) }) }));
import { createEvidence } from './evidence';
import { createCase, createCaseTask, getCase } from './workflows';
const actor = { organizationId: 'org-a', userId: 'user-a', role: 'owner' as const };
const id = '11111111-1111-4111-8111-111111111111';
beforeEach(() => { vi.clearAllMocks(); mocks.query.mockResolvedValue({ rows: [], rowCount: 0 }); });

it.each(['case', 'entity', 'event', 'task', 'assessment'])('rejects an inaccessible %s before inserting evidence', async (resourceType) => {
  await expect(createEvidence(actor, { evidenceType: 'manual', title: 'Synthetic evidence', metadata: {}, links: [{ resourceType, resourceId: id }] })).rejects.toThrow('Evidence target was not found');
  expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('select 1'), [id, 'org-a']);
  expect(mocks.query.mock.calls.some(([sql]) => sql.includes('insert into ophanim_evidence'))).toBe(false);
  expect(mocks.query).toHaveBeenLastCalledWith('rollback'); expect(mocks.release).toHaveBeenCalledOnce();
});
it('preserves valid same-organization evidence links', async () => {
  mocks.query.mockImplementation(async (sql: string) => sql.startsWith('select 1') ? { rows: [{}], rowCount: 1 } : sql.startsWith('insert into ophanim_evidence(') ? { rows: [{ id }], rowCount: 1 } : { rows: [], rowCount: 0 });
  const saved = await createEvidence(actor, { evidenceType: 'manual', title: 'Synthetic evidence', metadata: {}, links: [{ resourceType: 'case', resourceId: id }] });
  expect(saved.id).toBe(id); expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('insert into ophanim_evidence_links'), [id, 'case', id]);
  expect(mocks.query).toHaveBeenLastCalledWith('commit');
});
it('rejects a foreign workflow template before creating a case', async () => {
  await expect(createCase(actor, { title: 'Synthetic case', workflowTemplateId: id })).rejects.toThrow('Workflow template was not found');
  expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('organization_id=$2 or organization_id is null'), [id, 'org-a']);
  expect(mocks.query.mock.calls.some(([sql]) => sql.includes('insert into ophanim_cases'))).toBe(false);
});
it('rejects an assignee who is not a member of the case organization', async () => {
  mocks.query.mockImplementation(async (sql: string) => sql.includes('from ophanim_cases') ? { rows: [{}], rowCount: 1 } : { rows: [], rowCount: 0 });
  await expect(createCaseTask(actor, id, { title: 'Synthetic task', assigneeUserId: id })).rejects.toThrow('Task assignee must belong');
  expect(mocks.query.mock.calls.some(([sql]) => sql.includes('insert into ophanim_case_tasks'))).toBe(false);
});
it('scopes child evidence, entities and events when reading a case', async () => {
  mocks.query.mockResolvedValueOnce({ rows: [{ id }], rowCount: 1 });
  await getCase(actor, id);
  for (const table of ['ophanim_entities', 'ophanim_events', 'ophanim_evidence']) {
    const child = mocks.query.mock.calls.find(([sql]) => sql.includes(`join ${table}`));
    expect(child?.[0]).toContain('organization_id=$2'); expect(child?.[1]).toEqual([id, 'org-a']);
  }
});
