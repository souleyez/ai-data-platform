import type { ReportTemplateType } from './report-standards.js';

export const REPORT_TEMPLATE_TYPES = ['table', 'static-page', 'ppt', 'document'] as const;
export const REQUEST_ADAPTER_ENVELOPE_KINDS = ['page', 'table'] as const;

export type GovernanceTemplateSpec = {
  suffix: string;
  label: string;
  type: ReportTemplateType;
  description: string;
  supported: boolean;
};

export type GovernanceEnvelope = {
  fixedStructure: string[];
  variableZones: string[];
  outputHint: string;
  tableColumns?: string[];
  pageSections?: string[];
};

export type GovernanceEnvelopeOverride = {
  title?: string;
  fixedStructure?: string[];
  variableZones?: string[];
  outputHint?: string;
  tableColumns?: string[];
  pageSections?: string[];
};

export type ReportGovernanceDatasourceProfile = {
  id: string;
  label: string;
  matchKeywords: string[];
  description: string;
  triggerKeywords: string[];
  defaultTemplateSuffix: string;
  templates: GovernanceTemplateSpec[];
};

export type ReportGovernanceTemplateProfile = {
  id: string;
  label: string;
  type: ReportTemplateType;
  matchKeywords: string[];
  envelope: GovernanceEnvelope;
};

export type ReportGovernanceSystemTemplate = {
  key: string;
  label: string;
  type: ReportTemplateType;
  description: string;
  supported: boolean;
  isDefault?: boolean;
};

export type ReportGovernanceRequestAdapterEnvelopeKind =
  typeof REQUEST_ADAPTER_ENVELOPE_KINDS[number];

export type ReportGovernanceRequestAdapterView = {
  id: string;
  label: string;
  matchKeywords: string[];
  kindOverrides: Partial<Record<ReportGovernanceRequestAdapterEnvelopeKind, GovernanceEnvelopeOverride>>;
};

export type ReportGovernanceRequestAdapterProfile = {
  id: string;
  label: string;
  matchKeywords: string[];
  defaultViewId: string;
  fallbackEnvelopeKind: ReportGovernanceRequestAdapterEnvelopeKind;
  views: ReportGovernanceRequestAdapterView[];
};

export type ReportGovernanceConfig = {
  version: number;
  updatedAt: string;
  datasourceProfiles: ReportGovernanceDatasourceProfile[];
  templateProfiles: ReportGovernanceTemplateProfile[];
  systemTemplates: ReportGovernanceSystemTemplate[];
  requestAdapterProfiles: ReportGovernanceRequestAdapterProfile[];
};

export type RequestedKnowledgeOutputKind = 'table' | 'page' | 'pdf' | 'ppt' | 'doc' | 'md';
