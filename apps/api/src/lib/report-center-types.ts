import type {
  ReportPlanDatavizSlot,
  ReportPlanLayoutVariant,
  ReportPlanPageSpec,
  ReportPlanVisualMixTarget,
} from './report-planner.js';

export type ReportTemplateType = 'table' | 'static-page' | 'ppt' | 'document';

export type ReportReferenceSourceType = 'word' | 'ppt' | 'spreadsheet' | 'image' | 'web-link' | 'other';

export type ReportReferenceImage = {
  id: string;
  fileName: string;
  originalName: string;
  uploadedAt: string;
  relativePath: string;
  kind?: 'file' | 'link';
  sourceType?: ReportReferenceSourceType;
  mimeType?: string;
  size?: number;
  url?: string;
};

export type ReportGroupTemplate = {
  key: string;
  label: string;
  type: ReportTemplateType;
  description: string;
  supported: boolean;
};

export type ReportGroup = {
  key: string;
  label: string;
  description: string;
  triggerKeywords: string[];
  defaultTemplateKey: string;
  templates: ReportGroupTemplate[];
  referenceImages: ReportReferenceImage[];
};

export type SharedReportTemplate = {
  key: string;
  label: string;
  type: ReportTemplateType;
  description: string;
  preferredLayoutVariant?: ReportPlanLayoutVariant;
  supported: boolean;
  isDefault?: boolean;
  origin?: 'system' | 'user';
  createdAt?: string;
  referenceImages: ReportReferenceImage[];
};

export type ReportTemplateEnvelope = {
  title: string;
  fixedStructure: string[];
  variableZones: string[];
  outputHint: string;
  tableColumns?: string[];
  pageSections?: string[];
};

export type ReportDynamicSource = {
  enabled: boolean;
  request: string;
  outputType: 'table' | 'page' | 'ppt' | 'pdf' | 'doc' | 'md';
  conceptMode?: boolean;
  templateKey?: string;
  templateLabel?: string;
  timeRange?: string;
  contentFocus?: string;
  libraries: Array<{ key?: string; label?: string }>;
  updatedAt?: string;
  lastRenderedAt?: string;
  sourceFingerprint?: string;
  sourceDocumentCount?: number;
  sourceUpdatedAt?: string;
  planAudience?: string;
  planObjective?: string;
  planTemplateMode?: string;
  planSectionTitles?: string[];
  planCardLabels?: string[];
  planChartTitles?: string[];
  planMustHaveModules?: string[];
  planOptionalModules?: string[];
  planEvidencePriority?: string[];
  planAudienceTone?: string;
  planRiskNotes?: string[];
  planVisualMixTargets?: ReportPlanVisualMixTarget[];
  planDatavizSlots?: ReportPlanDatavizSlot[];
  planPageSpec?: ReportPlanPageSpec;
  planUpdatedAt?: string;
};

export type ReportOutputStatus =
  | 'processing'
  | 'draft_planned'
  | 'draft_generated'
  | 'draft_reviewing'
  | 'final_generating'
  | 'ready'
  | 'failed';

export type ReportVisualStylePreset =
  | 'signal-board'
  | 'midnight-glass'
  | 'editorial-brief'
  | 'minimal-canvas';

export type ReportDraftModuleType =
  | 'hero'
  | 'summary'
  | 'metric-grid'
  | 'insight-list'
  | 'table'
  | 'chart'
  | 'timeline'
  | 'comparison'
  | 'cta'
  | 'appendix';

export type ReportDraftModuleStatus = 'generated' | 'edited' | 'disabled';

export type ReportDraftReviewStatus = 'draft_generated' | 'draft_reviewing' | 'approved';
export type ReportDraftReadiness = 'ready' | 'needs_attention' | 'blocked';
export type ReportDraftChecklistStatus = 'pass' | 'warning' | 'fail';
export type ReportDraftHistoryAction = 'saved' | 'module-revised' | 'structure-revised' | 'copy-revised' | 'finalized' | 'restored';

export type ReportDraftChecklistItem = {
  key: string;
  label: string;
  status: ReportDraftChecklistStatus;
  detail?: string;
  blocking?: boolean;
};

export type ReportDraftEvidenceCoverage = {
  coveredModules: number;
  totalModules: number;
  ratio: number;
};

export type ReportDraftHistorySnapshot = {
  reviewStatus: ReportDraftReviewStatus;
  version: number;
  modules: ReportDraftModule[];
  lastEditedAt?: string;
  approvedAt?: string;
  audience?: string;
  objective?: string;
  layoutVariant?: ReportPlanLayoutVariant;
  visualStyle?: ReportVisualStylePreset;
  mustHaveModules?: string[];
  optionalModules?: string[];
  evidencePriority?: string[];
  audienceTone?: string;
  riskNotes?: string[];
  visualMixTargets?: ReportPlanVisualMixTarget[];
};

export type ReportDraftHistoryEntry = {
  id: string;
  action: ReportDraftHistoryAction;
  label: string;
  detail?: string;
  createdAt: string;
  snapshot?: ReportDraftHistorySnapshot | null;
};

export type ReportDraftModule = {
  moduleId: string;
  moduleType: ReportDraftModuleType;
  title: string;
  purpose: string;
  contentDraft: string;
  evidenceRefs: string[];
  chartIntent?: {
    title?: string;
    preferredChartType?: ReportPlanDatavizSlot['preferredChartType'];
    items?: Array<{ label?: string; value?: number }>;
  } | null;
  cards?: Array<{ label?: string; value?: string; note?: string }>;
  bullets?: string[];
  enabled: boolean;
  status: ReportDraftModuleStatus;
  order: number;
  layoutType?: string;
};

export type ReportOutputDraft = {
  reviewStatus: ReportDraftReviewStatus;
  version: number;
  modules: ReportDraftModule[];
  history?: ReportDraftHistoryEntry[];
  lastEditedAt?: string;
  approvedAt?: string;
  audience?: string;
  objective?: string;
  layoutVariant?: ReportPlanLayoutVariant;
  visualStyle?: ReportVisualStylePreset;
  mustHaveModules?: string[];
  optionalModules?: string[];
  evidencePriority?: string[];
  audienceTone?: string;
  riskNotes?: string[];
  visualMixTargets?: ReportPlanVisualMixTarget[];
  readiness?: ReportDraftReadiness;
  qualityChecklist?: ReportDraftChecklistItem[];
  missingMustHaveModules?: string[];
  evidenceCoverage?: ReportDraftEvidenceCoverage;
};

export type ReportOutputRecord = {
  id: string;
  groupKey: string;
  groupLabel: string;
  templateKey: string;
  templateLabel: string;
  title: string;
  outputType: string;
  kind?: 'table' | 'page' | 'ppt' | 'pdf' | 'doc' | 'md';
  format?: string;
  createdAt: string;
  status: ReportOutputStatus;
  summary: string;
  triggerSource: 'report-center' | 'chat';
  content?: string;
  table?: {
    columns?: string[];
    rows?: Array<Array<string | number | null>>;
    title?: string;
  } | null;
  page?: {
    summary?: string;
    cards?: Array<{ label?: string; value?: string; note?: string }>;
    sections?: Array<{ title?: string; body?: string; bullets?: string[]; displayMode?: string }>;
    datavizSlots?: ReportPlanDatavizSlot[];
    pageSpec?: ReportPlanPageSpec;
    visualStyle?: ReportVisualStylePreset;
    charts?: Array<{
      title?: string;
      items?: Array<{ label?: string; value?: number }>;
      render?: {
        renderer?: string;
        chartType?: string;
        svg?: string;
        alt?: string;
        generatedAt?: string;
      } | null;
    }>;
  } | null;
  libraries?: Array<{ key?: string; label?: string }>;
  downloadUrl?: string;
  dynamicSource?: ReportDynamicSource | null;
  draft?: ReportOutputDraft | null;
};

export type PersistedState = {
  version: number;
  groups: Array<Pick<ReportGroup, 'key' | 'label' | 'description' | 'triggerKeywords' | 'defaultTemplateKey' | 'templates' | 'referenceImages'>>;
  templates: SharedReportTemplate[];
  outputs: ReportOutputRecord[];
};
