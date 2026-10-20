import { headers } from 'next/headers';
import { NextRequest } from 'next/server';
import { redirect } from 'next/navigation';
import { getAuthenticatedActor } from '@/lib/auth/actor';
import { can } from '@/lib/operations/authorization';

export async function presentationPageOwner() {
  const actor = await getAuthenticatedActor(new NextRequest('http://ophanim.internal/admin/presentation', { headers: await headers() }));
  if (!actor) redirect('/login?admin=1');
  return can(actor, 'organization:manage') ? actor : null;
}
