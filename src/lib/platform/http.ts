import { NextResponse } from 'next/server';
import { OrganizationAccessError } from '@/lib/operations/authorization';

export function platformError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Platform request failed.';
  const status = error instanceof OrganizationAccessError ? message === 'Authentication is required.' ? 401 : 403 : 400;
  return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'private, no-store' } });
}
