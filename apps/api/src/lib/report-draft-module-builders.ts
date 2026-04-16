import type {
  ReportDraftModule,
  ReportDraftModuleType,
  ReportOutputRecord,
} from './report-center.js';
import {
  classifyResearchSectionType,
  classifyRiskSectionType,
  classifySolutionSectionType,
  classifyTalentSectionType,
} from './report-draft-scenarios.js';
import { buildOperationsCockpitModules } from './report-draft-module-builders-operations.js';
import {
  buildPlaceholderModule,
  buildSequentialSectionModules,
} from './report-draft-module-builders-support.js';

export { buildPlaceholderModule } from './report-draft-module-builders-support.js';
export { buildOperationsCockpitModules } from './report-draft-module-builders-operations.js';

export function buildRiskBriefModules(record: ReportOutputRecord): ReportDraftModule[] {
  return buildSequentialSectionModules(record, classifyRiskSectionType);
}

export function buildResearchBriefModules(record: ReportOutputRecord): ReportDraftModule[] {
  return buildSequentialSectionModules(record, classifyResearchSectionType);
}

export function buildSolutionOverviewModules(record: ReportOutputRecord): ReportDraftModule[] {
  return buildSequentialSectionModules(record, classifySolutionSectionType);
}

export function buildTalentShowcaseModules(record: ReportOutputRecord): ReportDraftModule[] {
  return buildSequentialSectionModules(record, classifyTalentSectionType);
}
