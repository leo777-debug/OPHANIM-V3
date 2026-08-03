import type { OrganizationActor } from '@/lib/operations/types';
import type { ImportColumnDefinition, ImportType } from '../types';
import { shipmentImportAdapter } from './shipment';

export interface ImportAdapter<T extends object = Record<string, unknown>> {
  type: ImportType;
  label: string;
  description: string;
  available: boolean;
  unavailableReason?: string;
  columns: ImportColumnDefinition[];
  normalize(values: Record<string, unknown>): T;
  duplicateKey(value: T): string;
  findExisting?(actor: OrganizationActor, values: T[]): Promise<Set<string>>;
  persist?(actor: OrganizationActor, value: T): Promise<{ entityType: string; entityId: string }>;
}

const unavailableAdapter = (type: Exclude<ImportType, 'shipment'>, label: string, description: string): ImportAdapter => ({
  type,
  label,
  description,
  available: false,
  unavailableReason: `${label} imports will be available after the tenant-scoped ${label.toLowerCase()} model is added in Phase 3.`,
  columns: [],
  normalize: () => { throw new Error(`${label} imports are unavailable.`); },
  duplicateKey: () => '',
});

export const importAdapters: Record<ImportType, ImportAdapter> = {
  shipment: shipmentImportAdapter as unknown as ImportAdapter,
  cyber_client: unavailableAdapter('cyber_client', 'Cyber client', 'Managed cybersecurity clients.'),
  cyber_asset: unavailableAdapter('cyber_asset', 'Cyber asset', 'Client-scoped cybersecurity assets.'),
  vendor_dependency: unavailableAdapter('vendor_dependency', 'Vendor dependency', 'Client vendor and dependency records.'),
};

export function getImportAdapter(type: ImportType): ImportAdapter { return importAdapters[type]; }
