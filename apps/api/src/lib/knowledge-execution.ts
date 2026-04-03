import { buildKnowledgeContext } from './knowledge-evidence.js';
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
  type OpenClawMemorySelection,
} from './openclaw-memory-selection.js';
import type { BotDefinition } from './bot-definitions.js';
import type {
  OpenClawMemoryChange,
  OpenClawMemoryState,
} from './openclaw-memory-changes.js';
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
} from './report-planner.js';
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

function formatCatalogTimestamp(value: string) {
  const text = String(value || '').trim();
  if (!text) return '-';
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed) || parsed <= 0) return text;
  return new Date(parsed).toISOString();
}

function trimCatalogText(value: unknown, maxLength = 120) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLength
    ? `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`
    : text;
}

function isCatalogSelectableAvailability(value: string) {
  return value === 'available' || value === 'structured-only';
}

function formatCatalogChange(change: OpenClawMemoryChange) {
  const type = change.type === 'added'
    ? 'added'
    : change.type === 'updated'
      ? 'updated'
      : change.type === 'deleted'
        ? 'deleted'
        : change.type === 'audit-excluded'
          ? 'audit excluded'
          : 'audit restored';
  return `${type} | ${trimCatalogText(change.title, 72)} | at=${formatCatalogTimestamp(change.happenedAt)}`;
}

function resolveCatalogFocusLibraries(input: {
  libraries: Array<{ key: string; label: string }>;
  selection: OpenClawMemorySelection;
}) {
  const resolved = new Map<string, string>();
  for (const library of input.libraries) {
    const key = String(library.key || '').trim();
    if (!key) continue;
    resolved.set(key, String(library.label || library.key).trim() || key);
  }
  if (!resolved.size) {
    for (const candidate of input.selection.candidates) {
      for (const key of candidate.libraryKeys) {
        const normalizedKey = String(key || '').trim();
        if (!normalizedKey || resolved.has(normalizedKey)) continue;
        resolved.set(normalizedKey, normalizedKey);
      }
    }
  }
  return resolved;
}

type CatalogLibrarySnapshot = {
  key: string;
  label: string;
  documents: OpenClawMemoryState['documents'][string][];
  usableCount: number;
  excludedCount: number;
  latestUpdateAt: string;
  recentTitles: string[];
};

function collectKnowledgeCatalogLibrarySnapshots(input: {
  state: OpenClawMemoryState | null;
  libraries: Array<{ key: string; label: string }>;
  selection: OpenClawMemorySelection;
}) {
  const documents = Object.values(input.state?.documents || {});
  if (!documents.length) return [];

  const explicitFocusLibraries = resolveCatalogFocusLibraries({
    libraries: input.libraries,
    selection: input.selection,
  });
  let focusLibraries = explicitFocusLibraries;
  let resolvedKeys = [...focusLibraries.keys()];

  if (resolvedKeys.length) {
    const hasMatchingDocuments = documents.some((item) => item.libraryKeys.some((key) => focusLibraries.has(key)));
    if (!hasMatchingDocuments && input.selection.candidates.length) {
      focusLibraries = resolveCatalogFocusLibraries({
        libraries: [],
        selection: input.selection,
      });
      resolvedKeys = [...focusLibraries.keys()];
    }
  }

  if (!resolvedKeys.length && input.selection.candidates.length) {
    focusLibraries = resolveCatalogFocusLibraries({
      libraries: [],
      selection: input.selection,
    });
    resolvedKeys = [...focusLibraries.keys()];
  }

  if (!resolvedKeys.length) {
    resolvedKeys = ['__all__'];
  }

  return resolvedKeys
    .map((key) => {
      const label = key === '__all__' ? '当前知识库目录' : (focusLibraries.get(key) || key);
      const libraryDocuments = key === '__all__'
        ? documents
        : documents.filter((item) => item.libraryKeys.includes(key));
      if (!libraryDocuments.length) return null;

      const sortedDocuments = [...libraryDocuments].sort((left, right) => (
        Date.parse(String(right.updatedAt || '')) - Date.parse(String(left.updatedAt || ''))
      ));
      const latestDocument = sortedDocuments.find((item) => String(item.updatedAt || '').trim());
      return {
        key,
        label,
        documents: libraryDocuments,
        usableCount: libraryDocuments.filter((item) => isCatalogSelectableAvailability(item.availability)).length,
        excludedCount: libraryDocuments.filter((item) => item.availability === 'audit-excluded').length,
        latestUpdateAt: latestDocument?.updatedAt || '',
        recentTitles: sortedDocuments
          .slice(0, 3)
          .map((item) => trimCatalogText(item.title, 48))
          .filter(Boolean),
      } satisfies CatalogLibrarySnapshot;
    })
    .filter((item): item is CatalogLibrarySnapshot => Boolean(item));
}

function buildKnowledgeCatalogStateContextBlock(input: {
  state: OpenClawMemoryState | null;
  libraries: Array<{ key: string; label: string }>;
  selection: OpenClawMemorySelection;
}) {
  const librarySnapshots = collectKnowledgeCatalogLibrarySnapshots(input);
  if (!librarySnapshots.length) return '';

  const lines = [
    'Current catalog snapshot:',
    `Generated at: ${formatCatalogTimestamp(input.state?.generatedAt || '')}`,
  ];

  const libraryLines = librarySnapshots
    .map((snapshot) => [
      `${snapshot.label} | documents=${snapshot.documents.length} | usable=${snapshot.usableCount} | excluded=${snapshot.excludedCount}`,
      snapshot.latestUpdateAt ? `latest update=${formatCatalogTimestamp(snapshot.latestUpdateAt)}` : '',
      snapshot.recentTitles.length ? `recent titles=${snapshot.recentTitles.join(' | ')}` : '',
    ]
      .filter(Boolean)
      .join(' | '))
    .filter(Boolean);

  if (libraryLines.length) {
    lines.push(...libraryLines);
  }

  const focusKeys = new Set(librarySnapshots.map((item) => item.key).filter((key) => key !== '__all__'));
  const recentChanges = (input.state?.recentChanges || [])
    .filter((change) => !focusKeys.size || change.libraryKeys.some((key) => focusKeys.has(key)))
    .slice(0, 4);
  if (recentChanges.length) {
    lines.push('Recent catalog changes:');
    lines.push(...recentChanges.map((change) => `- ${formatCatalogChange(change)}`));
  }

  return lines.join('\n');
}

function buildKnowledgeCatalogSelectionDetailBlock(selection: OpenClawMemorySelection) {
  if (!selection.candidates.length) return '';
  return [
    'Catalog-selected document summaries:',
    ...selection.candidates.slice(0, 4).map((item, index) => (
      `${index + 1}. ${trimCatalogText(item.title, 72)} | updatedAt=${formatCatalogTimestamp(item.updatedAt)} | summary=${trimCatalogText(item.summary, 140)}`
    )),
  ].join('\n');
}

function buildKnowledgeCatalogFallbackAnswer(input: {
  requestText: string;
  libraries: Array<{ key: string; label: string }>;
  state: OpenClawMemoryState | null;
  selection: OpenClawMemorySelection;
}) {
  const snapshots = collectKnowledgeCatalogLibrarySnapshots(input);
  const libraryText = snapshots.length
    ? snapshots.map((item) => item.label).join('、')
    : input.libraries.length
      ? input.libraries.map((item) => item.label || item.key).join('、')
      : '当前知识库目录';
  const snapshotSummary = snapshots
    .slice(0, 2)
    .map((item) => `${item.label} 当前有 ${item.documents.length} 份文档，可直接使用 ${item.usableCount} 份${item.latestUpdateAt ? `，最近更新时间 ${formatCatalogTimestamp(item.latestUpdateAt)}` : ''}`)
    .join('；');
  const recentTitles = input.selection.candidates
    .slice(0, 3)
    .map((item) => trimCatalogText(item.title, 36))
    .filter(Boolean);
  const focusKeys = new Set(snapshots.map((item) => item.key).filter((key) => key !== '__all__'));
  const recentChanges = (input.state?.recentChanges || [])
    .filter((change) => !focusKeys.size || change.libraryKeys.some((key) => focusKeys.has(key)))
    .slice(0, 2)
    .map((change) => formatCatalogChange(change));
  const summaryParts = [
    `我先按当前知识库目录来回答。现在优先关注的是 ${libraryText}。`,
    snapshotSummary ? `${snapshotSummary}。` : '',
    recentTitles.length ? `目录里可直接关注的文档有：${recentTitles.join('、')}。` : '',
    recentChanges.length ? `最近的目录变化包括：${recentChanges.join('；')}。` : '',
    '如果你接下来要问某份文档的具体字段、金额、日期、公司或原文依据，我再去调取文档详情。',
  ].filter(Boolean);
  return summaryParts.join('');
}

function buildUnifiedKnowledgeAnswerFallback(input: {
  requestText: string;
  libraries: Array<{ key: string; label: string }>;
  state: OpenClawMemoryState | null;
  selection: OpenClawMemorySelection;
  retrieval: RetrievalResult | null;
  timeRange?: string;
  contentFocus?: string;
  preferLiveDetail: boolean;
}) {
  const catalogFallback = buildKnowledgeCatalogFallbackAnswer({
    requestText: input.requestText,
    libraries: input.libraries,
    state: input.state,
    selection: input.selection,
  });

  if (!input.preferLiveDetail || !input.retrieval?.documents.length) {
    return catalogFallback;
  }

  const detailFallback = buildKnowledgeDetailFallbackAnswer({
    requestText: input.requestText,
    libraries: input.libraries,
    retrieval: input.retrieval,
    timeRange: input.timeRange,
    contentFocus: input.contentFocus,
  });

  return [
    '我先基于当前知识库目录和已命中的文档详情整理这次回答。',
    catalogFallback,
    detailFallback,
  ]
    .filter(Boolean)
    .join('\n\n');
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
  const templateTaskHint = inferKnowledgeTemplateTaskHintFromLibraries(scopeState.libraries, requestedKind);
  const templateSearchHints = buildTemplateCatalogSearchHints(templateCatalogOptions);
  const isOrderInventoryPageRequest = requestedKind === 'page' && templateTaskHint === 'order-static-page';
  const memorySelection = await selectOpenClawMemoryDocumentCandidates({
    requestText,
    libraries: scopeState.libraries,
    limit: isOrderInventoryPageRequest
      ? ORDER_OUTPUT_MEMORY_LIMIT
      : (requestedKind === 'page' ? 10 : 8),
    botId: input.botDefinition?.id,
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
  const plannerSkillInstruction = requestedKind === 'page'
    ? await loadWorkspaceSkillBundle('report-page-planner', [
      'references/planning-contract.md',
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
  const skillInstruction = [supplySkillInstruction, plannerSkillInstruction]
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

  let output: ChatOutput | null = null;
  let executionStage = 'composer-model';
  try {
    const canComposeResumePage = requestedKind === 'page' && (resumeDisplayProfileResolution?.profiles || []).length > 0;
    const canComposeOrderInventoryPage = requestedKind === 'page'
      && templateTaskHint === 'order-static-page'
      && effectiveRetrieval.documents.some((item) => (
        item.bizCategory === 'order'
        || item.bizCategory === 'inventory'
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
          { allowResumeFallback: false },
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
          { allowResumeFallback: false },
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
        { allowResumeFallback: false },
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

  const finalOutput = output || buildKnowledgeFallbackOutput(
    requestedKind,
    requestText,
    effectiveRetrieval.documents,
    activeEnvelope,
    resumeDisplayProfileResolution?.profiles || [],
  );

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
  const memoryState = await loadOpenClawMemorySelectionState(input.botDefinition?.id);
  const memorySelection = selectOpenClawMemoryDocumentCandidatesFromState({
    state: memoryState,
    requestText,
    libraries: input.preferredLibraries,
    limit: preferLiveDetail ? 4 : 6,
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
    });
    libraries = supply.libraries;
    knowledgeChatHistory = supply.knowledgeChatHistory;
    effectiveRetrieval = supply.effectiveRetrieval.documents.length
      ? supply.effectiveRetrieval
      : null;
  }

  const fallbackContent = buildUnifiedKnowledgeAnswerFallback({
    requestText,
    libraries,
    state: memoryState,
    selection: memorySelection,
    retrieval: effectiveRetrieval,
    timeRange: input.timeRange,
    contentFocus: input.contentFocus,
    preferLiveDetail,
  });

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
        buildKnowledgeCatalogStateContextBlock({
          state: memoryState,
          libraries,
          selection: memorySelection,
        }),
        buildOpenClawMemorySelectionContextBlock(memorySelection),
        buildKnowledgeCatalogSelectionDetailBlock(memorySelection),
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
