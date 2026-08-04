import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { listDarkWebMentions } from '@/lib/dark-web/mention-store';

export async function GET(request: NextRequest) { try { const limit = Number(new URL(request.url).searchParams.get('limit') ?? 100); return NextResponse.json({ mentions: await listDarkWebMentions(await requireAuthenticatedActor(request, 'intelligence:read'), limit) }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Mention request failed.' }, { status: error instanceof OrganizationAccessError ? 401 : 400 }); } }
