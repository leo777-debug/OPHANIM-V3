import { db } from '@/lib/watchlists/db';
import { requireOrganizationAccess } from '@/lib/operations/authorization';
import type { OrganizationActor } from '@/lib/operations/types';
import type { ExtensionContextInput, ExtensionEntity } from './validation';

interface ShipmentMatchRow {
  id: string;
  shipment_reference: string;
  container_number: string | null;
  carrier: string | null;
  vessel_name: string | null;
  imo_number: string | null;
  mmsi_number: string | null;
  origin_port_name: string | null;
  origin_port_code: string | null;
  destination_port_name: string | null;
  destination_port_code: string | null;
  current_status: string;
  planned_arrival_at: string | null;
}

interface ImpactRow {
  shipment_id: string;
  impact_status: 'monitoring' | 'affected';
  risk_level: 'low' | 'moderate' | 'high' | 'critical';
  confidence: number;
  title: string;
  disruption_type: string;
  description: string | null;
  source: string;
  effective_at: string | null;
}

function normalize(value: string): string {
  return value.trim().toLocaleUpperCase();
}

function compact(value: string): string {
  return normalize(value).replace(/[^A-Z0-9]/g, '');
}

function category(type: string): string {
  if (type === 'weather') return 'WEATHER';
  if (type === 'port_closure' || type === 'labor') return 'PORT';
  if (type === 'cyber') return 'CYBER';
  if (type === 'security') return 'SECURITY';
  if (type === 'infrastructure') return 'INFRASTRUCTURE';
  return 'DEVELOPMENT';
}

function matchLabel(entity: ExtensionEntity): string {
  return entity.type.replaceAll('_', ' ').toLocaleUpperCase();
}

export async function loadExtensionContext(actor: OrganizationActor, input: ExtensionContextInput) {
  requireOrganizationAccess(actor, actor.organizationId, 'shipment:read');
  requireOrganizationAccess(actor, actor.organizationId, 'disruption:read');
  const exactValues = [...new Set(input.entities.map((entity) => normalize(entity.value)).filter(Boolean))];
  const compactValues = [...new Set(input.entities.map((entity) => compact(entity.value)).filter((value) => value.length >= 3))];

  const shipments = exactValues.length === 0 ? [] : (await db().query<ShipmentMatchRow>(
    `select id, shipment_reference, container_number, carrier, vessel_name, imo_number, mmsi_number,
            origin_port_name, origin_port_code, destination_port_name, destination_port_code, current_status, planned_arrival_at
       from ophanim_shipments
      where organization_id = $1
        and archived_at is null
        and (
          upper(trim(shipment_reference)) = any($2::text[])
          or regexp_replace(upper(coalesce(shipment_reference, '')), '[^A-Z0-9]', '', 'g') = any($3::text[])
          or upper(trim(coalesce(container_number, ''))) = any($2::text[])
          or regexp_replace(upper(coalesce(container_number, '')), '[^A-Z0-9]', '', 'g') = any($3::text[])
          or upper(trim(coalesce(booking_number, ''))) = any($2::text[])
          or upper(trim(coalesce(bill_of_lading_reference, ''))) = any($2::text[])
          or upper(trim(coalesce(vessel_name, ''))) = any($2::text[])
          or upper(trim(coalesce(imo_number, ''))) = any($2::text[])
          or upper(trim(coalesce(mmsi_number, ''))) = any($2::text[])
          or upper(trim(coalesce(carrier, ''))) = any($2::text[])
          or upper(trim(coalesce(origin_port_name, ''))) = any($2::text[])
          or upper(trim(coalesce(origin_port_code, ''))) = any($2::text[])
          or upper(trim(coalesce(destination_port_name, ''))) = any($2::text[])
          or upper(trim(coalesce(destination_port_code, ''))) = any($2::text[])
          or exists (
            select 1 from jsonb_array_elements_text(coalesce(transshipment_ports, '[]'::jsonb)) as port(value)
             where upper(trim(port.value)) = any($2::text[])
          )
        )
      order by current_status in ('in_transit', 'at_port') desc, planned_arrival_at nulls last, updated_at desc
      limit 12`,
    [actor.organizationId, exactValues, compactValues],
  )).rows;

  const shipmentIds = shipments.map((shipment) => shipment.id);
  const impacts = shipmentIds.length === 0 ? [] : (await db().query<ImpactRow>(
    `select assessment.shipment_id, assessment.impact_status, assessment.risk_level, assessment.confidence,
            disruption.title, disruption.disruption_type, disruption.description, disruption.source, disruption.effective_at
       from ophanim_shipment_impact_assessments assessment
       join ophanim_disruptions disruption on disruption.id = assessment.disruption_id
      where assessment.organization_id = $1
        and assessment.shipment_id = any($2::uuid[])
        and assessment.impact_status <> 'cleared'
        and disruption.status <> 'resolved'
      order by assessment.impact_status = 'affected' desc,
               assessment.impact_score desc,
               disruption.effective_at desc nulls last
      limit 20`,
    [actor.organizationId, shipmentIds],
  )).rows;

  const primary = shipments[0];
  return {
    page: input.page,
    detectedEntities: input.entities.map((entity) => ({ ...entity, label: matchLabel(entity) })),
    primaryShipment: primary ? {
      id: primary.id,
      reference: primary.shipment_reference,
      containerNumber: primary.container_number,
      status: primary.current_status,
      carrier: primary.carrier,
      vesselName: primary.vessel_name,
      imoNumber: primary.imo_number,
      mmsiNumber: primary.mmsi_number,
      route: [primary.origin_port_name ?? primary.origin_port_code, primary.destination_port_name ?? primary.destination_port_code].filter(Boolean).join(' → '),
      plannedArrivalAt: primary.planned_arrival_at,
      deepLink: `/logistics/shipments/${primary.id}`,
    } : null,
    relatedShipments: shipments.map((shipment) => ({ id: shipment.id, reference: shipment.shipment_reference, status: shipment.current_status })),
    cards: impacts.map((impact) => ({
      category: category(impact.disruption_type),
      status: impact.risk_level === 'critical' || impact.risk_level === 'high' ? 'act' : 'watch',
      title: impact.title,
      detail: impact.description,
      confidence: impact.confidence,
      source: impact.source,
      effectiveAt: impact.effective_at,
      shipmentId: impact.shipment_id,
    })),
    developments: impacts.length,
    message: primary
      ? impacts.length > 0 ? `${impacts.length} development${impacts.length === 1 ? '' : 's'} worth reviewing.` : 'No relevant active alert is stored for this shipment.'
      : input.entities.length > 0 ? 'Entities detected, but no linked shipment was found in this organization.' : 'No logistics entity was detected on this page.',
  };
}
