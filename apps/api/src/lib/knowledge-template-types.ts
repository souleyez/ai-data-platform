import type {
  ReportGroup,
  ReportTemplateEnvelope,
  SharedReportTemplate,
} from './report-center.js';

export type KnowledgeOutputKind = 'table' | 'page' | 'pdf' | 'ppt' | 'doc' | 'md';
export type KnowledgeTemplateTaskHint =
  | 'general'
  | 'resume-comparison'
  | 'formula-table'
  | 'formula-static-page'
  | 'bids-table'
  | 'bids-static-page'
  | 'footfall-static-page'
  | 'paper-table'
  | 'paper-static-page'
  | 'order-static-page'
  | 'contract-risk'
  | 'technical-summary'
  | 'iot-table'
  | 'iot-static-page';

export type SelectedKnowledgeTemplate = {
  group: ReportGroup;
  template: SharedReportTemplate;
  envelope: ReportTemplateEnvelope;
};

export type RequestedSharedTemplate = {
  templateKey: string;
  clarificationMessage: string;
};

export type KnowledgeTemplateCatalogOption = {
  groupKey: string;
  groupLabel: string;
  templateKey: string;
  templateLabel: string;
  templateType: SharedReportTemplate['type'];
  description: string;
  origin: string;
  isDefault: boolean;
  outputHint: string;
  fixedStructure: string[];
  variableZones: string[];
  pageSections: string[];
  tableColumns: string[];
  referenceNames: string[];
  score: number;
};
