import type { RetrievalResult } from './document-retrieval.js';
import type { KnowledgeTemplateTaskHint, SelectedKnowledgeTemplate } from './knowledge-template.js';
import type { ReportTemplateEnvelope } from './report-center.js';

export type ReportPlanAudience = 'client';
export type ReportPlanTemplateMode = 'concept-page' | 'shared-template';
export type ReportPlanCompletionMode = 'knowledge-first' | 'knowledge-plus-model';
export type ReportPlanSectionDisplayMode = 'summary' | 'insight-list' | 'timeline' | 'comparison' | 'cta' | 'appendix';

export type ReportPlanSection = {
  title: string;
  purpose: string;
  evidenceFocus: string;
  completionMode: ReportPlanCompletionMode;
  displayMode: ReportPlanSectionDisplayMode;
  datavizSlotKeys?: string[];
};

export type ReportPlanCard = {
  label: string;
  purpose: string;
};

export type ReportPlanChart = {
  title: string;
  purpose: string;
};

export type ReportPlanDatavizSlot = {
  key: string;
  title: string;
  purpose: string;
  preferredChartType: 'bar' | 'horizontal-bar' | 'line';
  placement: 'hero' | 'section';
  sectionTitle?: string;
  evidenceFocus: string;
  minItems: number;
  maxItems: number;
};

export type ReportPlanPageSpecSection = {
  title: string;
  purpose: string;
  completionMode: ReportPlanCompletionMode;
  displayMode: ReportPlanSectionDisplayMode;
  datavizSlotKeys: string[];
};

export type ReportPlanLayoutVariant =
  | 'insight-brief'
  | 'risk-brief'
  | 'operations-cockpit'
  | 'talent-showcase'
  | 'research-brief'
  | 'solution-overview';

export type ReportPlanVisualMixModuleType =
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

export type ReportPlanVisualMixTarget = {
  moduleType: ReportPlanVisualMixModuleType;
  minCount: number;
  targetCount: number;
  maxCount: number;
};

export type ReportPlanPageSpec = {
  layoutVariant: ReportPlanLayoutVariant;
  heroCardLabels: string[];
  heroDatavizSlotKeys: string[];
  sections: ReportPlanPageSpecSection[];
};

export type ReportPlan = {
  audience: ReportPlanAudience;
  templateMode: ReportPlanTemplateMode;
  objective: string;
  envelope: ReportTemplateEnvelope;
  stylePriorities: string[];
  evidenceRules: string[];
  completionRules: string[];
  cards: ReportPlanCard[];
  charts: ReportPlanChart[];
  datavizSlots: ReportPlanDatavizSlot[];
  sections: ReportPlanSection[];
  pageSpec: ReportPlanPageSpec;
  mustHaveModules: string[];
  optionalModules: string[];
  evidencePriority: string[];
  audienceTone: string;
  riskNotes: string[];
  visualMixTargets: ReportPlanVisualMixTarget[];
  knowledgeScope: {
    libraryLabels: string[];
    documentCount: number;
    detailedCount: number;
    dominantTopics: string[];
    dominantSchemas: string[];
  };
};

export type ReportPlanQualityTargets = {
  mustHaveModules: string[];
  optionalModules: string[];
  evidencePriority: string[];
  audienceTone: string;
  riskNotes: string[];
  visualMixTargets: ReportPlanVisualMixTarget[];
};

export type ReportPlannerInput = {
  requestText: string;
  templateTaskHint?: KnowledgeTemplateTaskHint | null;
  conceptPageMode?: boolean;
  selectedTemplates?: SelectedKnowledgeTemplate[];
  baseEnvelope?: ReportTemplateEnvelope | null;
  retrieval: RetrievalResult;
  libraries: Array<{ key?: string; label?: string }>;
};

export type ReportPlanTaskHintInput = {
  requestText?: string;
  groupKey?: string;
  groupLabel?: string;
  templateKey?: string;
  templateLabel?: string;
  kind?: 'table' | 'page' | 'ppt' | 'pdf' | 'doc' | 'md';
};
