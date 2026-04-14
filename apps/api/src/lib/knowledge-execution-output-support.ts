import type { ParsedDocument } from './document-parser.js';
import type { RetrievalResult } from './document-retrieval.js';
import type { SelectedKnowledgeTemplate } from './knowledge-template.js';
import type { ReportTemplateEnvelope } from './report-center.js';
import type { ReportPlan } from './report-planner.js';
import type { ResumeDisplayProfileResolution } from './resume-display-profile-provider.js';
import type {
  KnowledgeExecutionResult,
  ResumePageDebugTrace,
} from './knowledge-execution-types.js';

export const ORDER_OUTPUT_MEMORY_LIMIT = 4;
export const ORDER_OUTPUT_DOC_LIMIT = 4;
export const ORDER_OUTPUT_EVIDENCE_LIMIT = 4;
export const ORDER_OUTPUT_CONTEXT_OPTIONS = {
  maxDocuments: 2,
  maxEvidence: 3,
  summaryLength: 120,
  includeExcerpt: false,
  maxClaimsPerDocument: 1,
  maxEvidenceChunksPerDocument: 1,
  maxStructuredProfileEntries: 4,
  maxStructuredArrayValues: 3,
  maxStructuredObjectEntries: 3,
} as const;

export function refineOrderOutputRetrieval(
  retrieval: RetrievalResult,
  documents: ParsedDocument[],
): RetrievalResult {
  if (!documents.length) return retrieval;

  const documentPaths = new Set(documents.map((item) => item.path));
  return {
    ...retrieval,
    documents,
    evidenceMatches: retrieval.evidenceMatches
      .filter((match) => documentPaths.has(match.item.path))
      .slice(0, ORDER_OUTPUT_EVIDENCE_LIMIT),
  };
}

export function buildKnowledgeReportTemplate(
  selectedTemplate: SelectedKnowledgeTemplate | null | undefined,
): KnowledgeExecutionResult['reportTemplate'] {
  if (!selectedTemplate) return null;
  return {
    key: selectedTemplate.template.key,
    label: selectedTemplate.template.label,
    type: selectedTemplate.template.type,
  };
}

export function buildResumePageDebugTrace(input: {
  enabled: boolean;
  requestText: string;
  conceptPageMode: boolean;
  activeEnvelope: ReportTemplateEnvelope | null;
  reportPlan: ReportPlan | null;
  resumeDisplayProfileResolution: ResumeDisplayProfileResolution | null;
}): ResumePageDebugTrace | null {
  if (!input.enabled) return null;

  return {
    requestText: input.requestText,
    templateMode: input.conceptPageMode ? 'concept-page' : 'shared-template',
    envelope: input.activeEnvelope
      ? {
        title: input.activeEnvelope.title || '',
        pageSections: input.activeEnvelope.pageSections || [],
        outputHint: input.activeEnvelope.outputHint || '',
      }
      : null,
    reportPlan: input.reportPlan
      ? {
        objective: input.reportPlan.objective || '',
        sections: (input.reportPlan.sections || []).map((item) => item.title),
        cards: (input.reportPlan.cards || []).map((item) => item.label),
        charts: (input.reportPlan.charts || []).map((item) => item.title),
        datavizSlots: (input.reportPlan.datavizSlots || []).map((item) => item.title),
      }
      : null,
    displayProfiles: (input.resumeDisplayProfileResolution?.profiles || []).map((profile) => ({
      sourcePath: profile.sourcePath,
      sourceName: profile.sourceName,
      displayName: profile.displayName,
      displayCompany: profile.displayCompany,
      displayProjects: profile.displayProjects,
      displaySkills: profile.displaySkills,
      displaySummary: profile.displaySummary,
    })),
    initialModelContent: '',
    initialOutput: null,
    initialNeedsFallback: false,
    composerAttempted: false,
    composerAttemptModes: [],
    composerSelectedAttempt: '',
    composerModelContent: '',
    composerOutput: null,
    composerNeedsFallback: null,
    composerErrorMessage: '',
    errorStage: '',
    errorMessage: '',
    finalStage: 'initial-output',
  };
}
