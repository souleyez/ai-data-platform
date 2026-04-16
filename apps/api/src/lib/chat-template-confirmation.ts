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
type TemplateConfirmationAction = 'openclaw_action' | 'dataset_static_page';

export type TemplateConfirmationOption = {
  key: TemplateConfirmationAction;
  title: string;
  description: string;
  executeMode: 'general' | 'knowledge_output';
  executePrompt: string;
  confirmedAction?: TemplateConfirmationAction;
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

function normalizeDatasetScopePrompt(prompt: string) {
  return String(prompt || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[，。、“”‘’；;!?！？]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isExplicitDatasetScopedOutputRequest(prompt: string) {
  const normalized = normalizeDatasetScopePrompt(prompt);
  if (!normalized) return false;
  return /(?:数据集|dataset|knowledge base|知识库|资料库|文档库|库内|库中|按库|按数据集|基于[\p{L}\p{N}\u4e00-\u9fff()（）·_-]{2,24}库|使用[\p{L}\p{N}\u4e00-\u9fff()（）·_-]{2,24}库|围绕[\p{L}\p{N}\u4e00-\u9fff()（）·_-]{2,24}库|针对[\p{L}\p{N}\u4e00-\u9fff()（）·_-]{2,24}库|从[\p{L}\p{N}\u4e00-\u9fff()（）·_-]{2,24}库)/u.test(normalized);
}

function buildDatasetStaticPageRequestText(input: {
  libraries: KnowledgeLibraryRef[];
  timeRange: string;
  focus: string;
}) {
  const librariesText = formatLibrariesText(input.libraries);
  const timeText = input.timeRange || '未限定时间范围';
  const taskFocus = input.focus || '当前任务重点';
  return `请基于 ${librariesText} 数据集/库中 ${timeText} 内的资料，固定生成一页可继续编辑的数据可视化静态页，并围绕「${taskFocus}」组织内容。`;
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
  if (!isExplicitDatasetScopedOutputRequest(input.prompt)) return null;
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
  const datasetStaticPageRequest = buildDatasetStaticPageRequestText({
    libraries: input.supply.libraries,
    timeRange,
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
    title: '检测到这是按数据集/库输出的请求',
    description: '这类请求会先弹出两个确认选项：按模型理解输出，或按数据集/库固定进入静态页编辑。',
    originalPrompt: requestText,
    outputKind,
    libraries: input.supply.libraries,
    timeRange,
    templateLabel,
    options: [
      {
        key: 'openclaw_action',
        title: '按模型理解输出',
        description: openClawAction,
        executeMode: 'general',
        executePrompt: requestText,
        confirmedAction: 'openclaw_action',
        preferredLibraries: input.supply.libraries,
      },
      {
        key: 'dataset_static_page',
        title: '按数据集/库输出',
        description: `${datasetStaticPageRequest} 选择后会直接进入静态页编辑页面。`,
        executeMode: 'knowledge_output',
        executePrompt: datasetStaticPageRequest,
        confirmedAction: 'dataset_static_page',
        confirmedRequest: datasetStaticPageRequest,
        preferredLibraries: input.supply.libraries,
      },
    ],
  };
}
