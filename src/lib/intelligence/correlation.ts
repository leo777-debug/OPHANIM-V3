import type { CyberAsset, CyberClient, VendorDependency } from '@/lib/cyber/inventory';
import type { ShipmentRecord } from '@/lib/logistics/shipments';

export type CorrelationSubjectType = 'shipment' | 'cyber_client' | 'cyber_asset' | 'vendor_dependency';
export interface CorrelationCandidate { subjectType: CorrelationSubjectType; subjectId: string; subjectLabel: string; ownerUserId?: string; signals: Array<{ kind: string; value: string; score: number }>; nextMilestoneAt?: string; lastSafeMoveAt?: string; lastSafeMoveSource?: string; }

function fold(value: string | undefined): string { return (value ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9.:-]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function exactOrPhrase(text: string, value: string | undefined): boolean {
  const candidate = fold(value);
  if (!candidate || candidate.length < 3) return false;
  if (candidate.includes('.') || candidate.includes(':') || /^\d+$/.test(candidate)) return fold(text).includes(candidate);
  return new RegExp(`(^|[^a-z0-9])${candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')}($|[^a-z0-9])`, 'i').test(fold(text));
}
function signal(text: string, kind: string, value: string | undefined, score: number) { return exactOrPhrase(text, value) && value ? { kind, value, score } : undefined; }
function unique(items: Array<{ kind: string; value: string; score: number } | undefined>) { return items.filter((item): item is { kind: string; value: string; score: number } => Boolean(item)).filter((item, index, list) => list.findIndex((other) => other.kind === item.kind && other.value === item.value) === index); }
function mostRecent(values: Array<{ at?: string; source: string }>): { at?: string; source?: string } { return values.filter((item) => item.at && Number.isFinite(Date.parse(item.at))).sort((a, b) => Date.parse(b.at!) - Date.parse(a.at!))[0] ?? {}; }

export function correlateShipment(text: string, shipment: ShipmentRecord): CorrelationCandidate | null {
  const signals = unique([
    signal(text, 'imo', shipment.imoNumber, 100), signal(text, 'mmsi', shipment.mmsiNumber, 100), signal(text, 'vessel', shipment.vesselName, 82),
    signal(text, 'carrier', shipment.carrier, 64), signal(text, 'origin_port', shipment.originPortCode ?? shipment.originPortName, 64),
    signal(text, 'destination_port', shipment.destinationPortCode ?? shipment.destinationPortName, 64), ...(shipment.transshipmentPorts ?? []).map((port) => signal(text, 'transshipment_port', port, 60)),
  ]);
  if (!signals.length) return null;
  const safe = mostRecent([{ at: shipment.actualDepartureAt, source: 'Actual departure' }, { at: shipment.plannedDepartureAt, source: 'Planned departure' }]);
  return { subjectType: 'shipment', subjectId: shipment.id, subjectLabel: shipment.shipmentReference, ownerUserId: shipment.ownerUserId, signals, nextMilestoneAt: shipment.plannedArrivalAt, lastSafeMoveAt: safe.at, lastSafeMoveSource: safe.source };
}

export function correlateCyber(text: string, clients: CyberClient[], assets: CyberAsset[], dependencies: VendorDependency[]): CorrelationCandidate[] {
  const results: CorrelationCandidate[] = [];
  for (const client of clients) {
    const signals = unique([signal(text, 'client_reference', client.reference, 100), signal(text, 'client_name', client.name, 68)]);
    if (signals.length) results.push({ subjectType: 'cyber_client', subjectId: client.id, subjectLabel: client.name, ownerUserId: client.technicalOwnerUserId ?? client.accountOwnerUserId, signals });
  }
  for (const asset of assets) {
    const signals = unique([signal(text, 'asset_domain', asset.domain, 100), signal(text, 'asset_ip', asset.ipAddress, 100), signal(text, 'asset_hostname', asset.hostname, 80), signal(text, 'asset_product', asset.product, 72), signal(text, 'asset_name', asset.assetName, 55)]);
    if (signals.length) results.push({ subjectType: 'cyber_asset', subjectId: asset.id, subjectLabel: asset.assetName, signals });
  }
  for (const dependency of dependencies) {
    const signals = unique([signal(text, 'vendor', dependency.vendor, 82), signal(text, 'vendor_product', dependency.productOrService, 88)]);
    if (signals.length) results.push({ subjectType: 'vendor_dependency', subjectId: dependency.id, subjectLabel: dependency.productOrService ? `${dependency.vendor} ${dependency.productOrService}` : dependency.vendor, signals });
  }
  return results;
}
