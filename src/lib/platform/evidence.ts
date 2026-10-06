import { createHash } from 'node:crypto';
import { db } from '@/lib/db/pool';
import type { OrganizationActor } from '@/lib/operations/types';
import type { EvidenceInput } from './types';
import { key, object, optionalDate, optionalUrl, text, uuid } from './validation';

type EvidenceLink = { resourceType: 'entity' | 'event' | 'case' | 'task' | 'assessment'; resourceId: string };

export function parseEvidenceInput(value: unknown): EvidenceInput {
  const input = object(value, 'Evidence');
  const verificationState = input.verificationState ?? 'source_record';
  if (!['source_record', 'externally_reported', 'user_submitted', 'calculated', 'ai_generated', 'analyst_verified', 'disputed'].includes(String(verificationState))) throw new Error('Evidence verification state is invalid.');
  const links = input.links === undefined ? [] : Array.isArray(input.links) ? input.links.map((item) => {
    const link = object(item, 'Evidence link');
    if (!['entity', 'event', 'case', 'task', 'assessment'].includes(String(link.resourceType))) throw new Error('Evidence link type is invalid.');
    return { resourceType: link.resourceType as EvidenceLink['resourceType'], resourceId: uuid(link.resourceId, 'Evidence link ID') };
  }).slice(0, 100) : (() => { throw new Error('Evidence links must be an array.'); })();
  return { evidenceType: key(input.evidenceType, 'Evidence type'), verificationState: verificationState as EvidenceInput['verificationState'], title: text(input.title, 'Evidence title', 1000)!, description: text(input.description, 'Evidence description', 10000, false), sourceId: input.sourceId ? key(input.sourceId, 'Source ID') : undefined, providerId: input.providerId ? key(input.providerId, 'Provider ID') : undefined, sourceUrl: optionalUrl(input.sourceUrl, 'Source URL'), attachmentUrl: optionalUrl(input.attachmentUrl, 'Attachment URL'), originalTimestamp: optionalDate(input.originalTimestamp, 'Original timestamp'), metadata: object(input.metadata, 'Evidence metadata'), links };
}

export async function createEvidence(actor: OrganizationActor, value: unknown) {
  const input = parseEvidenceInput(value);
  const client = await db().connect();
  try {
    await client.query('begin');
    const contentHash = createHash('sha256').update(JSON.stringify({ title: input.title, description: input.description, sourceUrl: input.sourceUrl, metadata: input.metadata })).digest('hex');
    const result = await client.query<{ id: string }>(`insert into ophanim_evidence(organization_id,evidence_type,verification_state,source_id,provider_id,title,description,source_url,attachment_url,content_hash,original_timestamp,created_by_user_id,metadata) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`, [actor.organizationId, input.evidenceType, input.verificationState, input.sourceId ?? null, input.providerId ?? null, input.title, input.description ?? null, input.sourceUrl ?? null, input.attachmentUrl ?? null, contentHash, input.originalTimestamp ?? null, actor.userId, JSON.stringify(input.metadata ?? {})]);
    const id = result.rows[0].id;
    for (const link of input.links ?? []) await client.query(`insert into ophanim_evidence_links(evidence_id,resource_type,resource_id) values($1,$2,$3)`, [id, link.resourceType, link.resourceId]);
    await client.query('commit');
    return { id, ...input, contentHash };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally { client.release(); }
}

export async function listEvidence(actor: OrganizationActor, resourceType?: string, resourceId?: string) {
  const values: unknown[] = [actor.organizationId];
  let filter = 'e.organization_id=$1';
  if (resourceType && resourceId) {
    values.push(resourceType, resourceId);
    filter += ` and exists (select 1 from ophanim_evidence_links link where link.evidence_id=e.id and link.resource_type=$2 and link.resource_id=$3)`;
  }
  const result = await db().query(`select e.* from ophanim_evidence e where ${filter} order by e.created_at desc limit 100`, values);
  return result.rows;
}
