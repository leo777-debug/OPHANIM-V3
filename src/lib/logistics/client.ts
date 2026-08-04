export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: 'no-store',
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? 'Request failed.');
  return body;
}

export function label(value?: string): string {
  return (value ?? 'unknown').replaceAll('_', ' ');
}

export function isoDate(value?: string): string {
  if (!value) return 'Unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unavailable' : date.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

export function hrefForMap(shipmentId?: string, disruptionId?: string): string {
  const query = new URLSearchParams();
  if (shipmentId) query.set('shipment', shipmentId);
  if (disruptionId) query.set('disruption', disruptionId);
  const suffix = query.toString();
  return `/logistics/map${suffix ? `?${suffix}` : ''}`;
}
