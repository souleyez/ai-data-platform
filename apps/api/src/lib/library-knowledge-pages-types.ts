import type { DocumentExtractionFieldConflictStrategy } from './document-extraction-governance.js';

export type LibraryKnowledgePagesMode = 'none' | 'overview' | 'topics';

export type LibraryKnowledgeUpdateEntry = {
  documentId: string;
  title: string;
  summary: string;
  updatedAt: string;
};

export type LibraryKnowledgeRepresentativeDocument = {
  documentId: string;
  title: string;
  summary: string;
};

export type LibraryKnowledgeFocusedFieldCoverage = {
  key: string;
  alias: string;
  prompt: string;
  conflictStrategy: DocumentExtractionFieldConflictStrategy;
  populatedDocumentCount: number;
  totalDocumentCount: number;
  coverageRatio: number;
  resolvedValues: string[];
  sampleValues: string[];
};

export type LibraryKnowledgeFieldConflict = {
  key: string;
  alias: string;
  conflictStrategy: DocumentExtractionFieldConflictStrategy;
  values: string[];
  sampleDocumentTitles: string[];
};

export type LibraryKnowledgeCompilation = {
  version: 1;
  libraryKey: string;
  libraryLabel: string;
  description: string;
  mode: LibraryKnowledgePagesMode;
  updatedAt: string;
  trigger: string;
  documentCount: number;
  overview: string;
  keyTopics: string[];
  keyFacts: string[];
  focusedFieldSet?: string;
  focusedFieldCoverage?: LibraryKnowledgeFocusedFieldCoverage[];
  fieldConflicts?: LibraryKnowledgeFieldConflict[];
  suggestedQuestions: string[];
  representativeDocuments: LibraryKnowledgeRepresentativeDocument[];
  recentUpdates: LibraryKnowledgeUpdateEntry[];
  sourceDocumentIds: string[];
  sourceTitles: string[];
  pilotValidated?: boolean;
};
