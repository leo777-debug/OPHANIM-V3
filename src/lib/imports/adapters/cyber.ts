import { createCyberAsset, createCyberClient, createVendorDependency } from '@/lib/cyber/inventory';
import { validateCyberAssetInput, validateCyberClientInput, validateVendorDependencyInput } from '@/lib/cyber/validation';
import type { CyberAssetInput, VendorDependencyInput } from '@/lib/cyber/types';
import { db } from '@/lib/watchlists/db';
import type { ImportAdapter } from './types';

interface AssetImportInput extends Omit<CyberAssetInput, 'customerId'> { clientIdentifier: string; }
interface DependencyImportInput extends Omit<VendorDependencyInput, 'customerId'> { clientIdentifier: string; }

function clientIdentifier(value: Record<string, unknown>): string {
  const identifier = typeof value.clientIdentifier === 'string' ? value.clientIdentifier.trim() : '';
  if (!identifier) throw new Error('Client identifier is required.');
  return identifier;
}

async function customerIdFor(organizationId: string, reference: string): Promise<string> {
  const result = await db().query<{ id: string }>('select id from ophanim_customers where organization_id = $1 and lower(reference) = lower($2) and status = \'active\'', [organizationId, reference]);
  const id = result.rows[0]?.id;
  if (!id) throw new Error(`Client identifier ${reference} was not found in this organization.`);
  return id;
}

export const cyberClientImportAdapter: ImportAdapter = {
  type: 'cyber_client', label: 'Cyber client', description: 'Managed cybersecurity clients scoped to the active organization.', available: true,
  columns: [
    { key: 'name', label: 'Client name', required: true, aliases: ['client name', 'customer name', 'name'] },
    { key: 'reference', label: 'Client identifier', required: true, aliases: ['client identifier', 'client id', 'customer reference', 'reference'] },
    { key: 'timezone', label: 'Timezone', aliases: ['timezone', 'time zone'] }, { key: 'securityContact', label: 'Security contact', aliases: ['security contact'] },
    { key: 'executiveContact', label: 'Executive contact', aliases: ['executive contact'] }, { key: 'escalationContact', label: 'Escalation contact', aliases: ['escalation contact'] },
    { key: 'serviceTier', label: 'Service tier', aliases: ['service tier'] }, { key: 'responseSlaHours', label: 'Response SLA hours', aliases: ['response sla', 'response sla hours'] },
    { key: 'remediationSlaHours', label: 'Remediation SLA hours', aliases: ['remediation sla', 'remediation sla hours'] }, { key: 'tags', label: 'Tags', aliases: ['tags', 'labels'] },
  ],
  normalize: validateCyberClientInput,
  duplicateKey: (value) => String((value as { reference: string }).reference).toLowerCase(),
  async findExisting(actor, values) { const references = values.map((value) => String((value as { reference: string }).reference).toLowerCase()); const result = await db().query<{ reference: string }>('select reference from ophanim_customers where organization_id=$1 and lower(reference)=any($2::text[]) and status=\'active\'', [actor.organizationId,references]); return new Set(result.rows.map((row) => row.reference.toLowerCase())); },
  async persist(actor, value) { const created = await createCyberClient(actor, value); return { entityType: 'cyber_client', entityId: created.id }; },
};

export const cyberAssetImportAdapter: ImportAdapter<AssetImportInput> = {
  type: 'cyber_asset', label: 'Cyber asset', description: 'Client-scoped cybersecurity assets.', available: true,
  columns: [
    { key: 'clientIdentifier', label: 'Client identifier', required: true, aliases: ['client identifier', 'client id', 'customer reference'] }, { key: 'assetName', label: 'Asset name', required: true, aliases: ['asset name', 'name'] },
    { key: 'assetType', label: 'Asset type', aliases: ['asset type', 'type'] }, { key: 'hostname', label: 'Hostname', aliases: ['hostname', 'host'] }, { key: 'domain', label: 'Domain', aliases: ['domain'] }, { key: 'ipAddress', label: 'IP address', aliases: ['ip', 'ip address'] },
    { key: 'exposureScope', label: 'Exposure scope', aliases: ['exposure scope', 'public or internal'] }, { key: 'internetFacing', label: 'Internet facing', aliases: ['internet facing', 'publicly exposed'] }, { key: 'vendor', label: 'Vendor', aliases: ['vendor'] }, { key: 'product', label: 'Product', aliases: ['product'] }, { key: 'productVersion', label: 'Product version', aliases: ['product version', 'version'] },
    { key: 'operatingSystem', label: 'Operating system', aliases: ['operating system', 'os'] }, { key: 'softwarePackage', label: 'Software package', aliases: ['software package', 'package'] }, { key: 'cloudProvider', label: 'Cloud provider', aliases: ['cloud provider'] }, { key: 'cloudAccount', label: 'Cloud account', aliases: ['cloud account'] }, { key: 'cloudRegion', label: 'Cloud region', aliases: ['cloud region'] },
    { key: 'environment', label: 'Environment', aliases: ['environment'] }, { key: 'criticality', label: 'Criticality', aliases: ['criticality', 'business criticality'] }, { key: 'assetOwner', label: 'Asset owner', aliases: ['asset owner', 'business owner'] }, { key: 'inventorySource', label: 'Inventory source', aliases: ['inventory source'] }, { key: 'inventoryConfidence', label: 'Inventory confidence', aliases: ['inventory confidence'] }, { key: 'lastObservedAt', label: 'Last observed', aliases: ['last observed', 'last observed at'] }, { key: 'lastVerifiedAt', label: 'Last verified', aliases: ['last verified', 'last verified at'] }, { key: 'verificationStatus', label: 'Verification status', aliases: ['verification status'] },
  ],
  normalize(values) { const identifier = clientIdentifier(values); return { ...validateCyberAssetInput({ ...values, customerId: '00000000-0000-4000-8000-000000000000' }), clientIdentifier: identifier }; },
  duplicateKey: (value) => `${value.clientIdentifier.toLowerCase()}:${(value.hostname ?? value.domain ?? value.ipAddress ?? value.assetName).toLowerCase()}`,
  async findExisting(actor, values) { const identifiers = [...new Set(values.map((value) => value.clientIdentifier))]; const result = await db().query<{ reference: string; asset_name: string; hostname: string | null; domain: string | null; ip_address: string | null }>(`select customer.reference,asset.asset_name,asset.hostname,asset.domain,host(asset.ip_address) as ip_address from ophanim_assets asset join ophanim_customers customer on customer.id=asset.customer_id where asset.organization_id=$1 and customer.status='active' and lower(customer.reference)=any($2::text[]) and asset.archived_at is null`, [actor.organizationId, identifiers.map((value) => value.toLowerCase())]); return new Set(result.rows.map((row) => `${row.reference.toLowerCase()}:${(row.hostname ?? row.domain ?? row.ip_address ?? row.asset_name).toLowerCase()}`)); },
  async persist(actor, value) { const created = await createCyberAsset(actor, { ...value, customerId: await customerIdFor(actor.organizationId, value.clientIdentifier) }); return { entityType: 'cyber_asset', entityId: created.id }; },
};

export const vendorDependencyImportAdapter: ImportAdapter<DependencyImportInput> = {
  type: 'vendor_dependency', label: 'Vendor dependency', description: 'Client vendor and dependency records.', available: true,
  columns: [ { key: 'clientIdentifier', label: 'Client identifier', required: true, aliases: ['client identifier', 'client id', 'customer reference'] }, { key: 'vendor', label: 'Vendor', required: true, aliases: ['vendor'] }, { key: 'productOrService', label: 'Product or service', aliases: ['product or service', 'service', 'product'] }, { key: 'dependencyType', label: 'Dependency type', aliases: ['dependency type'] }, { key: 'businessCriticality', label: 'Business criticality', aliases: ['business criticality', 'criticality'] }, { key: 'internalOwner', label: 'Internal owner', aliases: ['internal owner'] }, { key: 'securityContact', label: 'Security contact', aliases: ['security contact'] }, { key: 'verificationStatus', label: 'Verification status', aliases: ['verification status'] }, { key: 'lastVerifiedAt', label: 'Last verified', aliases: ['last verified', 'last verified at'] } ],
  normalize(values) { const identifier = clientIdentifier(values); return { ...validateVendorDependencyInput({ ...values, customerId: '00000000-0000-4000-8000-000000000000' }), clientIdentifier: identifier }; },
  duplicateKey: (value) => `${value.clientIdentifier.toLowerCase()}:${value.vendor.toLowerCase()}:${(value.productOrService ?? '').toLowerCase()}`,
  async findExisting(actor, values) { const keys = values.map((value) => ({ client: value.clientIdentifier.toLowerCase(), vendor: value.vendor.toLowerCase(), product: (value.productOrService ?? '').toLowerCase() })); const clients = [...new Set(keys.map((key) => key.client))]; const result = await db().query<{ reference: string; vendor: string; product_or_service: string | null }>(`select customer.reference,dependency.vendor,dependency.product_or_service from ophanim_vendor_dependencies dependency join ophanim_customers customer on customer.id=dependency.customer_id where dependency.organization_id=$1 and lower(customer.reference)=any($2::text[]) and dependency.archived_at is null`, [actor.organizationId,clients]); return new Set(result.rows.map((row) => `${row.reference.toLowerCase()}:${row.vendor.toLowerCase()}:${(row.product_or_service ?? '').toLowerCase()}`)); },
  async persist(actor, value) { const created = await createVendorDependency(actor, { ...value, customerId: await customerIdFor(actor.organizationId, value.clientIdentifier) }); return { entityType: 'vendor_dependency', entityId: created.id }; },
};
