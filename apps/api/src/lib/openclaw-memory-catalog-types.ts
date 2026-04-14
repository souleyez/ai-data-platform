import type { OpenClawMemoryDocumentState } from './openclaw-memory-changes.js';
import type { SharedReportTemplate } from './report-center.js';

export type CatalogMemoryDetailLevel = 'shallow' | 'medium' | 'deep';

export type OpenClawMemoryLibrarySnapshot = {
  key: string;
  label: string;
  description: string;
  documentCount: number;
  availableCount: number;
  auditExcludedCount: number;
  structuredOnlyCount: number;
  unsupportedCount: number;
  latestUpdateAt: string;
  representativeDocumentTitles: string[];
  suggestedQuestionTypes: string[];
  memoryDetailLevel: CatalogMemoryDetailLevel;
};

export type OpenClawMemoryDocumentCard = OpenClawMemoryDocumentState & {
  path: string;
  title: string;
  name: string;
  schemaType: string;
  parseStatus: string;
  parseStage: string;
  detailParseStatus: string;
  topicTags: string[];
  detailLevel: CatalogMemoryDetailLevel;
  keyFacts: string[];
  evidenceHighlights: string[];
};

export type OpenClawMemoryTemplateSnapshot = {
  key: string;
  label: string;
  type: SharedReportTemplate['type'];
  description: string;
  origin: string;
  isDefault: boolean;
  supported: boolean;
  groupKeys: string[];
  groupLabels: string[];
  outputHint: string;
  fixedStructure: string[];
  variableZones: string[];
  pageSections: string[];
  tableColumns: string[];
  referenceNames: string[];
};

export type OpenClawMemoryReportOutputSnapshot = {
  id: string;
  title: string;
  kind: string;
  templateLabel: string;
  summary: string;
  libraryKeys: string[];
  libraryLabels: string[];
  triggerSource: 'report-center' | 'chat';
  createdAt: string;
  updatedAt: string;
  reusable: boolean;
};

export type OpenClawMemoryCatalogSnapshot = {
  version: number;
  generatedAt: string;
  libraryCount: number;
  documentCount: number;
  templateCount: number;
  outputCount: number;
  libraries: OpenClawMemoryLibrarySnapshot[];
  documents: OpenClawMemoryDocumentCard[];
  templates: OpenClawMemoryTemplateSnapshot[];
  outputs: OpenClawMemoryReportOutputSnapshot[];
};
