import type { NextRequest } from 'next/server';
import { query } from '@/lib/jobfile/context';
import { JobFileInputError } from '@/lib/jobfile/service';
import { setupStatus } from '@/lib/jobfile/setup';
import { can } from '@/lib/operations/authorization';
export const dynamic = 'force-dynamic';

/** Setup status for admins: which job-file integrations are configured (presence only, never values). */
export const GET = (request: NextRequest) => query(request, 'shipment:read', async ctx => {
  if (!ctx.actor.demo && !can(ctx.actor, 'jobfile:approve')) throw new JobFileInputError('Only an owner or operations manager can see setup status.');
  return { integrations: setupStatus() };
});
