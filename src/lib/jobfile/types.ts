import type { BoundingBox, InvoiceLine } from './checks';
import type { ReferenceType } from './identifiers';
import type { OrganizationActor } from '@/lib/operations/types';
import type { Repo } from './repo';

export const JOB_MODES = ['air_export', 'air_import', 'sea_import', 'sea_export', 'road', 'multimodal'] as const;
export type JobMode = (typeof JOB_MODES)[number];
export const HANDOFFS = ['booked', 'received', 'manifested', 'landed', 'terminal_received', 'warehouse_tally', 'delivered'] as const;
export type Handoff = (typeof HANDOFFS)[number];

export type JobActor = OrganizationActor & { demo: boolean; system?: boolean; displayName?: string | null };
export type Ctx = { repo: Repo; actor: JobActor; now?: () => number };

export type JobFile = {
  id: string; organizationId: string; shipmentId: string | null; jobNumber: string; mode: JobMode; status: string; clientCounterpartyId: string | null;
  clientName: string | null; origin: string | null; destination: string | null; plannedDepartureAt: string | null; plannedArrivalAt: string | null;
  goodsDescription: string | null; declaredValue: number | null; currency: string | null; createdFrom: string; isSynthetic: boolean;
  assignedUserId: string | null; createdAt: string; updatedAt: string;
};
export type JobReference = { id: string; jobFileId: string; type: ReferenceType; value: string; normalizedValue: string; validated: boolean; validationCode: string | null; source: string };
export type JobLeg = { id: string; jobFileId: string; sequence: number; mode: 'air' | 'sea' | 'road' | 'rail'; fromLocation: string | null; toLocation: string | null; carrier: string | null; transportRef: string | null; plannedDepartureAt: string | null; plannedArrivalAt: string | null };
export type JobMilestone = {
  id: string; jobFileId: string; legId: string | null; code: string; sequence: number; plannedAt: string | null; expectedAt: string | null; actualAt: string | null;
  source: string | null; sourceKey: string | null; reportedAt: string | null; confidence: number | null; evidenceDocumentId: string | null; evidenceText: string | null; needsConfirmation: boolean;
};
export type PieceCount = { id: string; jobFileId: string; handoff: Handoff; pieces: number; weightKg: number | null; source: string; documentId: string | null; photoDocumentId: string | null; recordedAt: string };
export type ExtractedField = { id: string; documentId: string; jobFileId: string | null; field: string; value: string | null; normalizedValue: string | null; confidence: number; page: number; bbox: BoundingBox | null; reader: string; status: 'suggested' | 'auto_accepted' | 'confirmed' | 'corrected' | 'rejected'; confirmedByUserId: string | null; confirmedAt: string | null };
export type JobDocument = {
  id: string; jobFileId: string | null; intakeItemId: string | null; docTypeCode: string | null; documentType: string; originalFileName: string; storagePath: string; mimeType: string;
  fileSizeBytes: number; pages: number | null; receivedVia: string | null; receivedAt: string | null; originalCreatedAt: string | null; previousVersionId: string | null; versionNumber: number;
  reader: string | null; classificationConfidence: number | null; textContent: string | null; createdByUserId: string | null; createdAt: string; fields?: ExtractedField[]; lines?: InvoiceLine[];
};
export type FlagRecord = {
  id: string; jobFileId: string | null; documentIds: string[]; checkCode: string; severity: 'info' | 'warn' | 'block'; messageEn: string; messageAr: string; whyEn: string; whyAr: string; fixEn: string; fixAr: string;
  details: { params?: Record<string, string | number>; fields?: Array<{ documentId: string; field: string }> }; fingerprint: string; status: 'open' | 'fixed' | 'accepted_difference' | 'false_alarm';
  raisedForUserId: string | null; resolvedByUserId: string | null; resolvedAt: string | null; createdAt: string;
};
export type IntakeItem = { id: string; channel: 'email' | 'whatsapp' | 'photo' | 'upload'; externalId: string | null; sender: string | null; subject: string | null; bodyText: string | null; receivedAt: string; status: string; matchedJobFileId: string | null; referencesFound: unknown[]; matchCandidates: unknown[] };
export type Invoice = {
  id: string; jobFileId: string | null; direction: 'outgoing' | 'incoming'; counterpartyId: string | null; counterpartyName: string | null; invoiceNumber: string | null; lines: Array<InvoiceLine & { code?: string; vatRate?: number }>;
  subtotal: number; vatAmount: number; total: number; currency: string; quoteTotal: number | null; delayCostKind: 'storage' | 'demurrage' | 'detention' | null; status: string; einvoiceStatus: string;
  issuedAt: string | null; dueAt: string | null; paidAt: string | null; disputedAt: string | null; createdAt: string;
};
export type Activity = { id: string; action: string; subjectType: string; subjectId: string | null; actorUserId: string | null; metadata: Record<string, unknown>; createdAt: string };
