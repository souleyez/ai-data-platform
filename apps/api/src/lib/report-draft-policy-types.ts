import type { ReportDraftModuleType } from './report-center.js';
import type { ReportPlanVisualMixTarget } from './report-planner.js';

export type DraftComposerPolicy = {
  audienceTone: string;
  minCounts: Partial<Record<ReportDraftModuleType, number>>;
  maxCounts?: Partial<Record<ReportDraftModuleType, number>>;
  preferredOrder: ReportDraftModuleType[];
  placeholderTitles?: Partial<Record<ReportDraftModuleType, string>>;
  semanticMustHaveTitles?: string[];
  evidencePriorityTitles?: string[];
  evidenceRequiredTypes?: ReportDraftModuleType[];
  overflowTargetTypes?: Partial<Record<ReportDraftModuleType, ReportDraftModuleType>>;
};

export type ResolvedDraftComposerTargets = {
  mustHaveTitles: string[];
  optionalTitles: string[];
  evidencePriorityTitles: string[];
  audienceTone: string;
  riskNotes: string[];
  visualMixTargets: ReportPlanVisualMixTarget[];
};
