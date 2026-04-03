import { buildKnowledgeContext } from './knowledge-evidence.js';
import { detectOutputKind } from './knowledge-plan.js';
import {
  extractNormalizedContentFocus,
  extractNormalizedTimeRange,
} from './knowledge-request-state.js';
import {
  listKnowledgeTemplateCatalogOptions,
  resolveRequestedSharedTemplate,
  type KnowledgeOutputKind,
} from './knowledge-template.js';
import { runOpenClawChat } from './openclaw-adapter.js';
import type { KnowledgeLibraryRef, KnowledgeSupply } from './knowledge-supply.js';

type ChatHistoryItem = { role: 'user' | 'assistant'; content: string };

export type TemplateConfirmationOption = {
  key: 'openclaw_action' | 'template_output';
  title: string;
  description: string;
  executeMode: 'general' | 'knowledge_output';
  executePrompt: string;
  confirmedAction?: 'openclaw_action' | 'template_output';
  confirmedRequest?: string;
  preferredLibraries: KnowledgeLibraryRef[];
};

export type TemplateConfirmationPayload = {
  kind: 'template_output';
  title: string;
  description: string;
  originalPrompt: string;
  outputKind: KnowledgeOutputKind;
  libraries: KnowledgeLibraryRef[];
  timeRange: string;
  templateLabel: string;
  options: TemplateConfirmationOption[];
};

function mapOutputKindLabel(kind: KnowledgeOutputKind) {
  if (kind === 'ppt') return 'PPT';
  if (kind === 'pdf') return 'PDF';
  if (kind === 'doc') return '文档';
  if (kind === 'md') return 'Markdown';
  if (kind === 'table') return '表格';
  return '静态页';
}

function formatLibrariesText(libraries: KnowledgeLibraryRef[]) {
  const labels = libraries
    .map((item) => String(item.label || item.key || '').trim())
    .filter(Boolean);
  return labels.length ? labels.join('、') : '当前命中的知识库';
}

function summarizeFocus(prompt: string) {
  const explicitFocus = extractNormalizedContentFocus(prompt);
  if (explicitFocus) return explicitFocus;
  return String(prompt || '').trim().replace(/\s+/g, ' ');
}

function buildTemplateOutputRequestText(input: {
  outputKind: KnowledgeOutputKind;
  libraries: KnowledgeLibraryRef[];
  timeRange: string;
  templateLabel: string;
  focus: string;
}) {
  const librariesText = formatLibrariesText(input.libraries);
  const outputLabel = mapOutputKindLabel(input.outputKind);
  const timeText = input.timeRange || '未限定时间范围';
  const templateText = input.templateLabel || `默认${outputLabel}模板`;
  return `请按 ${librariesText} 库中 ${timeText} 内的资料，使用 ${templateText} 输出 ${input.focus} 的${outputLabel}。`;
}

function buildOpenClawActionFallback(input: {
  outputKind: KnowledgeOutputKind;
  libraries: KnowledgeLibraryRef[];
  focus: string;
}) {
  const librariesText = formatLibrariesText(input.libraries);
  const outputLabel = mapOutputKindLabel(input.outputKind);
  return `围绕 ${librariesText} 的相关资料，直接完成 ${input.focus} 的${outputLabel}输出。`;
}

async function buildOpenClawActionSummary(input: {
  prompt: string;
  chatHistory: ChatHistoryItem[];
  sessionUser?: string;
  contextBlocks?: string[];
  fallback: string;
}) {
  try {
    const cloud = await runOpenClawChat({
      prompt: [
        'Summarize the action you would take for the request below.',
        'Return one short Chinese sentence only.',
        'Do not explain routing or ask follow-up questions.',
        `User request: ${input.prompt}`,
      ].join('\n'),
      sessionUser: input.sessionUser,
      chatHistory: input.chatHistory.slice(-4),
      contextBlocks: input.contextBlocks,
      systemPrompt: [
        'You are producing a one-line action summary.',
        'Return plain Chinese only.',
        'Describe the action, not the reasoning.',
      ].join('\n'),
    });
    const content = String(cloud.content || '').replace(/\s+/g, ' ').trim();
    return content || input.fallback;
  } catch {
    return input.fallback;
  }
}

export function shouldRequireTemplateConfirmation(input: {
  prompt: string;
  supply: KnowledgeSupply;
}) {
  const outputKind = detectOutputKind(input.prompt);
  if (!outputKind) return null;
  if (!input.supply.libraries.length) return null;
  if (!input.supply.effectiveRetrieval.documents.length) return null;
  return outputKind;
}

export async function buildTemplateConfirmationPayload(input: {
  prompt: string;
  chatHistory: ChatHistoryItem[];
  sessionUser?: string;
  supply: KnowledgeSupply;
  systemContextBlocks?: string[];
}): Promise<TemplateConfirmationPayload | null> {
  const outputKind = shouldRequireTemplateConfirmation({
    prompt: input.prompt,
    supply: input.supply,
  });
  if (!outputKind) return null;

  const requestText = String(input.prompt || '').trim();
  const requestedTemplate = await resolveRequestedSharedTemplate(requestText, outputKind);
  const catalogOptions = await listKnowledgeTemplateCatalogOptions(
    input.supply.libraries,
    outputKind,
    requestedTemplate?.templateKey || '',
  );
  const templateLabel = requestedTemplate?.templateKey
    ? (catalogOptions.find((item) => item.templateKey === requestedTemplate.templateKey)?.templateLabel
        || requestedTemplate.templateKey)
    : (catalogOptions[0]?.templateLabel || `默认${mapOutputKindLabel(outputKind)}模板`);
  const timeRange = extractNormalizedTimeRange(requestText) || '全部时间';
  const focus = summarizeFocus(requestText);
  const templateRequest = buildTemplateOutputRequestText({
    outputKind,
    libraries: input.supply.libraries,
    timeRange,
    templateLabel,
    focus,
  });
  const openClawFallback = buildOpenClawActionFallback({
    outputKind,
    libraries: input.supply.libraries,
    focus,
  });
  const openClawAction = await buildOpenClawActionSummary({
    prompt: requestText,
    chatHistory: input.chatHistory,
    sessionUser: input.sessionUser,
    fallback: openClawFallback,
    contextBlocks: [
      ...(input.systemContextBlocks || []),
      buildKnowledgeContext(
        requestText,
        input.supply.libraries,
        input.supply.effectiveRetrieval,
        {
          timeRange,
          contentFocus: focus,
        },
        {
          maxDocuments: 4,
          maxEvidence: 4,
          includeExcerpt: false,
          maxClaimsPerDocument: 1,
          maxEvidenceChunksPerDocument: 1,
          maxStructuredProfileEntries: 4,
          maxStructuredArrayValues: 3,
          maxStructuredObjectEntries: 3,
        },
      ),
    ].filter(Boolean),
  });

  return {
    kind: 'template_output',
    title: '检测到这是库内资料模板输出请求',
    description: '这类请求不会直接推进，而是先给你两个确认选项。即使两种动作正好一致，也会同时展示。',
    originalPrompt: requestText,
    outputKind,
    libraries: input.supply.libraries,
    timeRange,
    templateLabel,
    options: [
      {
        key: 'openclaw_action',
        title: '按 OpenClaw 理解执行',
        description: openClawAction,
        executeMode: 'general',
        executePrompt: requestText,
        confirmedAction: 'openclaw_action',
        preferredLibraries: input.supply.libraries,
      },
      {
        key: 'template_output',
        title: '按库资料 + 模板输出',
        description: templateRequest,
        executeMode: 'knowledge_output',
        executePrompt: requestText,
        confirmedAction: 'template_output',
        confirmedRequest: templateRequest,
        preferredLibraries: input.supply.libraries,
      },
    ],
  };
}
