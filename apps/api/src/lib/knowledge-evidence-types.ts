export type KnowledgeLibrary = { key: string; label: string };

export type KnowledgeScope = {
  timeRange?: string;
  contentFocus?: string;
};

export type KnowledgeContextOptions = {
  maxDocuments?: number;
  maxEvidence?: number;
  summaryLength?: number;
  includeExcerpt?: boolean;
  maxClaimsPerDocument?: number;
  maxEvidenceChunksPerDocument?: number;
  maxStructuredProfileEntries?: number;
  maxStructuredArrayValues?: number;
  maxStructuredObjectEntries?: number;
};
