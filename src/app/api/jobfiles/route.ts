import type { NextRequest } from 'next/server';
import { boundedJson } from '@/lib/http/body';
import { mutation, query } from '@/lib/jobfile/context';
import { createJobFile, JobFileInputError, listJobs, parseJobInput } from '@/lib/jobfile/service';
export const dynamic = 'force-dynamic';

export const GET = (request: NextRequest) => query(request, 'shipment:read', async ctx => ({ jobs: await listJobs(ctx) }));
export const POST = (request: NextRequest) => mutation(request, 'shipment:write', async ctx => {
  let body: unknown; try { body = await boundedJson(request, 16000); } catch { throw new JobFileInputError('A JSON body of at most 16 KB is required.'); }
  return { job: await createJobFile(ctx, parseJobInput(body)) };
}, 201);
