import { isIP } from 'node:net';
import { ShodanError } from './types';

interface Network { family: number; start: bigint; end: bigint; size: bigint }
function network(value: string): Network {
  const [address, prefixText, extra] = value.split('/');
  const family = isIP(address);
  if (!family || extra !== undefined || address.includes('%')) throw new ShodanError('invalid_request', 'Use literal IPv4/IPv6 addresses or CIDRs, not hostnames or URLs.', 400);
  const bits = family === 4 ? 32 : 128;
  const prefix = prefixText === undefined ? bits : /^\d+$/.test(prefixText) ? Number(prefixText) : -1;
  if (prefix < 0 || prefix > bits) throw new ShodanError('invalid_request', 'Invalid CIDR prefix.', 400);
  let integer: bigint;
  if (family === 4) integer = address.split('.').reduce((n, octet) => n * BigInt(256) + BigInt(octet), BigInt(0));
  else {
    let expanded = address.toLowerCase();
    if (expanded.includes('.')) {
      const lastColon = expanded.lastIndexOf(':'), octets = expanded.slice(lastColon + 1).split('.').map(Number);
      expanded = `${expanded.slice(0, lastColon + 1)}${(octets[0] * 256 + octets[1]).toString(16)}:${(octets[2] * 256 + octets[3]).toString(16)}`;
    }
    const [left, right] = expanded.split('::');
    const head = left ? left.split(':') : [], tail = right ? right.split(':') : [];
    const parts = right !== undefined ? [...head, ...Array(8 - head.length - tail.length).fill('0'), ...tail] : head;
    integer = BigInt(`0x${parts.map((part) => part.padStart(4, '0')).join('')}`);
  }
  const size = BigInt(1) << BigInt(bits - prefix), start = integer / size * size;
  return { family, start, end: start + size - BigInt(1), size };
}

export function scanAllowlist(organizationId: string): string[] {
  // JSON scopes owned targets to an organization; a comma list is deployment-wide.
  const configured = process.env.AUTHORIZED_SCAN_TARGETS?.trim() ?? '';
  if (!configured) return [];
  if (configured.startsWith('{')) {
    try {
      const values = JSON.parse(configured)[organizationId];
      if (!Array.isArray(values) || !values.every((value) => typeof value === 'string')) return [];
      return values;
    } catch { throw new ShodanError('unauthorized_target', 'The administrator must correct AUTHORIZED_SCAN_TARGETS.', 403); }
  }
  return configured.split(',').map((value) => value.trim()).filter(Boolean);
}

export function validateScanTargets(input: unknown, confirm: unknown, allowlist: string[], maxHosts = 256): { targets: string[]; hosts: number } {
  if (confirm !== true) throw new ShodanError('confirmation_required', 'Confirm that you are authorized to scan these hosts and accept the scan-credit charge.', 400);
  if (typeof input !== 'string' || input.length > 4096) throw new ShodanError('invalid_request', 'Provide a comma-separated list of IPs or CIDRs.', 400);
  const values = input.split(',').map((value) => value.trim());
  if (!values.length || values.length > 100 || values.some((value) => !value)) throw new ShodanError('invalid_request', 'Provide between 1 and 100 IPs or CIDRs.', 400);
  if (!allowlist.length) throw new ShodanError('unauthorized_target', 'Active scanning is disabled: no authorized scan targets are configured for this workspace.', 403);
  const allowed = allowlist.map(network), targets = [...new Set(values)], requested = targets.map(network);
  let hosts = BigInt(0);
  for (const target of requested) {
    // Merge allowed ranges so adjacent blocks can jointly authorize a target.
    const ranges = allowed.filter((item) => item.family === target.family && item.end >= target.start && item.start <= target.end)
      .sort((a, b) => a.start < b.start ? -1 : a.start > b.start ? 1 : 0);
    let cursor = target.start;
    for (const range of ranges) {
      if (range.start > cursor) break;
      if (range.end >= cursor) cursor = range.end + BigInt(1);
    }
    if (cursor <= target.end) throw new ShodanError('unauthorized_target', 'Every requested IP and the entire CIDR must be inside AUTHORIZED_SCAN_TARGETS.', 403);
    hosts += target.size;
    if (hosts > BigInt(maxHosts)) throw new ShodanError('invalid_request', `A scan is limited to ${maxHosts} hosts. Narrow the targets.`, 400);
  }
  return { targets, hosts: Number(hosts) };
}
