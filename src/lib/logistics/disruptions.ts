import { db } from '@/lib/watchlists/db';
import { requireOrganizationAccess } from '@/lib/operations/authorization';
import type { OrganizationActor } from '@/lib/operations/types';
import type { ProviderMapLayer } from '@/lib/providers';
import { listShipments, type ShipmentRecord } from './shipments';
import { validateDisruptionInput, type DisruptionEvidenceInput, type DisruptionInput, type DisruptionStatus, type DisruptionType } from './disruption-validation';

export interface DisruptionEvidence extends DisruptionEvidenceInput {
  id: string;
  capturedAt: string;
}

export interface DisruptionRecord extends Omit<DisruptionInput, 'evidence'> {
  id: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
  evidence: DisruptionEvidence[];
  impactCount?: number;
}

export interface ShipmentRouteStop {
  shipmentId: string;
  portName: string;
  portCode?: string;
  latitude?: number;
  longitude?: number;
}

export interface ShipmentMilestone {
  shipmentId: string;
  milestoneType: string;
  deadlineAt: string;
}

export interface MatchSignal {
  kind: 'imo' | 'vessel' | 'port_code' | 'port_name' | 'route_proximity';
  value: string;
  score: number;
}

export interface ShipmentImpactAssessment {
  id: string;
  shipmentId: string;
  shipmentReference: string;
  disruptionId: string;
  impactStatus: 'monitoring' | 'affected' | 'cleared';
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
  impactScore: number;
  confidence: number;
  matchedSignals: MatchSignal[];
  rationale: Record<string, unknown>;
  lastSafeMoveAt?: string;
  lastSafeMoveSource?: string;
  assessedAt: string;
}

interface DisruptionRow {
  id: string; organization_id: string; source: string; source_reference: string | null; title: string;
  disruption_type: DisruptionType; severity: number; status: DisruptionStatus; description: string | null;
  effective_at: string | null; reported_at: string | null; latitude: number | null; longitude: number | null;
  radius_km: number | null; affected_ports: unknown; affected_vessels: unknown; source_url: string | null;
  created_at: string; updated_at: string; impact_count?: number;
}

interface EvidenceRow { id: string; source_name: string; title: string; source_url: string; published_at: string | null; excerpt: string | null; captured_at: string; }
interface RouteStopRow { shipment_id: string; port_name: string; port_code: string | null; latitude: number | null; longitude: number | null; }
interface MilestoneRow { shipment_id: string; milestone_type: string; deadline_at: string; }
interface AssessmentRow {
  id: string; shipment_id: string; shipment_reference: string; disruption_id: string; impact_status: ShipmentImpactAssessment['impactStatus'];
  risk_level: ShipmentImpactAssessment['riskLevel']; impact_score: number; confidence: number; matched_signals: unknown; rationale: unknown;
  last_safe_move_at: string | null; last_safe_move_source: string | null; assessed_at: string;
}

const disruptionFields = `
  id, organization_id, source, source_reference, title, disruption_type, severity, status, description,
  effective_at, reported_at, latitude, longitude, radius_km, affected_ports, affected_vessels, source_url, created_at, updated_at
`;

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function toRecord(row: DisruptionRow, evidence: DisruptionEvidence[] = []): DisruptionRecord {
  return {
    id: row.id, organizationId: row.organization_id, source: row.source, sourceReference: row.source_reference ?? undefined,
    title: row.title, disruptionType: row.disruption_type, severity: row.severity, status: row.status, description: row.description ?? undefined,
    effectiveAt: row.effective_at ?? undefined, reportedAt: row.reported_at ?? undefined, latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined, radiusKm: row.radius_km ?? undefined, affectedPorts: stringList(row.affected_ports),
    affectedVessels: stringList(row.affected_vessels), sourceUrl: row.source_url ?? undefined, createdAt: row.created_at,
    updatedAt: row.updated_at, evidence, impactCount: Number(row.impact_count ?? 0),
  };
}

function toEvidence(row: EvidenceRow): DisruptionEvidence {
  return { id: row.id, sourceName: row.source_name, title: row.title, sourceUrl: row.source_url, publishedAt: row.published_at ?? undefined, excerpt: row.excerpt ?? undefined, capturedAt: row.captured_at };
}

function normalize(value: string | undefined): string {
  return (value ?? '').toLocaleUpperCase().replace(/[^A-Z0-9]/g, '');
}

function haversineKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLng = radians(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function mostRecentBefore(candidates: Array<{ at?: string; source: string }>, cutoff?: string): { at: string; source: string } | undefined {
  if (!cutoff) return undefined;
  const cutoffTime = Date.parse(cutoff);
  if (!Number.isFinite(cutoffTime)) return undefined;
  return candidates.filter((candidate): candidate is { at: string; source: string } => Boolean(candidate.at) && Date.parse(candidate.at!) <= cutoffTime)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
}

export function matchShipmentToDisruption(shipment: ShipmentRecord, disruption: DisruptionRecord, stops: ShipmentRouteStop[] = [], milestones: ShipmentMilestone[] = []): Omit<ShipmentImpactAssessment, 'id' | 'shipmentId' | 'shipmentReference' | 'disruptionId' | 'assessedAt'> | null {
  const signals: MatchSignal[] = [];
  const affectedVessels = (disruption.affectedVessels ?? []).map(normalize).filter(Boolean);
  const affectedPorts = (disruption.affectedPorts ?? []).map(normalize).filter(Boolean);
  const shipImo = normalize(shipment.imoNumber);
  const shipVessel = normalize(shipment.vesselName);
  if (shipImo && affectedVessels.some((vessel) => vessel === shipImo || vessel === `IMO${shipImo}`)) signals.push({ kind: 'imo', value: shipment.imoNumber!, score: 100 });
  if (shipVessel && affectedVessels.includes(shipVessel)) signals.push({ kind: 'vessel', value: shipment.vesselName!, score: 80 });
  const ports = [
    { name: shipment.originPortName, code: shipment.originPortCode }, { name: shipment.destinationPortName, code: shipment.destinationPortCode },
    ...stops.map((stop) => ({ name: stop.portName, code: stop.portCode })),
  ];
  for (const port of ports) {
    const code = normalize(port.code);
    const name = normalize(port.name);
    if (code && affectedPorts.includes(code)) signals.push({ kind: 'port_code', value: port.code!, score: 70 });
    else if (name && affectedPorts.includes(name)) signals.push({ kind: 'port_name', value: port.name!, score: 60 });
  }
  if (disruption.latitude !== undefined && disruption.longitude !== undefined && disruption.radiusKm) {
    for (const stop of stops) {
      if (stop.latitude === undefined || stop.longitude === undefined) continue;
      if (haversineKm({ latitude: disruption.latitude, longitude: disruption.longitude }, { latitude: stop.latitude, longitude: stop.longitude }) <= disruption.radiusKm) {
        signals.push({ kind: 'route_proximity', value: stop.portName, score: 55 });
      }
    }
  }
  const uniqueSignals = signals.filter((signal, index, all) => all.findIndex((item) => item.kind === signal.kind && item.value === signal.value) === index);
  if (uniqueSignals.length === 0) return null;
  const score = Math.min(100, Math.max(...uniqueSignals.map((signal) => signal.score)) + Math.max(0, uniqueSignals.length - 1) * 10);
  const lastSafeMove = mostRecentBefore([
    ...milestones.map((milestone) => ({ at: milestone.deadlineAt, source: `Milestone: ${milestone.milestoneType}` })),
    { at: shipment.actualDepartureAt, source: 'Actual departure' }, { at: shipment.plannedDepartureAt, source: 'Planned departure' },
  ], disruption.effectiveAt ?? disruption.reportedAt);
  const severityScore = disruption.severity * 20;
  const riskLevel: ShipmentImpactAssessment['riskLevel'] = severityScore >= 80 && score >= 70 ? 'critical' : severityScore >= 60 || score >= 80 ? 'high' : score >= 60 ? 'moderate' : 'low';
  return {
    impactStatus: score >= 70 ? 'affected' : 'monitoring', riskLevel, impactScore: score, confidence: score,
    matchedSignals: uniqueSignals, rationale: { matchingVersion: 1, disruptionSeverity: disruption.severity, matchRule: 'deterministic exact identifiers, route ports, and stored route-stop proximity only' },
    lastSafeMoveAt: lastSafeMove?.at, lastSafeMoveSource: lastSafeMove?.source,
  };
}

async function evidenceFor(disruptionId: string): Promise<DisruptionEvidence[]> {
  return (await db().query<EvidenceRow>('select id, source_name, title, source_url, published_at, excerpt, captured_at from ophanim_disruption_evidence where disruption_id = $1 order by captured_at desc', [disruptionId])).rows.map(toEvidence);
}

export async function listDisruptions(actor: OrganizationActor): Promise<DisruptionRecord[]> {
  requireOrganizationAccess(actor, actor.organizationId, 'disruption:read');
  const rows = (await db().query<DisruptionRow>(
    `select ${disruptionFields}, (select count(*) from ophanim_shipment_impact_assessments assessment where assessment.disruption_id = d.id and assessment.impact_status <> 'cleared')::int as impact_count
     from ophanim_disruptions d where organization_id = $1 order by status = 'active' desc, severity desc, effective_at desc nulls last, created_at desc`, [actor.organizationId],
  )).rows;
  return Promise.all(rows.map(async (row) => toRecord(row, await evidenceFor(row.id))));
}

export async function getDisruption(actor: OrganizationActor, disruptionId: string): Promise<DisruptionRecord | null> {
  requireOrganizationAccess(actor, actor.organizationId, 'disruption:read');
  const result = await db().query<DisruptionRow>(`select ${disruptionFields} from ophanim_disruptions where id = $1 and organization_id = $2`, [disruptionId, actor.organizationId]);
  return result.rows[0] ? toRecord(result.rows[0], await evidenceFor(disruptionId)) : null;
}

export async function createDisruption(actor: OrganizationActor, input: unknown): Promise<DisruptionRecord> {
  requireOrganizationAccess(actor, actor.organizationId, 'disruption:write');
  const disruption = validateDisruptionInput(input);
  const client = await db().connect();
  try {
    await client.query('begin');
    const created = await client.query<DisruptionRow>(
      `insert into ophanim_disruptions (organization_id, source, source_reference, title, disruption_type, severity, status, description, effective_at, reported_at, latitude, longitude, radius_km, affected_ports, affected_vessels, source_url, created_by_user_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) returning ${disruptionFields}`,
      [actor.organizationId, disruption.source, disruption.sourceReference ?? null, disruption.title, disruption.disruptionType, disruption.severity, disruption.status, disruption.description ?? null, disruption.effectiveAt ?? null, disruption.reportedAt ?? null, disruption.latitude ?? null, disruption.longitude ?? null, disruption.radiusKm ?? null, JSON.stringify(disruption.affectedPorts ?? []), JSON.stringify(disruption.affectedVessels ?? []), disruption.sourceUrl ?? null, actor.userId],
    );
    const record = created.rows[0];
    for (const evidence of disruption.evidence ?? []) {
      await client.query('insert into ophanim_disruption_evidence (disruption_id, source_name, title, source_url, published_at, excerpt) values ($1, $2, $3, $4, $5, $6)', [record.id, evidence.sourceName, evidence.title, evidence.sourceUrl, evidence.publishedAt ?? null, evidence.excerpt ?? null]);
    }
    await client.query(`insert into ophanim_audit_events (organization_id, actor_user_id, action, subject_type, subject_id, metadata) values ($1, $2, 'disruption.created', 'disruption', $3, $4)`, [actor.organizationId, actor.userId, record.id, JSON.stringify({ source: record.source, severity: record.severity })]);
    await client.query('commit');
    return toRecord(record, await evidenceFor(record.id));
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally { client.release(); }
}

function toAssessment(row: AssessmentRow): ShipmentImpactAssessment {
  return { id: row.id, shipmentId: row.shipment_id, shipmentReference: row.shipment_reference, disruptionId: row.disruption_id, impactStatus: row.impact_status, riskLevel: row.risk_level, impactScore: row.impact_score, confidence: row.confidence, matchedSignals: Array.isArray(row.matched_signals) ? row.matched_signals as MatchSignal[] : [], rationale: jsonObject(row.rationale), lastSafeMoveAt: row.last_safe_move_at ?? undefined, lastSafeMoveSource: row.last_safe_move_source ?? undefined, assessedAt: row.assessed_at };
}

export async function listDisruptionAssessments(actor: OrganizationActor, disruptionId: string): Promise<ShipmentImpactAssessment[]> {
  requireOrganizationAccess(actor, actor.organizationId, 'disruption:read');
  const result = await db().query<AssessmentRow>(
    `select assessment.id, assessment.shipment_id, shipment.shipment_reference, assessment.disruption_id, assessment.impact_status, assessment.risk_level, assessment.impact_score, assessment.confidence, assessment.matched_signals, assessment.rationale, assessment.last_safe_move_at, assessment.last_safe_move_source, assessment.assessed_at
     from ophanim_shipment_impact_assessments assessment join ophanim_shipments shipment on shipment.id = assessment.shipment_id
     where assessment.organization_id = $1 and assessment.disruption_id = $2 order by assessment.impact_status = 'affected' desc, assessment.impact_score desc`, [actor.organizationId, disruptionId],
  );
  return result.rows.map(toAssessment);
}

export async function reconcileDisruptionImpacts(actor: OrganizationActor, disruptionId: string): Promise<ShipmentImpactAssessment[]> {
  requireOrganizationAccess(actor, actor.organizationId, 'disruption:write');
  const disruption = await getDisruption(actor, disruptionId);
  if (!disruption) throw new Error('Disruption not found.');
  const activeShipments = (await listShipments(actor)).filter((shipment) => !['delivered', 'cancelled'].includes(shipment.currentStatus ?? ''));
  const ids = activeShipments.map((shipment) => shipment.id);
  const [stopRows, milestoneRows]: [RouteStopRow[], MilestoneRow[]] = ids.length === 0 ? [[], []] : await Promise.all([
    db().query<RouteStopRow>('select stop.shipment_id, stop.port_name, stop.port_code, stop.latitude, stop.longitude from ophanim_shipment_route_stops stop join ophanim_shipments shipment on shipment.id = stop.shipment_id where shipment.organization_id = $1 and stop.shipment_id = any($2::uuid[])', [actor.organizationId, ids]).then((result) => result.rows),
    db().query<MilestoneRow>('select milestone.shipment_id, milestone.milestone_type, milestone.deadline_at from ophanim_shipment_milestones milestone join ophanim_shipments shipment on shipment.id = milestone.shipment_id where shipment.organization_id = $1 and milestone.shipment_id = any($2::uuid[]) and milestone.status = \'active\'', [actor.organizationId, ids]).then((result) => result.rows),
  ]);
  const matches = activeShipments.flatMap((shipment) => {
    const match = matchShipmentToDisruption(shipment, disruption,
      stopRows.filter((stop) => stop.shipment_id === shipment.id).map((stop) => ({ shipmentId: stop.shipment_id, portName: stop.port_name, portCode: stop.port_code ?? undefined, latitude: stop.latitude ?? undefined, longitude: stop.longitude ?? undefined })),
      milestoneRows.filter((milestone) => milestone.shipment_id === shipment.id).map((milestone) => ({ shipmentId: milestone.shipment_id, milestoneType: milestone.milestone_type, deadlineAt: milestone.deadline_at })),
    );
    return match ? [{ shipment, match }] : [];
  });
  const client = await db().connect();
  try {
    await client.query('begin');
    for (const { shipment, match } of matches) {
      await client.query(
        `insert into ophanim_shipment_impact_assessments (organization_id, shipment_id, disruption_id, impact_status, risk_level, impact_score, confidence, matched_signals, rationale, last_safe_move_at, last_safe_move_source)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         on conflict (organization_id, shipment_id, disruption_id) do update set impact_status = excluded.impact_status, risk_level = excluded.risk_level, impact_score = excluded.impact_score, confidence = excluded.confidence, matched_signals = excluded.matched_signals, rationale = excluded.rationale, last_safe_move_at = excluded.last_safe_move_at, last_safe_move_source = excluded.last_safe_move_source, assessed_at = now(), updated_at = now()`,
        [actor.organizationId, shipment.id, disruption.id, match.impactStatus, match.riskLevel, match.impactScore, match.confidence, JSON.stringify(match.matchedSignals), JSON.stringify(match.rationale), match.lastSafeMoveAt ?? null, match.lastSafeMoveSource ?? null],
      );
    }
    await client.query(`update ophanim_shipment_impact_assessments set impact_status = 'cleared', assessed_at = now(), updated_at = now() where organization_id = $1 and disruption_id = $2 and not (shipment_id = any($3::uuid[]))`, [actor.organizationId, disruption.id, matches.map(({ shipment }) => shipment.id)]);
    await client.query(`insert into ophanim_audit_events (organization_id, actor_user_id, action, subject_type, subject_id, metadata) values ($1, $2, 'disruption.reconciled', 'disruption', $3, $4)`, [actor.organizationId, actor.userId, disruption.id, JSON.stringify({ matchedShipments: matches.length, matchingVersion: 1 })]);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally { client.release(); }
  return listDisruptionAssessments(actor, disruption.id);
}

export function disruptionMapLayer(disruption: DisruptionRecord): ProviderMapLayer[] {
  if (disruption.latitude === undefined || disruption.longitude === undefined) return [];
  return [{
    id: `operations-disruption-${disruption.id}`, provider: 'operations-disruptions', name: disruption.title, geometry: 'point', visible: true, interactive: true,
    source: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [disruption.longitude, disruption.latitude] }, properties: { disruptionId: disruption.id, title: disruption.title, severity: disruption.severity, status: disruption.status, source: disruption.source, sourceUrl: disruption.sourceUrl } }] },
    style: { color: disruption.severity >= 4 ? '#fb7185' : '#f6c453', radius: 7, opacity: 0.9, outlineColor: '#0b1014' },
  }];
}
