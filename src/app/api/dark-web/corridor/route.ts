import { NextResponse, type NextRequest } from 'next/server';
import { requireAuthenticatedActor } from '@/lib/auth/actor';
import { OrganizationAccessError } from '@/lib/operations/authorization';
import { db } from '@/lib/watchlists/db';
import { corridorIntelligence, darkWebFeatures } from '@/lib/dark-web/deep-watch';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ?shipmentId= or ?jobFileId= → dark-web mentions on that route's entities plus signal assessments (Route Lens layer). */
export async function GET(request: NextRequest) {
  try {
    const actor = await requireAuthenticatedActor(request, 'intelligence:read'), params = request.nextUrl.searchParams;
    const shipmentId = params.get('shipmentId'), jobFileId = params.get('jobFileId');
    let subjectId: string, terms: string[];
    if (shipmentId && uuid.test(shipmentId)) {
      const [row] = (await db().query<Record<string, string | null>>(`select shipment_reference, container_number, bill_of_lading_reference, carrier, vessel_name, imo_number, mmsi_number, origin_port_code, origin_port_name, destination_port_code, destination_port_name, customer_contact
        from ophanim_shipments where id = $1 and organization_id = $2`, [shipmentId, actor.organizationId])).rows;
      if (!row) return NextResponse.json({ error: 'Shipment not found.' }, { status: 404, headers });
      subjectId = shipmentId; terms = [...Object.values(row).filter((value): value is string => Boolean(value)), row.customer_contact?.split('@')[1] ?? ''];
    } else if (jobFileId && uuid.test(jobFileId)) {
      const [job] = (await db().query<{ job_number: string; origin: string | null; destination: string | null; shipment_id: string | null }>(`select job_number, origin, destination, shipment_id from ophanim_job_files where id = $1 and organization_id = $2`, [jobFileId, actor.organizationId])).rows;
      if (!job) return NextResponse.json({ error: 'Job file not found.' }, { status: 404, headers });
      const references = (await db().query<{ normalized_value: string }>(`select normalized_value from ophanim_job_references where job_file_id = $1 and organization_id = $2 and validated`, [jobFileId, actor.organizationId])).rows;
      subjectId = job.shipment_id ?? jobFileId; terms = [job.job_number, job.origin ?? '', job.destination ?? '', ...references.map(reference => reference.normalized_value)];
    } else return NextResponse.json({ error: 'shipmentId or jobFileId is required.' }, { status: 400, headers });
    const corridor = await corridorIntelligence(actor, subjectId, terms);
    return NextResponse.json({ ...corridor, features: darkWebFeatures(corridor), note: 'Dark-web data is noisy and often unverifiable. Every item is an unverified claim with its source and match reason; mark false positives in the review queue.' }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof OrganizationAccessError ? 'Sign in with intelligence access.' : 'Corridor intelligence unavailable.' }, { status: error instanceof OrganizationAccessError ? 401 : 503, headers });
  }
}
