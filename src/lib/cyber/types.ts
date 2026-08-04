export const INVENTORY_VERIFICATION_STATES = ['verified', 'version_unknown', 'inventory_stale', 'verification_required', 'inventory_incomplete'] as const;
export type InventoryVerificationState = (typeof INVENTORY_VERIFICATION_STATES)[number];

export interface CyberClientInput {
  name: string;
  reference: string;
  timezone?: string;
  accountOwnerUserId?: string;
  technicalOwnerUserId?: string;
  securityContact?: string;
  executiveContact?: string;
  escalationContact?: string;
  serviceTier?: string;
  responseSlaHours?: number;
  remediationSlaHours?: number;
  tags?: string[];
}

export interface CyberAssetInput {
  customerId: string;
  assetName: string;
  assetType?: string;
  hostname?: string;
  domain?: string;
  ipAddress?: string;
  exposureScope?: 'public' | 'internal' | 'unknown';
  internetFacing?: boolean;
  vendor?: string;
  product?: string;
  productVersion?: string;
  operatingSystem?: string;
  softwarePackage?: string;
  cloudProvider?: string;
  cloudAccount?: string;
  cloudRegion?: string;
  environment?: string;
  criticality?: number;
  technicalOwner?: string;
  assetOwner?: string;
  inventorySource?: string;
  inventoryConfidence?: number;
  lastObservedAt?: string;
  lastVerifiedAt?: string;
  verificationStatus?: InventoryVerificationState;
}

export interface VendorDependencyInput {
  customerId: string;
  vendor: string;
  productOrService?: string;
  dependencyType?: 'service' | 'software' | 'cloud' | 'supplier' | 'integration' | 'other';
  businessCriticality?: number;
  internalOwner?: string;
  securityContact?: string;
  verificationStatus?: InventoryVerificationState;
  lastVerifiedAt?: string;
}
