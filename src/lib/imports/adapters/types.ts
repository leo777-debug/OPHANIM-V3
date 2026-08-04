import type { OrganizationActor } from '@/lib/operations/types';
import type { ImportColumnDefinition, ImportType } from '../types';
import { shipmentImportAdapter } from './shipment';
import { cyberAssetImportAdapter, cyberClientImportAdapter, vendorDependencyImportAdapter } from './cyber';

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

export const importAdapters: Record<ImportType, ImportAdapter> = {
  shipment: shipmentImportAdapter as unknown as ImportAdapter,
  cyber_client: cyberClientImportAdapter,
  cyber_asset: cyberAssetImportAdapter as unknown as ImportAdapter,
  vendor_dependency: vendorDependencyImportAdapter as unknown as ImportAdapter,
};

export function getImportAdapter(type: ImportType): ImportAdapter { return importAdapters[type]; }
