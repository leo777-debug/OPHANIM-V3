import { NextRequest } from 'next/server';
import { history } from '@/lib/verify/store';
import { errorResponse, jsonResponse, requestContext } from '@/lib/verify/http';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  try { const { actor } = await requestContext(request);
    if (!actor) return jsonResponse({ results: [], available: false, reason: process.env.DATABASE_URL ? 'Sign in to see your check history.' : 'Persisted history unavailable: DATABASE_URL is not configured.' });
    return jsonResponse({ results: await history(actor), available: true, reason: '' });
  } catch (error) { return errorResponse(error); }
}
