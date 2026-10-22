import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db/pool';
import { cronAuthorized, headers, jobError, query, systemContext } from '@/lib/jobfile/context';
import { buildDigest, sendDigest } from '@/lib/jobfile/digest';
export const dynamic = 'force-dynamic';

/** Preview today's digest for the signed-in organization. */
export const GET = (request: NextRequest) => query(request, 'shipment:read', async ctx => ({ digest: await buildDigest(ctx) }));

/** Cron (JOBFILE_CRON_SECRET): send each organization's digest to its owners and operations managers. */
export async function POST(request: NextRequest) {
  try {
    if (!cronAuthorized(request)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401, headers });
    const organizations = (await db().query<{ organization_id: string; emails: string[] }>(
      `select m.organization_id, array_agg(distinct u.email) filter (where u.email is not null) as emails from ophanim_organization_memberships m join ophanim_users u on u.id = m.user_id
       where m.role in ('owner','operations_manager') and exists (select 1 from ophanim_job_files j where j.organization_id = m.organization_id) group by m.organization_id`)).rows;
    const whatsapp = (process.env.JOBFILE_DIGEST_WHATSAPP_TO ?? '').split(',').map(value => value.trim()).filter(Boolean);
    const results = [];
    for (const organization of organizations) {
      const ctx = await systemContext(organization.organization_id);
      const sent = await sendDigest(ctx, { emails: organization.emails ?? [], whatsapp: organization.organization_id === process.env.WHATSAPP_ORGANIZATION_ID ? whatsapp : [] });
      results.push({ organizationId: organization.organization_id, count: sent.count, sent: sent.sent, stub: sent.stub });
    }
    return NextResponse.json({ results }, { headers });
  } catch (error) { return jobError(error); }
}
