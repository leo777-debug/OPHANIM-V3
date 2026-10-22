export type ShodanErrorCode = 'missing_key' | 'invalid_key' | 'access_denied' | 'no_information' | 'rate_limited' | 'provider_down' | 'invalid_request' | 'unauthorized_target' | 'confirmation_required' | 'insufficient_credits' | 'scan_pending';

export class ShodanError extends Error {
  constructor(public readonly code: ShodanErrorCode, message: string, public readonly status: number) {
    super(message);
    this.name = 'ShodanError';
  }
}

export interface ShodanService {
  ip_str: string;
  port: number | null;
  org: string | null;
  hostnames: string[];
  product: string | null;
  transport: string | null;
  location: { latitude: number | null; longitude: number | null; city: string | null; country: string | null; country_code: string | null };
  timestamp: string | null;
  data: string;
}
export interface ShodanHost {
  ip: string; ports: number[]; hostnames: string[]; org: string | null; isp: string | null;
  asn: string | null; os: string | null; last_update: string | null; vulns: string[];
  services: ShodanService[];
}
export interface ShodanInfo { query_credits: number | null; scan_credits: number | null; plan: string | null }
export interface ShodanScan { id: string; count: number | null; credits_left: number | null; status: string; created: string | null }
export type ShodanFacets = Record<string, Array<{ value: string | number; count: number }>>;
export interface ShodanSearch { matches: ShodanService[]; total: number; facets: ShodanFacets; page: number; credits: ShodanInfo; warnings: string[] }

export function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function text(value: unknown): string | null { return typeof value === 'string' ? value : null; }
export function number(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
export function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; }

export function normalizeService(value: unknown, fallbackIp = '', fallbackLocation: Record<string, unknown> = {}): ShodanService {
  const row = object(value), location = { ...fallbackLocation, ...object(row.location) };
  return { ip_str: text(row.ip_str) ?? fallbackIp, port: number(row.port), org: text(row.org), hostnames: strings(row.hostnames),
    product: text(row.product), transport: text(row.transport), timestamp: text(row.timestamp),
    data: (text(row.data) ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, 1000),
    location: { latitude: number(location.latitude), longitude: number(location.longitude), city: text(location.city),
      country: text(location.country_name), country_code: text(location.country_code) } };
}
export function normalizeHost(value: unknown, ip: string): ShodanHost {
  const row = object(value);
  return { ip: text(row.ip_str) ?? ip, ports: Array.isArray(row.ports) ? row.ports.filter((port): port is number => typeof port === 'number') : [],
    hostnames: strings(row.hostnames), org: text(row.org), isp: text(row.isp), asn: text(row.asn), os: text(row.os), last_update: text(row.last_update),
    vulns: Array.isArray(row.vulns) ? strings(row.vulns) : Object.keys(object(row.vulns)),
    services: Array.isArray(row.data) ? row.data.map((service) => normalizeService(service, ip, row)) : [] };
}
export function normalizeFacets(value: unknown): ShodanFacets {
  return Object.fromEntries(Object.entries(object(value)).map(([key, items]) => [key, Array.isArray(items) ? items.flatMap((item) => {
    const row = object(item), count = number(row.count);
    return count !== null && (typeof row.value === 'string' || typeof row.value === 'number') ? [{ value: row.value, count }] : [];
  }) : []]));
}
export function normalizeScan(value: unknown): ShodanScan {
  const row = object(value), id = text(row.id);
  if (!id) throw new ShodanError('provider_down', 'Shodan did not return a scan ID. Do not resubmit until an administrator checks the scan account.', 502);
  return { id, count: number(row.count), credits_left: number(row.credits_left), status: text(row.status) ?? 'SUBMITTING', created: text(row.created) };
}
