import type { NextRequest } from 'next/server';
import { boundedJson } from '@/lib/http/body';
import { mutation } from '@/lib/jobfile/context';
import { REFERENCE_TYPES, type ReferenceType } from '@/lib/jobfile/identifiers';
import { addReference, JobFileInputError, loadJob } from '@/lib/jobfile/service';
export const dynamic = 'force-dynamic';

export const POST = (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => mutation(request, 'shipment:write', async ctx => {
  const id = (await params).id, body = await boundedJson(request, 4000).catch(() => null) as { type?: string; value?: string } | null;
  if (!body || !REFERENCE_TYPES.includes(body.type as ReferenceType) || typeof body.value !== 'string' || !body.value.trim()) throw new JobFileInputError('A reference type and value are required.');
  if (!await loadJob(ctx, id)) throw new JobFileInputError('Job file not found.');
  return { reference: await addReference(ctx, id, body.type as ReferenceType, body.value.slice(0, 80), 'manual') };
}, 201);
