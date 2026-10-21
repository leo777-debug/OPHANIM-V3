import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { isFeatureEnabled } from '@/lib/operations/feature-flags';
import type { OrganizationPermission } from '@/lib/operations/types';
import { sameOrigin } from '@/lib/http/origin';
import { memoryRepo, postgresRepo, type Repo } from './repo';
import { JobFileInputError } from './service';
import type { Ctx } from './types';

export const DEMO_ORGANIZATION_ID = '5e7d0000-0000-4000-8000-000000000001';
export const DEMO_USER_ID = '5e7d0000-0000-4000-8000-0000000000aa';
export const headers = { 'Cache-Control': 'private, no-store' };

let databaseRepo: Repo | undefined;
// Route bundles do not share module state in development, so the demo store lives on globalThis.
const demoState = ((globalThis as { __ophanimJobDemo?: { repo?: Repo; seeded?: Promise<void> } }).__ophanimJobDemo ??= {});
/** Demo mode: no database configured. Only SYNTHETIC DEMO data exists, in process memory. */
export const isDemoMode = () => !process.env.DATABASE_URL;

export async function demoContext(): Promise<Ctx> {
  demoState.repo ??= memoryRepo();
  const ctx: Ctx = { repo: demoState.repo, actor: { organizationId: DEMO_ORGANIZATION_ID, userId: DEMO_USER_ID, role: 'owner', demo: true, displayName: 'Demo operator' } };
  demoState.seeded ??= import('./demo').then(module => module.seedDemo(ctx));
  await demoState.seeded;
  return ctx;
}

export class FeatureDisabledError extends Error {}
export async function jobContext(request: NextRequest, permission: OrganizationPermission): Promise<Ctx> {
  if (!isFeatureEnabled('job_files')) throw new FeatureDisabledError('Job files are not enabled for this edition.');
  if (isDemoMode()) return demoContext();
  const actor = await requireAuthenticatedActor(request, permission);
  databaseRepo ??= postgresRepo();
  return { repo: databaseRepo, actor: { ...actor, demo: false } };
}

/** Cron routes need their own dedicated JOBFILE_CRON_SECRET bearer token. */
export function cronAuthorized(request: NextRequest) {
  const secret = process.env.JOBFILE_CRON_SECRET, supplied = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  return Boolean(secret && supplied.length === secret.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(secret)));
}

/** Webhook/cron context for one organization: no user, writes still organization-scoped. */
export async function systemContext(organizationId: string): Promise<Ctx> {
  if (isDemoMode()) return demoContext();
  databaseRepo ??= postgresRepo();
  return { repo: databaseRepo, actor: { organizationId, userId: '00000000-0000-0000-0000-000000000000', role: 'operations_manager', demo: false, system: true } };
}

export function jobError(error: unknown) {
  const status = error instanceof OrganizationAccessError ? 403 : error instanceof FeatureDisabledError ? 404 : error instanceof JobFileInputError ? 400 : 503;
  const message = error instanceof OrganizationAccessError ? 'Sign in with permission to access your organization’s job files.'
    : error instanceof FeatureDisabledError || error instanceof JobFileInputError ? error.message
    : 'Job file storage unavailable. Configure the database and apply the job-file migrations.';
  if (status === 503) console.error('[jobfiles]', error instanceof Error ? error.message : 'unknown error');
  return NextResponse.json({ error: message }, { status, headers });
}

/** Wrap a mutating handler: same-origin only, authenticated, feature-gated. */
export async function mutation(request: NextRequest, permission: OrganizationPermission, handler: (ctx: Ctx) => Promise<unknown>, status = 200) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ error: 'Cross-origin request blocked.' }, { status: 403, headers });
    const ctx = await jobContext(request, permission);
    return NextResponse.json({ ...(await handler(ctx) as object), demo: ctx.actor.demo }, { status, headers });
  } catch (error) { return jobError(error); }
}
export async function query(request: NextRequest, permission: OrganizationPermission, handler: (ctx: Ctx) => Promise<unknown>) {
  try {
    const ctx = await jobContext(request, permission);
    return NextResponse.json({ ...(await handler(ctx) as object), demo: ctx.actor.demo }, { headers });
  } catch (error) { return jobError(error); }
}
