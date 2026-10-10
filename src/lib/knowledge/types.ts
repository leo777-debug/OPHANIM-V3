export interface KnowledgeFilters { documentTypes?: string[]; asOf?: string; currentOnly?: boolean; shipmentId?: string }
export interface SourceReference { page?: number; sheet?: string; rowStart?: number; rowEnd?: number; heading?: string }
export interface ExtractedBlock { text: string; reference: SourceReference; table?: boolean }
export interface KnowledgeChunk {
  id: string; document_id: string; content: string; source_file: string; reference: SourceReference;
  document_type: string; language: string; published_at: string | null; valid_from: string | null; valid_to: string | null; score?: number;
}
export interface KnowledgeStatement { label: 'FACT' | 'INFERENCE' | 'NOT FOUND'; text: string; citations: string[]; quote?: string }
export interface SharedMetadata {
  source: string; source_url: string; licence: string; licence_url: string; commercial_use: boolean; customer_data: false;
  reviewed_at: string; attribution: string; published_at: string; valid_from: string; valid_to: string | null; region: string; language: string;
}
