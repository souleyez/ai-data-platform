import type { RetrievalResult } from './document-retrieval.js';
import { buildLibraryKnowledgePagesContextBlock } from './library-knowledge-pages.js';
import {
  buildKnowledgeMissMessage,
  buildReportInstruction,
  type ChatOutput,
} from './knowledge-output.js';
import { detectOutputKind } from './knowledge-plan.js';
import {
  selectOpenClawMemoryDocumentCandidates,
  buildOpenClawMemorySelectionContextBlock,
} from './openclaw-memory-selection.js';
import {
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
import { runOpenClawChat } from './openclaw-adapter.js';
import {
  buildConceptPageSupplyBlock,
  prepareKnowledgeRetrieval,
  prepareKnowledgeScope,
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
  selectOrderInventoryEvidenceDocuments,
} from './order-inventory-page-composer.js';
import { loadWorkspaceSkillBundle } from './workspace-skills.js';
import type {
  KnowledgeExecutionInput,
  KnowledgeExecutionResult,
} from './knowledge-execution-types.js';
import {
  buildKnowledgeReportTemplate,
  buildResumePageDebugTrace,
  ORDER_OUTPUT_DOC_LIMIT,
  ORDER_OUTPUT_EVIDENCE_LIMIT,
  ORDER_OUTPUT_MEMORY_LIMIT,
  refineOrderOutputRetrieval,
} from './knowledge-execution-output-support.js';
import { runKnowledgeExecutionOutput } from './knowledge-execution-output-runner.js';

type RequestedOutputKind = 'table' | 'page' | 'pdf' | 'ppt' | 'doc' | 'md';

export async function executeKnowledgeOutput(input: KnowledgeExecutionInput): Promise<KnowledgeExecutionResult> {
  const requestText = String(input.confirmedRequest || input.prompt).trim();
  const requestedKind: RequestedOutputKind = detectOutputKind(requestText) || 'page';
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
    ? refineOrderOutputRetrieval(
      supply.effectiveRetrieval,
      selectOrderInventoryEvidenceDocuments(supply.effectiveRetrieval.documents, {
        maxDocuments: ORDER_OUTPUT_DOC_LIMIT,
      }),
    )
    : supply.effectiveRetrieval;

  const resolvedLibraries = supply.libraries;
  const reportTemplate = buildKnowledgeReportTemplate(selectedTemplates[0]);
  if (!effectiveRetrieval.documents.length) {
    const content = buildKnowledgeMissMessage(resolvedLibraries);
    return {
      libraries: resolvedLibraries,
      output: { type: 'answer', content },
      content,
      intent: 'report',
      mode: 'openclaw',
      reportTemplate,
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
  const resumePageDebugTrace = buildResumePageDebugTrace({
    enabled: Boolean(input.debugResumePage && requestedKind === 'page'),
    requestText,
    conceptPageMode,
    activeEnvelope,
    reportPlan,
    resumeDisplayProfileResolution,
  });
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

  const rawFinalOutput = await runKnowledgeExecutionOutput({
    requestText,
    requestedKind,
    sessionUser: input.sessionUser,
    knowledgeChatHistory: supply.knowledgeChatHistory,
    resolvedLibraries,
    effectiveRetrieval,
    activeEnvelope,
    reportPlan,
    resumeDisplayProfiles: resumeDisplayProfileResolution?.profiles || [],
    resumePageDebugTrace,
    conceptPageMode,
    skillInstruction,
    memorySelectionContext,
    conceptPageContext,
    reportPlanContext,
    resumeDisplayProfileContext,
    templateCatalogContext,
    libraryKnowledgePagesContext,
    timeRange: input.timeRange,
    contentFocus: input.contentFocus,
    isOrderInventoryPageRequest,
    templateTaskHint,
  });
  const finalOutput = await attachDatavizRendersToOutput(rawFinalOutput, {
    slots: reportPlan?.datavizSlots || [],
  });

  return {
    libraries: resolvedLibraries,
    output: finalOutput,
    content: finalOutput.content,
    intent: 'report',
    mode: 'openclaw',
    reportTemplate,
    debug: resumePageDebugTrace ? { resumePage: resumePageDebugTrace } : null,
  };
}
