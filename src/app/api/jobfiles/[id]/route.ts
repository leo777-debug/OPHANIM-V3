import type { NextRequest } from 'next/server';
import { query } from '@/lib/jobfile/context';
import { JobFileInputError } from '@/lib/jobfile/service';
import { jobView } from '@/lib/jobfile/view';
export const dynamic = 'force-dynamic';

export const GET = (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => query(request, 'shipment:read', async ctx => {
  const view = await jobView(ctx, (await params).id);
  if (!view) throw new JobFileInputError('Job file not found.');
  return view;
});
