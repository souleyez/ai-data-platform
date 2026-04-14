import { buildKnowledgeContext } from './knowledge-evidence.js';
import { buildLibraryKnowledgePagesContextBlock } from './library-knowledge-pages.js';
import type { RetrievalResult } from './document-retrieval.js';
import {
  buildKnowledgeFallbackOutput,
  buildKnowledgeMissMessage,
  buildReportInstruction,
  normalizeReportOutput,
  shouldUseResumePageFallbackOutput,
  type ChatOutput,
} from './knowledge-output.js';
import { buildKnowledgeDetailFallbackAnswer } from './knowledge-detail-fetch.js';
import {
  buildOpenClawMemorySelectionContextBlock,
  loadOpenClawMemorySelectionState,
  selectOpenClawMemoryDocumentCandidates,
  selectOpenClawMemoryDocumentCandidatesFromState,
} from './openclaw-memory-selection.js';
import { loadOpenClawMemoryCatalogSnapshot } from './openclaw-memory-catalog.js';
import {
  buildOpenClawLongTermMemoryContextBlock,
  buildOpenClawLongTermMemoryDirectAnswer,
  shouldAnswerFromOpenClawLongTermMemoryDirectory,
} from './openclaw-memory-directory.js';
import { isOrderInventoryDocumentSignal } from './document-domain-signals.js';
import type { BotDefinition } from './bot-definitions.js';
import { detectOutputKind } from './knowledge-plan.js';
import {
  buildKnowledgeAnswerPrompt,
  buildKnowledgeConceptPagePrompt,
  buildKnowledgeOutputPrompt,
} from './knowledge-prompts.js';
import {
  adaptSelectedTemplatesForRequest,
  buildTemplateCatalogContextBlock,
  buildTemplateCatalogSearchHints,
  inferKnowledgeTemplateTaskHintFromLibraries,
  listKnowledgeTemplateCatalogOptions,
  resolveRequestedSharedTemplate,
  selectKnowledgeTemplates,
  shouldUseConceptPageMode,
} from './knowledge-template.js';
import { isOpenClawGatewayConfigured, runOpenClawChat } from './openclaw-adapter.js';
import {
  buildConceptPageSupplyBlock,
  prepareKnowledgeRetrieval,
  prepareKnowledgeScope,
  prepareKnowledgeSupply,
} from './knowledge-supply.js';
import {
  buildReportPlan,
  buildReportPlanContextBlock,
  inferReportPlanTaskHint,
} from './report-planner.js';
import { attachDatavizRendersToOutput } from './report-dataviz.js';
import {
  buildResumeDisplayProfileContextBlock,
  runResumeDisplayProfileResolver,
} from './resume-display-profile-provider.js';
import {
  runOrderInventoryPageComposerDetailed,
  selectOrderInventoryEvidenceDocuments,
} from './order-inventory-page-composer.js';
import { runResumePageComposerDetailed } from './resume-page-composer.js';
import { loadWorkspaceSkillBundle } from './workspace-skills.js';

const ORDER_OUTPUT_MEMORY_LIMIT = 4;
const ORDER_OUTPUT_DOC_LIMIT = 4;
const ORDER_OUTPUT_EVIDENCE_LIMIT = 4;
const ORDER_OUTPUT_CONTEXT_OPTIONS = {
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

function refineOrderOutputRetrieval(
  retrieval: RetrievalResult,
): RetrievalResult {
  const documents = selectOrderInventoryEvidenceDocuments(
    retrieval.documents,
    { maxDocuments: ORDER_OUTPUT_DOC_LIMIT },
  );
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

export type KnowledgeExecutionInput = {
  prompt: string;
  confirmedRequest?: string;
  preferredLibraries?: Array<{ key: string; label: string }>;
  preferredTemplateKey?: string;
  timeRange?: string;
  contentFocus?: string;
  sessionUser?: string;
  debugResumePage?: boolean;
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  botDefinition?: BotDefinition | null;
  effectiveVisibleLibraryKeys?: string[];
  forceGlobalMemorySelection?: boolean;
};

export type ResumePageDebugTrace = {
  requestText: string;
  templateMode: 'concept-page' | 'shared-template';
  envelope: {
    title: string;
    pageSections: string[];
    outputHint: string;
  } | null;
  reportPlan: {
    objective: string;
    sections: string[];
    cards: string[];
    charts: string[];
    datavizSlots?: string[];
  } | null;
  displayProfiles: Array<{
    sourcePath: string;
    sourceName: string;
    displayName: string;
    displayCompany: string;
    displayProjects: string[];
    displaySkills: string[];
    displaySummary: string;
  }>;
  initialModelContent: string;
  initialOutput: ChatOutput | null;
  initialNeedsFallback: boolean;
  composerAttempted: boolean;
  composerAttemptModes: string[];
  composerSelectedAttempt: string;
  composerModelContent: string;
  composerOutput: ChatOutput | null;
  composerNeedsFallback: boolean | null;
  composerErrorMessage: string;
  errorStage: string;
  errorMessage: string;
  finalStage: 'initial-output' | 'composer-output' | 'fallback-output' | 'catch-fallback-output';
};

export type KnowledgeExecutionResult = {
  libraries: Array<{ key: string; label: string }>;
  output: ChatOutput;
  content: string;
  intent: 'report';
  mode: 'openclaw';
  reportTemplate?: { key: string; label: string; type: string } | null;
  debug?: {
    resumePage?: ResumePageDebugTrace;
  } | null;
};

export type KnowledgeAnswerInput = {
  prompt: string;
  preferredLibraries?: Array<{ key: string; label: string }>;
  timeRange?: string;
  contentFocus?: string;
  sessionUser?: string;
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  answerMode?: 'catalog_memory' | 'live_detail';
  botDefinition?: BotDefinition | null;
  effectiveVisibleLibraryKeys?: string[];
  forceGlobalMemorySelection?: boolean;
};

export type KnowledgeAnswerResult = {
  libraries: Array<{ key: string; label: string }>;
  output: ChatOutput;
  content: string;
  intent: 'general';
  mode: 'openclaw';
};

function buildKnowledgeCatalogAnswerContextBlock(input: {
  requestText: string;
  libraries: Array<{ key: string; label: string }>;
  detailDocuments?: number;
  detailEvidence?: number;
}) {
  const libraryText = input.libraries.length
    ? input.libraries.map((item) => item.label || item.key).join(' | ')
    : 'current knowledge catalog';
  return [
    'Current answer mode: direct knowledge answer',
    `Evidence state: ${input.detailDocuments ? 'catalog_memory + live_detail' : 'catalog_memory'}`,
    `Preferred libraries: ${libraryText}`,
    `Normalized request: ${input.requestText}`,
    input.detailDocuments
      ? `Supplied live detail: documents=${input.detailDocuments} evidence=${input.detailEvidence || 0}`
      : '',
  ].join('\n');
}

function looksLikeCatalogAccessMiss(content: string) {
  const text = String(content || '').replace(/\s+/g, '');
  if (!text) return true;
  return /没有直接连接|无法实时拉取|未连接到文档存储|需要确认.*(路径|位置|api|脚本)|提供访问方式|告诉我.*路径/.test(text);
}

export async function executeKnowledgeOutput(input: KnowledgeExecutionInput): Promise<KnowledgeExecutionResult> {
  const requestText = String(input.confirmedRequest || input.prompt).trim();
  const requestedKind = detectOutputKind(requestText) || 'page';
  const requestedTemplate = await resolveRequestedSharedTemplate(requestText, requestedKind);
  const requestedTemplateKey = requestedTemplate?.templateKey || input.preferredTemplateKey || '';
  const conceptPageMode = shouldUseConceptPageMode(requestedKind, requestedTemplateKey);

  if (requestedTemplate?.clarificationMessage && !requestedTemplate.templateKey) {
    return {
      libraries: input.preferredLibraries || [],
      output: { type: 'answer', content: requestedTemplate.clarificationMessage },
      content: requestedTemplate.clarificationMessage,
      intent: 'report',
      mode: 'openclaw',
      reportTemplate: null,
    };
  }

  const scopeState = await prepareKnowledgeScope({
    requestText,
    chatHistory: input.chatHistory,
    preferredLibraries: input.preferredLibraries,
    timeRange: input.timeRange,
    contentFocus: input.contentFocus,
    botDefinition: input.botDefinition,
    effectiveVisibleLibraryKeys: input.effectiveVisibleLibraryKeys,
  });

  const selectedTemplates = requestedTemplateKey
    ? adaptSelectedTemplatesForRequest(
      await selectKnowledgeTemplates(
        scopeState.libraries,
        requestedKind,
        requestedTemplateKey,
      ),
      requestText,
    )
    : [];
  const templateCatalogOptions = await listKnowledgeTemplateCatalogOptions(
    scopeState.libraries,
    requestedKind,
    requestedTemplateKey,
  );
  const templateTaskHint = inferReportPlanTaskHint({
    requestText,
    groupKey: scopeState.libraries.map((item) => item.key || '').join(' '),
    groupLabel: scopeState.libraries.map((item) => item.label || '').join(' '),
    templateKey: requestedTemplateKey || selectedTemplates[0]?.template.key || '',
    templateLabel: selectedTemplates[0]?.template.label || templateCatalogOptions[0]?.templateLabel || '',
    kind: requestedKind,
  }) || inferKnowledgeTemplateTaskHintFromLibraries(scopeState.libraries, requestedKind);
  const templateSearchHints = buildTemplateCatalogSearchHints(templateCatalogOptions);
  const isOrderInventoryPageRequest = requestedKind === 'page' && templateTaskHint === 'order-static-page';
  const memorySelection = await selectOpenClawMemoryDocumentCandidates({
    requestText,
    libraries: scopeState.libraries,
    limit: isOrderInventoryPageRequest
      ? ORDER_OUTPUT_MEMORY_LIMIT
      : (requestedKind === 'page' ? 10 : 8),
    botId: input.botDefinition?.id,
    forceGlobalState: input.forceGlobalMemorySelection,
    effectiveVisibleLibraryKeys: input.effectiveVisibleLibraryKeys,
  });
  const supply = await prepareKnowledgeRetrieval({
    requestText,
    timeRange: input.timeRange,
    contentFocus: input.contentFocus,
    docLimit: isOrderInventoryPageRequest ? ORDER_OUTPUT_DOC_LIMIT : 10,
    evidenceLimit: isOrderInventoryPageRequest ? ORDER_OUTPUT_EVIDENCE_LIMIT : 12,
    templateTaskHint,
    templateSearchHints,
    preferredDocumentIds: memorySelection.documentIds,
    ...scopeState,
  });
  const effectiveRetrieval = isOrderInventoryPageRequest
    ? refineOrderOutputRetrieval(supply.effectiveRetrieval)
    : supply.effectiveRetrieval;

  const resolvedLibraries = supply.libraries;
  if (!effectiveRetrieval.documents.length) {
    const content = buildKnowledgeMissMessage(resolvedLibraries);
    return {
      libraries: resolvedLibraries,
      output: { type: 'answer', content },
      content,
      intent: 'report',
      mode: 'openclaw',
      reportTemplate: selectedTemplates[0]
        ? {
            key: selectedTemplates[0].template.key,
            label: selectedTemplates[0].template.label,
            type: selectedTemplates[0].template.type,
          }
        : null,
    };
  }

  const supplySkillInstruction = await loadWorkspaceSkillBundle('knowledge-report-supply', [
    'references/supply-contract.md',
  ]);
  const datavizSkillInstruction = requestedKind === 'page'
    ? await loadWorkspaceSkillBundle('data-visualization-studio', [
      'references/visualization_types.md',
    ])
    : '';
  const reportPlan = requestedKind === 'page'
    ? buildReportPlan({
      requestText,
      templateTaskHint,
      conceptPageMode,
      selectedTemplates,
      retrieval: effectiveRetrieval,
      libraries: resolvedLibraries,
    })
    : null;
  const reportPlanContext = reportPlan ? buildReportPlanContextBlock(reportPlan) : '';
  const skillInstruction = [supplySkillInstruction, datavizSkillInstruction]
    .filter(Boolean)
    .join('\n\n');
  const templateCatalogContext = buildTemplateCatalogContextBlock(
    templateCatalogOptions,
    requestedTemplateKey,
  );
  const activeEnvelope = reportPlan?.envelope || (conceptPageMode ? null : (selectedTemplates[0]?.envelope || null));
  const resumeDisplayProfileResolution = requestedKind === 'page'
    ? await runResumeDisplayProfileResolver({
      requestText,
      documents: effectiveRetrieval.documents,
      sessionUser: input.sessionUser,
    })
    : null;
  const resumeDisplayProfileContext = buildResumeDisplayProfileContextBlock(resumeDisplayProfileResolution);
  const resumePageDebugTrace: ResumePageDebugTrace | null = input.debugResumePage && requestedKind === 'page'
    ? {
      requestText,
      templateMode: conceptPageMode ? 'concept-page' : 'shared-template',
      envelope: activeEnvelope
        ? {
          title: activeEnvelope.title || '',
          pageSections: activeEnvelope.pageSections || [],
          outputHint: activeEnvelope.outputHint || '',
        }
        : null,
      reportPlan: reportPlan
        ? {
          objective: reportPlan.objective || '',
          sections: (reportPlan.sections || []).map((item) => item.title),
          cards: (reportPlan.cards || []).map((item) => item.label),
          charts: (reportPlan.charts || []).map((item) => item.title),
          datavizSlots: (reportPlan.datavizSlots || []).map((item) => item.title),
        }
        : null,
      displayProfiles: (resumeDisplayProfileResolution?.profiles || []).map((profile) => ({
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
    }
    : null;
  const conceptPageContext = conceptPageMode
    ? buildConceptPageSupplyBlock({
      requestText,
      libraries: resolvedLibraries,
      retrieval: effectiveRetrieval,
      timeRange: input.timeRange,
      contentFocus: input.contentFocus,
      templateTaskHint,
    })
    : '';
  const memorySelectionContext = buildOpenClawMemorySelectionContextBlock(memorySelection);
  const libraryKnowledgePagesContext = await buildLibraryKnowledgePagesContextBlock(resolvedLibraries);

  let output: ChatOutput | null = null;
  let executionStage = 'composer-model';
  try {
    const canComposeResumePage = requestedKind === 'page' && (resumeDisplayProfileResolution?.profiles || []).length > 0;
    const canComposeOrderInventoryPage = requestedKind === 'page'
      && templateTaskHint === 'order-static-page'
      && effectiveRetrieval.documents.some((item) => (
        isOrderInventoryDocumentSignal(item)
        || String(item.schemaType || '').toLowerCase() === 'report'
        || String(item.schemaType || '').toLowerCase() === 'order'
      ));

    if (canComposeResumePage) {
      executionStage = 'composer-model';
      const composerResult = await runResumePageComposerDetailed({
        requestText,
        reportPlan,
        envelope: activeEnvelope,
        documents: effectiveRetrieval.documents,
        displayProfiles: resumeDisplayProfileResolution?.profiles || [],
        sessionUser: input.sessionUser,
      });
      const composedContent = composerResult.content;

      if (resumePageDebugTrace) {
        resumePageDebugTrace.composerAttempted = composerResult.attemptedModes.length > 0;
        resumePageDebugTrace.composerAttemptModes = composerResult.attemptedModes;
        resumePageDebugTrace.composerSelectedAttempt = composerResult.attemptMode;
        resumePageDebugTrace.composerModelContent = composedContent || '';
        resumePageDebugTrace.composerErrorMessage = composerResult.error;
      }

      if (composedContent) {
        executionStage = 'composer-normalize';
        const composedOutput = normalizeReportOutput(
          requestedKind,
          requestText,
          composedContent,
          activeEnvelope,
          effectiveRetrieval.documents,
          resumeDisplayProfileResolution?.profiles || [],
          {
            allowResumeFallback: false,
            datavizSlots: reportPlan?.datavizSlots || [],
            pageSpec: reportPlan?.pageSpec,
          },
        );
        const composerNeedsFallback = shouldUseResumePageFallbackOutput(
          requestText,
          composedOutput,
          effectiveRetrieval.documents,
        );
        if (resumePageDebugTrace) {
          resumePageDebugTrace.composerOutput = composedOutput;
          resumePageDebugTrace.composerNeedsFallback = composerNeedsFallback;
        }

        if (!composerNeedsFallback) {
          output = composedOutput;
          if (resumePageDebugTrace) resumePageDebugTrace.finalStage = 'composer-output';
        }
      } else if (resumePageDebugTrace && composerResult.error) {
        resumePageDebugTrace.errorStage = 'composer-model';
        resumePageDebugTrace.errorMessage = composerResult.error;
      }

      if (!output) {
        output = buildKnowledgeFallbackOutput(
          requestedKind,
          requestText,
          effectiveRetrieval.documents,
          activeEnvelope,
          resumeDisplayProfileResolution?.profiles || [],
        );
        if (resumePageDebugTrace) {
          resumePageDebugTrace.finalStage = 'fallback-output';
        }
      }
    }

    if (!output && canComposeOrderInventoryPage) {
      executionStage = 'composer-model';
      const composerResult = await runOrderInventoryPageComposerDetailed({
        requestText,
        reportPlan,
        envelope: activeEnvelope,
        documents: effectiveRetrieval.documents,
        sessionUser: input.sessionUser,
      });

      if (composerResult.content) {
        executionStage = 'composer-normalize';
        output = normalizeReportOutput(
          requestedKind,
          requestText,
          composerResult.content,
          activeEnvelope,
          effectiveRetrieval.documents,
          resumeDisplayProfileResolution?.profiles || [],
          {
            allowResumeFallback: false,
            datavizSlots: reportPlan?.datavizSlots || [],
            pageSpec: reportPlan?.pageSpec,
          },
        );
      }
    }

    if (!output) {
      executionStage = 'initial-model';
      const cloud = await runOpenClawChat({
        prompt: requestText,
        sessionUser: input.sessionUser,
        chatHistory: supply.knowledgeChatHistory,
        contextBlocks: [
          memorySelectionContext,
          conceptPageContext,
          reportPlanContext,
          resumeDisplayProfileContext,
          templateCatalogContext,
          libraryKnowledgePagesContext,
          buildKnowledgeContext(requestText, resolvedLibraries, effectiveRetrieval, {
            timeRange: input.timeRange,
            contentFocus: input.contentFocus,
          }, isOrderInventoryPageRequest ? ORDER_OUTPUT_CONTEXT_OPTIONS : undefined),
        ].filter(Boolean),
        systemPrompt: conceptPageMode
          ? buildKnowledgeConceptPagePrompt(
            skillInstruction,
            buildReportInstruction(requestedKind),
          )
          : buildKnowledgeOutputPrompt(
            skillInstruction,
            buildReportInstruction(requestedKind),
          ),
      });

      if (resumePageDebugTrace) {
        resumePageDebugTrace.initialModelContent = cloud.content;
      }

      executionStage = 'initial-normalize';
      const initialOutput = normalizeReportOutput(
        requestedKind,
        requestText,
        cloud.content,
        activeEnvelope,
        effectiveRetrieval.documents,
        resumeDisplayProfileResolution?.profiles || [],
        {
          allowResumeFallback: false,
          datavizSlots: reportPlan?.datavizSlots || [],
          pageSpec: reportPlan?.pageSpec,
        },
      );

      const needsResumeRetry = requestedKind === 'page'
        && shouldUseResumePageFallbackOutput(requestText, initialOutput, effectiveRetrieval.documents);
      if (resumePageDebugTrace) {
        resumePageDebugTrace.initialOutput = initialOutput;
        resumePageDebugTrace.initialNeedsFallback = needsResumeRetry;
      }

      output = needsResumeRetry
        ? buildKnowledgeFallbackOutput(
          requestedKind,
          requestText,
          effectiveRetrieval.documents,
          activeEnvelope,
          resumeDisplayProfileResolution?.profiles || [],
        )
        : initialOutput;
      if (resumePageDebugTrace) {
        resumePageDebugTrace.finalStage = needsResumeRetry ? 'fallback-output' : 'initial-output';
      }
    }
  } catch (error) {
    output = buildKnowledgeFallbackOutput(
      requestedKind,
      requestText,
      effectiveRetrieval.documents,
      activeEnvelope,
      resumeDisplayProfileResolution?.profiles || [],
    );
    if (resumePageDebugTrace) {
      resumePageDebugTrace.errorStage = executionStage;
      resumePageDebugTrace.errorMessage = error instanceof Error
        ? error.message
        : String(error || '');
      resumePageDebugTrace.finalStage = 'catch-fallback-output';
    }
  }

  const rawFinalOutput = output || buildKnowledgeFallbackOutput(
    requestedKind,
    requestText,
    effectiveRetrieval.documents,
    activeEnvelope,
    resumeDisplayProfileResolution?.profiles || [],
  );
  const finalOutput = await attachDatavizRendersToOutput(rawFinalOutput, {
    slots: reportPlan?.datavizSlots || [],
  });

  return {
    libraries: resolvedLibraries,
    output: finalOutput,
    content: finalOutput.content,
    intent: 'report',
    mode: 'openclaw',
    reportTemplate: selectedTemplates[0]
      ? {
          key: selectedTemplates[0].template.key,
          label: selectedTemplates[0].template.label,
          type: selectedTemplates[0].template.type,
        }
      : null,
    debug: resumePageDebugTrace ? { resumePage: resumePageDebugTrace } : null,
  };
}

export async function executeKnowledgeAnswer(input: KnowledgeAnswerInput): Promise<KnowledgeAnswerResult> {
  const requestText = String(input.prompt || '').trim();
  const preferLiveDetail = (input.answerMode || 'live_detail') === 'live_detail';
  const useExternalScopedMemory = input.forceGlobalMemorySelection === true;
  const [memoryState, catalogSnapshot] = await Promise.all([
    loadOpenClawMemorySelectionState({
      botId: input.botDefinition?.id,
      forceGlobalState: useExternalScopedMemory,
    }),
    loadOpenClawMemoryCatalogSnapshot(),
  ]);
  const memorySelection = selectOpenClawMemoryDocumentCandidatesFromState({
    state: memoryState,
    requestText,
    libraries: input.preferredLibraries,
    limit: preferLiveDetail ? 4 : 6,
    effectiveVisibleLibraryKeys: useExternalScopedMemory ? input.effectiveVisibleLibraryKeys : undefined,
  });

  let libraries = input.preferredLibraries || [];
  let knowledgeChatHistory = input.chatHistory;
  let effectiveRetrieval: RetrievalResult | null = null;

  if (preferLiveDetail && (libraries.length || memorySelection.documentIds.length)) {
    const supply = await prepareKnowledgeSupply({
      requestText,
      chatHistory: input.chatHistory,
      preferredLibraries: input.preferredLibraries,
      timeRange: input.timeRange,
      contentFocus: input.contentFocus,
      docLimit: 5,
      evidenceLimit: 6,
      preferredDocumentIds: memorySelection.documentIds,
      botDefinition: input.botDefinition,
      effectiveVisibleLibraryKeys: input.effectiveVisibleLibraryKeys,
    });
    libraries = supply.libraries;
    knowledgeChatHistory = supply.knowledgeChatHistory;
    effectiveRetrieval = supply.effectiveRetrieval.documents.length
      ? supply.effectiveRetrieval
      : null;
  }

  const fallbackContent = [
    buildOpenClawLongTermMemoryDirectAnswer({
      snapshot: catalogSnapshot,
      requestText,
      libraries,
      effectiveVisibleLibraryKeys: useExternalScopedMemory ? input.effectiveVisibleLibraryKeys : undefined,
    }),
    preferLiveDetail && effectiveRetrieval?.documents.length
      ? buildKnowledgeDetailFallbackAnswer({
        requestText,
        libraries,
        retrieval: effectiveRetrieval,
        timeRange: input.timeRange,
        contentFocus: input.contentFocus,
      })
      : '',
  ].filter(Boolean).join('\n\n') || buildKnowledgeMissMessage(libraries);

  if (!preferLiveDetail || shouldAnswerFromOpenClawLongTermMemoryDirectory(requestText)) {
    return {
      libraries,
      output: { type: 'answer', content: fallbackContent },
      content: fallbackContent,
      intent: 'general',
      mode: 'openclaw',
    };
  }

  if (!isOpenClawGatewayConfigured()) {
    return {
      libraries,
      output: { type: 'answer', content: fallbackContent },
      content: fallbackContent,
      intent: 'general',
      mode: 'openclaw',
    };
  }

  try {
    const skillInstruction = preferLiveDetail && effectiveRetrieval?.documents.length
      ? await loadWorkspaceSkillBundle('knowledge-detail-fetch', [
        'references/output-contract.md',
      ])
      : '';
    const libraryKnowledgePagesContext = await buildLibraryKnowledgePagesContextBlock(libraries);
    const cloud = await runOpenClawChat({
      prompt: requestText,
      sessionUser: input.sessionUser,
      chatHistory: knowledgeChatHistory,
      contextBlocks: [
        buildKnowledgeCatalogAnswerContextBlock({
          requestText,
          libraries,
          detailDocuments: effectiveRetrieval?.documents.length || 0,
          detailEvidence: effectiveRetrieval?.evidenceMatches.length || 0,
        }),
        buildOpenClawLongTermMemoryContextBlock({
          snapshot: catalogSnapshot,
          libraries,
          effectiveVisibleLibraryKeys: useExternalScopedMemory ? input.effectiveVisibleLibraryKeys : undefined,
        }),
        libraryKnowledgePagesContext,
        effectiveRetrieval?.documents.length
          ? buildKnowledgeContext(requestText, libraries, effectiveRetrieval, {
            timeRange: input.timeRange,
            contentFocus: input.contentFocus,
          })
          : '',
      ].filter(Boolean),
      systemPrompt: buildKnowledgeAnswerPrompt(skillInstruction),
    });
    const content = looksLikeCatalogAccessMiss(cloud.content)
      ? fallbackContent
      : cloud.content;

    return {
      libraries,
      output: { type: 'answer', content },
      content,
      intent: 'general',
      mode: 'openclaw',
    };
  } catch {
    return {
      libraries,
      output: { type: 'answer', content: fallbackContent },
      content: fallbackContent,
      intent: 'general',
      mode: 'openclaw',
    };
  }
}
