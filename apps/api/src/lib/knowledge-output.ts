import type { ParsedDocument } from './document-parser.js';
import type { ReportTemplateEnvelope } from './report-center.js';
import {
  isObject,
  looksLikeStructuredReportPayload,
} from './knowledge-output-normalization.js';
import {
  shouldUseResumePageFallbackOutput,
} from './knowledge-output-resume-fallback.js';
import type { ResumeDisplayProfile } from './resume-display-profile-provider.js';
import type { ChatOutput, NormalizeReportOutputOptions } from './knowledge-output-types.js';
import {
  buildKnowledgeFallbackOutput,
  buildKnowledgeMissMessage,
  buildReportInstruction,
  isNarrativeOutputKind,
} from './knowledge-output-fallback.js';
import {
  buildNormalizeReportOutputContext,
  type ReportOutputKind,
} from './knowledge-output-support.js';
import { normalizeNarrativeReportOutput } from './knowledge-output-page.js';
import { normalizeTabularReportOutput } from './knowledge-output-table.js';

export type { ChatOutput, NormalizeReportOutputOptions } from './knowledge-output-types.js';
export {
  buildKnowledgeFallbackOutput,
  buildKnowledgeMissMessage,
  buildReportInstruction,
} from './knowledge-output-fallback.js';

export function normalizeReportOutput(
  kind: ReportOutputKind,
  requestText: string,
  rawContent: string,
  envelope?: ReportTemplateEnvelope | null,
  documents: ParsedDocument[] = [],
  displayProfiles: ResumeDisplayProfile[] = [],
  options: NormalizeReportOutputOptions = {},
): ChatOutput {
  const context = buildNormalizeReportOutputContext(kind, rawContent, envelope);

  if (isNarrativeOutputKind(kind)) {
    return normalizeNarrativeReportOutput({
      kind,
      requestText,
      envelope,
      documents,
      displayProfiles,
      options,
      context,
    });
  }

  return normalizeTabularReportOutput({
    requestText,
    rawContent,
    envelope,
    documents,
    displayProfiles,
    context,
  });
}

export { shouldUseResumePageFallbackOutput };
