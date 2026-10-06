import { NextResponse } from 'next/server';
import { OrganizationAccessError } from '@/lib/operations/authorization';

export function platformError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Platform request failed.';
  const status = error instanceof OrganizationAccessError ? 403 : 400;
  return NextResponse.json({ error: message }, { status });
}
