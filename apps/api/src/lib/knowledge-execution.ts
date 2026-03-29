import { buildKnowledgeContext } from './knowledge-evidence.js';
import {
  buildKnowledgeFallbackOutput,
  buildKnowledgeMissMessage,
  buildReportInstruction,
  normalizeReportOutput,
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
import { loadWorkspaceSkillBundle } from './workspace-skills.js';

export type KnowledgeExecutionInput = {
  prompt: string;
  confirmedRequest?: string;
  preferredLibraries?: Array<{ key: string; label: string }>;
  preferredTemplateKey?: string;
  timeRange?: string;
  contentFocus?: string;
  sessionUser?: string;
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
};

export type KnowledgeExecutionResult = {
  libraries: Array<{ key: string; label: string }>;
  output: ChatOutput;
  content: string;
  intent: 'report';
  mode: 'openclaw';
  reportTemplate?: { key: string; label: string; type: string } | null;
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
  try {
    const cloud = await runOpenClawChat({
      prompt: requestText,
      sessionUser: input.sessionUser,
      chatHistory: supply.knowledgeChatHistory,
      contextBlocks: [
        conceptPageContext,
        reportPlanContext,
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

    output = normalizeReportOutput(
      requestedKind,
      requestText,
      cloud.content,
      activeEnvelope,
      supply.effectiveRetrieval.documents,
    );
  } catch {
    output = buildKnowledgeFallbackOutput(
      requestedKind,
      requestText,
      supply.effectiveRetrieval.documents,
      activeEnvelope,
    );
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
