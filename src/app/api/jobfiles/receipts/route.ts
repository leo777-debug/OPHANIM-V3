import type { NextRequest } from 'next/server';
import { query } from '@/lib/jobfile/context';
import { checkingOurWork } from '@/lib/jobfile/receipts';
export const dynamic = 'force-dynamic';

/** "Checking our work": calibration, Brier score, coverage and baseline per prediction type (internal). */
export const GET = (request: NextRequest) => query(request, 'shipment:read', async ctx => ({ types: await checkingOurWork(ctx) }));
