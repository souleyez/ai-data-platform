import type { RetrievalResult } from './document-retrieval.js';
import { isOrderInventoryDocumentSignal } from './document-domain-signals.js';
import { buildKnowledgeContext } from './knowledge-evidence.js';
import {
  buildKnowledgeFallbackOutput,
  buildReportInstruction,
  normalizeReportOutput,
  shouldUseResumePageFallbackOutput,
  type ChatOutput,
} from './knowledge-output.js';
import { runOpenClawChat } from './openclaw-adapter.js';
import {
  buildKnowledgeConceptPagePrompt,
  buildKnowledgeOutputPrompt,
} from './knowledge-prompts.js';
import { runOrderInventoryPageComposerDetailed } from './order-inventory-page-composer.js';
import type { ReportTemplateEnvelope } from './report-center.js';
import type { ReportPlan } from './report-planner.js';
import { runResumePageComposerDetailed } from './resume-page-composer.js';
import type { ResumeDisplayProfile } from './resume-display-profile-provider.js';
import type { ResumePageDebugTrace } from './knowledge-execution-types.js';
import { ORDER_OUTPUT_CONTEXT_OPTIONS } from './knowledge-execution-output-support.js';

type RequestedOutputKind = 'table' | 'page' | 'pdf' | 'ppt' | 'doc' | 'md';

function buildNormalizeOptions(reportPlan: ReportPlan | null) {
  return {
    allowResumeFallback: false,
    datavizSlots: reportPlan?.datavizSlots || [],
    pageSpec: reportPlan?.pageSpec,
  };
}

export async function runKnowledgeExecutionOutput(input: {
  requestText: string;
  requestedKind: RequestedOutputKind;
  sessionUser?: string;
  knowledgeChatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  resolvedLibraries: Array<{ key: string; label: string }>;
  effectiveRetrieval: RetrievalResult;
  activeEnvelope: ReportTemplateEnvelope | null;
  reportPlan: ReportPlan | null;
  resumeDisplayProfiles: ResumeDisplayProfile[];
  resumePageDebugTrace: ResumePageDebugTrace | null;
  conceptPageMode: boolean;
  skillInstruction: string;
  memorySelectionContext: string;
  conceptPageContext: string;
  reportPlanContext: string;
  resumeDisplayProfileContext: string;
  templateCatalogContext: string;
  libraryKnowledgePagesContext: string;
  timeRange?: string;
  contentFocus?: string;
  isOrderInventoryPageRequest: boolean;
  templateTaskHint: string;
}): Promise<ChatOutput> {
  let output: ChatOutput | null = null;
  let executionStage = 'composer-model';
  const normalizeOptions = buildNormalizeOptions(input.reportPlan);

  try {
    const canComposeResumePage = input.requestedKind === 'page' && input.resumeDisplayProfiles.length > 0;
    const canComposeOrderInventoryPage = input.requestedKind === 'page'
      && input.templateTaskHint === 'order-static-page'
      && input.effectiveRetrieval.documents.some((item) => (
        isOrderInventoryDocumentSignal(item)
        || String(item.schemaType || '').toLowerCase() === 'report'
        || String(item.schemaType || '').toLowerCase() === 'order'
      ));

    if (canComposeResumePage) {
      const composerResult = await runResumePageComposerDetailed({
        requestText: input.requestText,
        reportPlan: input.reportPlan,
        envelope: input.activeEnvelope,
        documents: input.effectiveRetrieval.documents,
        displayProfiles: input.resumeDisplayProfiles,
        sessionUser: input.sessionUser,
      });
      const composedContent = composerResult.content;

      if (input.resumePageDebugTrace) {
        input.resumePageDebugTrace.composerAttempted = composerResult.attemptedModes.length > 0;
        input.resumePageDebugTrace.composerAttemptModes = composerResult.attemptedModes;
        input.resumePageDebugTrace.composerSelectedAttempt = composerResult.attemptMode;
        input.resumePageDebugTrace.composerModelContent = composedContent || '';
        input.resumePageDebugTrace.composerErrorMessage = composerResult.error;
      }

      if (composedContent) {
        executionStage = 'composer-normalize';
        const composedOutput = normalizeReportOutput(
          input.requestedKind,
          input.requestText,
          composedContent,
          input.activeEnvelope,
          input.effectiveRetrieval.documents,
          input.resumeDisplayProfiles,
          normalizeOptions,
        );
        const composerNeedsFallback = shouldUseResumePageFallbackOutput(
          input.requestText,
          composedOutput,
          input.effectiveRetrieval.documents,
        );
        if (input.resumePageDebugTrace) {
          input.resumePageDebugTrace.composerOutput = composedOutput;
          input.resumePageDebugTrace.composerNeedsFallback = composerNeedsFallback;
        }

        if (!composerNeedsFallback) {
          output = composedOutput;
          if (input.resumePageDebugTrace) input.resumePageDebugTrace.finalStage = 'composer-output';
        }
      } else if (input.resumePageDebugTrace && composerResult.error) {
        input.resumePageDebugTrace.errorStage = 'composer-model';
        input.resumePageDebugTrace.errorMessage = composerResult.error;
      }

      if (!output) {
        output = buildKnowledgeFallbackOutput(
          input.requestedKind,
          input.requestText,
          input.effectiveRetrieval.documents,
          input.activeEnvelope,
          input.resumeDisplayProfiles,
        );
        if (input.resumePageDebugTrace) {
          input.resumePageDebugTrace.finalStage = 'fallback-output';
        }
      }
    }

    if (!output && canComposeOrderInventoryPage) {
      const composerResult = await runOrderInventoryPageComposerDetailed({
        requestText: input.requestText,
        reportPlan: input.reportPlan,
        envelope: input.activeEnvelope,
        documents: input.effectiveRetrieval.documents,
        sessionUser: input.sessionUser,
      });

      if (composerResult.content) {
        executionStage = 'composer-normalize';
        output = normalizeReportOutput(
          input.requestedKind,
          input.requestText,
          composerResult.content,
          input.activeEnvelope,
          input.effectiveRetrieval.documents,
          input.resumeDisplayProfiles,
          normalizeOptions,
        );
      }
    }

    if (!output) {
      executionStage = 'initial-model';
      const cloud = await runOpenClawChat({
        prompt: input.requestText,
        sessionUser: input.sessionUser,
        chatHistory: input.knowledgeChatHistory,
        contextBlocks: [
          input.memorySelectionContext,
          input.conceptPageContext,
          input.reportPlanContext,
          input.resumeDisplayProfileContext,
          input.templateCatalogContext,
          input.libraryKnowledgePagesContext,
          buildKnowledgeContext(
            input.requestText,
            input.resolvedLibraries,
            input.effectiveRetrieval,
            {
              timeRange: input.timeRange,
              contentFocus: input.contentFocus,
            },
            input.isOrderInventoryPageRequest ? ORDER_OUTPUT_CONTEXT_OPTIONS : undefined,
          ),
        ].filter(Boolean),
        systemPrompt: input.conceptPageMode
          ? buildKnowledgeConceptPagePrompt(
            input.skillInstruction,
            buildReportInstruction(input.requestedKind),
          )
          : buildKnowledgeOutputPrompt(
            input.skillInstruction,
            buildReportInstruction(input.requestedKind),
          ),
      });

      if (input.resumePageDebugTrace) {
        input.resumePageDebugTrace.initialModelContent = cloud.content;
      }

      executionStage = 'initial-normalize';
      const initialOutput = normalizeReportOutput(
        input.requestedKind,
        input.requestText,
        cloud.content,
        input.activeEnvelope,
        input.effectiveRetrieval.documents,
        input.resumeDisplayProfiles,
        normalizeOptions,
      );

      const needsResumeRetry = input.requestedKind === 'page'
        && shouldUseResumePageFallbackOutput(
          input.requestText,
          initialOutput,
          input.effectiveRetrieval.documents,
        );
      if (input.resumePageDebugTrace) {
        input.resumePageDebugTrace.initialOutput = initialOutput;
        input.resumePageDebugTrace.initialNeedsFallback = needsResumeRetry;
      }

      output = needsResumeRetry
        ? buildKnowledgeFallbackOutput(
          input.requestedKind,
          input.requestText,
          input.effectiveRetrieval.documents,
          input.activeEnvelope,
          input.resumeDisplayProfiles,
        )
        : initialOutput;
      if (input.resumePageDebugTrace) {
        input.resumePageDebugTrace.finalStage = needsResumeRetry ? 'fallback-output' : 'initial-output';
      }
    }
  } catch (error) {
    output = buildKnowledgeFallbackOutput(
      input.requestedKind,
      input.requestText,
      input.effectiveRetrieval.documents,
      input.activeEnvelope,
      input.resumeDisplayProfiles,
    );
    if (input.resumePageDebugTrace) {
      input.resumePageDebugTrace.errorStage = executionStage;
      input.resumePageDebugTrace.errorMessage = error instanceof Error
        ? error.message
        : String(error || '');
      input.resumePageDebugTrace.finalStage = 'catch-fallback-output';
    }
  }

  return output || buildKnowledgeFallbackOutput(
    input.requestedKind,
    input.requestText,
    input.effectiveRetrieval.documents,
    input.activeEnvelope,
    input.resumeDisplayProfiles,
  );
}
