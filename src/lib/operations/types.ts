export const OPHANIM_MEMBER_ROLES = ['owner', 'operations_manager', 'analyst', 'viewer'] as const;

export type OphanimMemberRole = (typeof OPHANIM_MEMBER_ROLES)[number];

export interface OrganizationActor {
  userId: string;
  organizationId: string;
  role: OphanimMemberRole;
}

export type OrganizationPermission =
  | 'shipment:read'
  | 'shipment:write'
  | 'shipment:archive'
  | 'disruption:read'
  | 'disruption:write'
  | 'rescue:read'
  | 'rescue:write'
  | 'vulnerability:read'
  | 'vulnerability:write'
  | 'organization:manage';
