import { buildKnowledgeContext } from './knowledge-evidence.js';
import {
  buildKnowledgeFallbackOutput,
  buildKnowledgeMissMessage,
  buildReportInstruction,
  normalizeReportOutput,
  type ChatOutput,
} from './knowledge-output.js';
import { detectOutputKind } from './knowledge-plan.js';
import { buildKnowledgeAnswerPrompt, buildKnowledgeOutputPrompt } from './knowledge-prompts.js';
import {
  adaptSelectedTemplatesForRequest,
  buildKnowledgeTemplateInstruction,
  buildTemplateContextBlock,
  buildTemplateSearchHints,
  inferTemplateTaskHint,
  resolveRequestedSharedTemplate,
  selectKnowledgeTemplates,
} from './knowledge-template.js';
import { runOpenClawChat } from './openclaw-adapter.js';
import {
  prepareKnowledgeRetrieval,
  prepareKnowledgeScope,
  prepareKnowledgeSupply,
} from './knowledge-supply.js';

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
      requestedTemplate?.templateKey || input.preferredTemplateKey,
    ),
    requestText,
  );
  const templateTaskHint = inferTemplateTaskHint(selectedTemplates, requestedKind);
  const templateSearchHints = buildTemplateSearchHints(selectedTemplates);
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
      reportTemplate: selectedTemplates[0]
        ? {
            key: selectedTemplates[0].template.key,
            label: selectedTemplates[0].template.label,
            type: selectedTemplates[0].template.type,
          }
        : null,
    };
  }

  const templateInstruction = await buildKnowledgeTemplateInstruction(
    resolvedLibraries,
    requestedKind,
    requestedTemplate?.templateKey || input.preferredTemplateKey,
  );
  const templateContext = buildTemplateContextBlock(selectedTemplates);

  let output: ChatOutput;
  try {
    const cloud = await runOpenClawChat({
      prompt: requestText,
      sessionUser: input.sessionUser,
      chatHistory: supply.knowledgeChatHistory,
      contextBlocks: [
        templateContext,
        buildKnowledgeContext(requestText, resolvedLibraries, supply.effectiveRetrieval, {
          timeRange: input.timeRange,
          contentFocus: input.contentFocus,
        }),
      ].filter(Boolean),
      systemPrompt: buildKnowledgeOutputPrompt(
        templateInstruction,
        buildReportInstruction(requestedKind),
      ),
    });

    output = normalizeReportOutput(
      requestedKind,
      requestText,
      cloud.content,
      selectedTemplates[0]?.envelope || null,
    );
  } catch {
    output = buildKnowledgeFallbackOutput(
      requestedKind,
      requestText,
      supply.effectiveRetrieval.documents,
      selectedTemplates[0]?.envelope || null,
    );
  }

  return {
    libraries: resolvedLibraries,
    output,
    content: output.content,
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
