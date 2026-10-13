import type { OrganizationActor } from '@/lib/operations/types';
import { requireOrganizationAccess } from '@/lib/operations/authorization';
import { db } from '@/lib/watchlists/db';
import { shodanClient } from './client';
import { scanAllowlist, validateScanTargets } from './scan-guard';
import { ShodanError } from './types';

export async function submitScan(actor: OrganizationActor, input: Record<string, unknown>) {
  requireOrganizationAccess(actor, actor.organizationId, 'organization:manage');
  if (typeof input.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)) throw new ShodanError('invalid_request', 'Provide a unique UUID requestId for this confirmed scan.', 400);
  const { targets, hosts } = validateScanTargets(input.ips, input.confirm, scanAllowlist(actor.organizationId));
  // Reserve an audited submission before contacting Shodan. Replays never rescan.
  const connection = await db().connect();
  let auditId: string;
  try {
    await connection.query('begin');
    await connection.query('select pg_advisory_xact_lock(hashtext($1))', [`shodan:${actor.organizationId}:${input.requestId}`]);
    const existing = await connection.query<{ metadata: Record<string, unknown> }>(
      `select metadata from ophanim_audit_events where organization_id=$1 and subject_type='shodan_scan' and metadata->>'requestId'=$2`,
      [actor.organizationId, input.requestId]);
    if (existing.rows.length) {
      await connection.query('commit');
      const metadata = existing.rows[0].metadata;
      if (metadata.result) return metadata.result;
      throw new ShodanError('scan_pending', 'This submission is already recorded. Check its status or ask an administrator; do not resubmit.', 409);
    }
    const saved = await connection.query<{ id: string }>(
      `insert into ophanim_audit_events(organization_id,actor_user_id,action,subject_type,metadata) values($1,$2,'shodan.scan.started','shodan_scan',$3) returning id`,
      [actor.organizationId, actor.userId, JSON.stringify({ requestId: input.requestId, targets, estimatedHosts: hosts, submittedAt: new Date().toISOString() })]);
    auditId = saved.rows[0].id;
    await connection.query('commit');
  } catch (error) {
    await connection.query('rollback');
    throw error;
  } finally { connection.release(); }
  try {
    const result = await shodanClient().submitAuthorizedScan(targets, hosts, scanAllowlist(actor.organizationId), true);
    await db().query(`update ophanim_audit_events set action='shodan.scan.submitted',metadata=metadata || $3::jsonb where id=$1 and organization_id=$2`,
      [auditId, actor.organizationId, JSON.stringify({ scanId: result.id, result })]);
    console.info('[OPHANIM] Shodan scan submitted', { organizationId: actor.organizationId, userId: actor.userId, auditId, scanId: result.id, targets });
    return result;
  } catch (error) {
    const code = error instanceof ShodanError ? error.code : 'provider_down';
    await db().query(`update ophanim_audit_events set action='shodan.scan.unconfirmed',metadata=metadata || $3::jsonb where id=$1 and organization_id=$2`,
      [auditId, actor.organizationId, JSON.stringify({ errorCode: code })]).catch(() => {});
    throw error;
  }
}
export async function getScanStatus(actor: OrganizationActor, id: string) {
  requireOrganizationAccess(actor, actor.organizationId, 'cyber:read');
  const record = await db().query(`select id from ophanim_audit_events where organization_id=$1 and action='shodan.scan.submitted' and metadata->>'scanId'=$2 limit 1`, [actor.organizationId, id]);
  if (!record.rows.length) throw new ShodanError('no_information', 'This workspace has no recorded Shodan scan with that ID.', 404);
  return shodanClient().scanStatus(id);
}
