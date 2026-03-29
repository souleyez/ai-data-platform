import { buildKnowledgeContext } from './knowledge-evidence.js';
import {
  buildKnowledgeFallbackOutput,
  buildKnowledgeMissMessage,
  buildReportInstruction,
  normalizeReportOutput,
  shouldUseResumePageFallbackOutput,
  type ChatOutput,
} from './knowledge-output.js';
import { detectOutputKind } from './knowledge-plan.js';
import {
  buildKnowledgeAnswerPrompt,
  buildKnowledgeConceptPagePrompt,
  buildKnowledgeOutputPrompt,
} from './knowledge-prompts.js';
import {
  adaptSelectedTemplatesForRequest,
  buildKnowledgeTemplateInstruction,
  buildTemplateContextBlock,
  buildTemplateSearchHints,
  inferTemplateTaskHint,
  resolveRequestedSharedTemplate,
  selectKnowledgeTemplates,
  shouldUseConceptPageMode,
} from './knowledge-template.js';
import { runOpenClawChat } from './openclaw-adapter.js';
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
import { runResumePageComposer } from './resume-page-composer.js';
import { loadWorkspaceSkillBundle } from './workspace-skills.js';

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
  composerModelContent: string;
  composerOutput: ChatOutput | null;
  composerNeedsFallback: boolean | null;
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
};

export type KnowledgeAnswerResult = {
  libraries: Array<{ key: string; label: string }>;
  output: ChatOutput;
  content: string;
  intent: 'general';
  mode: 'openclaw';
};

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
  });

  const selectedTemplates = adaptSelectedTemplatesForRequest(
    await selectKnowledgeTemplates(
      scopeState.libraries,
      requestedKind,
      requestedTemplateKey,
    ),
    requestText,
  );
  const templateTaskHint = inferTemplateTaskHint(selectedTemplates, requestedKind);
  const templateSearchHints = conceptPageMode ? [] : buildTemplateSearchHints(selectedTemplates);
  const supply = await prepareKnowledgeRetrieval({
    requestText,
    timeRange: input.timeRange,
    contentFocus: input.contentFocus,
    docLimit: 10,
    evidenceLimit: 12,
    templateTaskHint,
    templateSearchHints,
    ...scopeState,
  });

  const resolvedLibraries = supply.libraries;
  if (!supply.effectiveRetrieval.documents.length) {
    const content = buildKnowledgeMissMessage(resolvedLibraries);
    return {
      libraries: resolvedLibraries,
      output: { type: 'answer', content },
      content,
      intent: 'report',
      mode: 'openclaw',
      reportTemplate: !conceptPageMode && selectedTemplates[0]
        ? {
            key: selectedTemplates[0].template.key,
            label: selectedTemplates[0].template.label,
            type: selectedTemplates[0].template.type,
          }
        : null,
    };
  }

  const templateInstruction = conceptPageMode
    ? ''
    : await buildKnowledgeTemplateInstruction(
      resolvedLibraries,
      requestedKind,
      requestedTemplateKey,
    );
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
      retrieval: supply.effectiveRetrieval,
      libraries: resolvedLibraries,
    })
    : null;
  const reportPlanContext = reportPlan ? buildReportPlanContextBlock(reportPlan) : '';
  const skillInstruction = [supplySkillInstruction, plannerSkillInstruction]
    .filter(Boolean)
    .join('\n\n');
  const templateContext = conceptPageMode ? '' : buildTemplateContextBlock(selectedTemplates);
  const activeEnvelope = reportPlan?.envelope || (conceptPageMode ? null : (selectedTemplates[0]?.envelope || null));
  const resumeDisplayProfileResolution = requestedKind === 'page'
    ? await runResumeDisplayProfileResolver({
      requestText,
      documents: supply.effectiveRetrieval.documents,
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
      composerModelContent: '',
      composerOutput: null,
      composerNeedsFallback: null,
      errorStage: '',
      errorMessage: '',
      finalStage: 'initial-output',
    }
    : null;
  const conceptPageContext = conceptPageMode
    ? buildConceptPageSupplyBlock({
      requestText,
      libraries: resolvedLibraries,
      retrieval: supply.effectiveRetrieval,
      timeRange: input.timeRange,
      contentFocus: input.contentFocus,
      templateTaskHint,
    })
    : '';

  let output: ChatOutput;
  let executionStage = 'initial-model';
  try {
    const cloud = await runOpenClawChat({
      prompt: requestText,
      sessionUser: input.sessionUser,
      chatHistory: supply.knowledgeChatHistory,
      contextBlocks: [
        conceptPageContext,
        reportPlanContext,
        resumeDisplayProfileContext,
        templateContext,
        buildKnowledgeContext(requestText, resolvedLibraries, supply.effectiveRetrieval, {
          timeRange: input.timeRange,
          contentFocus: input.contentFocus,
        }),
      ].filter(Boolean),
      systemPrompt: conceptPageMode
        ? buildKnowledgeConceptPagePrompt(
          skillInstruction,
          buildReportInstruction(requestedKind),
        )
        : buildKnowledgeOutputPrompt(
          skillInstruction,
          templateInstruction,
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
      supply.effectiveRetrieval.documents,
      resumeDisplayProfileResolution?.profiles || [],
      { allowResumeFallback: false },
    );

    const needsResumeRetry = requestedKind === 'page'
      && shouldUseResumePageFallbackOutput(requestText, initialOutput, supply.effectiveRetrieval.documents);
    if (resumePageDebugTrace) {
      resumePageDebugTrace.initialOutput = initialOutput;
      resumePageDebugTrace.initialNeedsFallback = needsResumeRetry;
    }
    const canComposeResumePage = requestedKind === 'page' && (resumeDisplayProfileResolution?.profiles || []).length > 0;

    if (canComposeResumePage) {
      executionStage = 'composer-model';
      const composedContent = await runResumePageComposer({
        requestText,
        reportPlan,
        envelope: activeEnvelope,
        documents: supply.effectiveRetrieval.documents,
        displayProfiles: resumeDisplayProfileResolution?.profiles || [],
        sessionUser: input.sessionUser,
      });

      if (resumePageDebugTrace) {
        resumePageDebugTrace.composerModelContent = composedContent || '';
      }

      if (composedContent) {
        executionStage = 'composer-normalize';
        const composedOutput = normalizeReportOutput(
          requestedKind,
          requestText,
          composedContent,
          activeEnvelope,
          supply.effectiveRetrieval.documents,
          resumeDisplayProfileResolution?.profiles || [],
          { allowResumeFallback: false },
        );
        const composerNeedsFallback = shouldUseResumePageFallbackOutput(
          requestText,
          composedOutput,
          supply.effectiveRetrieval.documents,
        );
        if (resumePageDebugTrace) {
          resumePageDebugTrace.composerOutput = composedOutput;
          resumePageDebugTrace.composerNeedsFallback = composerNeedsFallback;
        }

        if (!composerNeedsFallback) {
          output = composedOutput;
          if (resumePageDebugTrace) resumePageDebugTrace.finalStage = 'composer-output';
        } else {
          output = needsResumeRetry
            ? buildKnowledgeFallbackOutput(
              requestedKind,
              requestText,
              supply.effectiveRetrieval.documents,
              activeEnvelope,
              resumeDisplayProfileResolution?.profiles || [],
            )
            : initialOutput;
          if (resumePageDebugTrace) {
            resumePageDebugTrace.finalStage = needsResumeRetry ? 'fallback-output' : 'initial-output';
          }
        }
      } else {
        output = needsResumeRetry
          ? buildKnowledgeFallbackOutput(
            requestedKind,
            requestText,
            supply.effectiveRetrieval.documents,
            activeEnvelope,
            resumeDisplayProfileResolution?.profiles || [],
          )
          : initialOutput;
        if (resumePageDebugTrace) {
          resumePageDebugTrace.finalStage = needsResumeRetry ? 'fallback-output' : 'initial-output';
        }
      }
    } else {
      output = needsResumeRetry
        ? buildKnowledgeFallbackOutput(
          requestedKind,
          requestText,
          supply.effectiveRetrieval.documents,
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
      supply.effectiveRetrieval.documents,
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

  return {
    libraries: resolvedLibraries,
    output,
    content: output.content,
    intent: 'report',
    mode: 'openclaw',
    reportTemplate: !conceptPageMode && selectedTemplates[0]
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
  const { libraries, knowledgeChatHistory, effectiveRetrieval } = await prepareKnowledgeSupply({
    requestText,
    chatHistory: input.chatHistory,
    preferredLibraries: input.preferredLibraries,
    timeRange: input.timeRange,
    contentFocus: input.contentFocus,
    docLimit: 8,
    evidenceLimit: 10,
  });

  if (!effectiveRetrieval.documents.length) {
    const content = buildKnowledgeMissMessage(libraries);
    return {
      libraries,
      output: { type: 'answer', content },
      content,
      intent: 'general',
      mode: 'openclaw',
    };
  }

  const cloud = await runOpenClawChat({
    prompt: requestText,
    sessionUser: input.sessionUser,
    chatHistory: knowledgeChatHistory,
    contextBlocks: [
      buildKnowledgeContext(requestText, libraries, effectiveRetrieval, {
        timeRange: input.timeRange,
        contentFocus: input.contentFocus,
      }),
    ],
    systemPrompt: buildKnowledgeAnswerPrompt(),
  });

  const content = cloud.content;
  return {
    libraries,
    output: { type: 'answer', content },
    content,
    intent: 'general',
    mode: 'openclaw',
  };
}
