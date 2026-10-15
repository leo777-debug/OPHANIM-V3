import { NextResponse } from 'next/server';
import { OrganizationAccessError } from '@/lib/operations/authorization';

export function platformError(error: unknown) {
  const message = error instanceof OrganizationAccessError ? 'Access is not permitted.' : 'Request could not be completed. Check the input or try again shortly.';
  const status = error instanceof OrganizationAccessError ? 403 : 400;
  return NextResponse.json({ error: message }, { status });
}
