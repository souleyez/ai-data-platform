import { retrieveKnowledgeMatches } from './document-retrieval.js';
import { documentMatchesLibrary, loadDocumentLibraries } from './document-libraries.js';
import { loadParsedDocuments } from './document-store.js';
import {
  buildKnowledgeContext,
  buildKnowledgeRetrievalQuery,
  buildLibraryFallbackRetrieval,
  filterDocumentsByContentFocus,
  filterDocumentsByTimeRange,
} from './knowledge-evidence.js';
import { buildKnowledgeMissMessage, buildReportInstruction, normalizeReportOutput, type ChatOutput } from './knowledge-output.js';
import { buildPromptForScoring, collectLibraryMatches, detectOutputKind } from './knowledge-plan.js';
import {
  buildKnowledgeTemplateInstruction,
  buildTemplateContextBlock,
  buildTemplateSearchHints,
  inferTemplateTaskHint,
  selectKnowledgeTemplates,
} from './knowledge-template.js';
import { runOpenClawChat } from './openclaw-adapter.js';

export type KnowledgeExecutionInput = {
  prompt: string;
  confirmedRequest?: string;
  preferredLibraries?: Array<{ key: string; label: string }>;
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

type ResolvedKnowledgeScope = {
  libraries: Array<{ key: string; label: string }>;
  scopedItems: Awaited<ReturnType<typeof loadParsedDocuments>>['items'];
};

function tokenizeKnowledgeText(text: string) {
  return String(text || '').toLowerCase().match(/[a-z0-9-]{2,}|[\u4e00-\u9fff]{2,}/g) ?? [];
}

function looksLikeOperationalFeedback(text: string) {
  const source = String(text || '').replace(/\s+/g, ' ').trim();
  if (!source) return true;

  const noisyTokens = [
    '上传',
    '采集',
    '入库',
    '分组',
    '保存',
    '删除',
    '凭据',
    '数据源',
    '运行记录',
    '云端模型暂时不可用',
    '云端回复暂不可用',
    '知识库分组更新失败',
    '已确认分组',
    '已保存',
    '已删除',
    '已取消',
  ];

  return noisyTokens.some((token) => source.includes(token)) && source.length <= 120;
}

function buildKnowledgeChatHistory(
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  requestText: string,
) {
  const cleaned = chatHistory
    .map((item) => ({
      role: item.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: String(item.content || '').trim(),
    }))
    .filter((item) => item.content)
    .filter((item) => !looksLikeOperationalFeedback(item.content));

  if (!cleaned.length) {
    return [];
  }

  const requestTerms = new Set(tokenizeKnowledgeText(requestText));
  const tailIndexes = new Set(
    cleaned
      .map((_, index) => index)
      .slice(-4),
  );
  const relevantIndexes = cleaned
    .map((item, index) => {
      const tokens = tokenizeKnowledgeText(item.content);
      const overlap = tokens.filter((token) => requestTerms.has(token)).length;
      return { index, overlap, role: item.role };
    })
    .filter((item) => item.overlap > 0)
    .sort((left, right) => {
      if (right.overlap !== left.overlap) return right.overlap - left.overlap;
      if (left.role !== right.role) return left.role === 'user' ? -1 : 1;
      return right.index - left.index;
    })
    .slice(0, 3)
    .map((item) => item.index);

  for (const index of relevantIndexes) {
    tailIndexes.add(index);
  }

  return Array.from(tailIndexes)
    .sort((left, right) => left - right)
    .slice(-6)
    .map((index) => cleaned[index]);
}

async function resolveKnowledgeScope(
  requestText: string,
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  preferredLibraries: Array<{ key: string; label: string }>,
  timeRange?: string,
  contentFocus?: string,
): Promise<ResolvedKnowledgeScope> {
  const [documentLibraries, documentState] = await Promise.all([
    loadDocumentLibraries(),
    loadParsedDocuments(240, false),
  ]);

  const preferredKeys = new Set(preferredLibraries.map((item) => item.key));
  const preferredLabels = new Set(preferredLibraries.map((item) => item.label));
  const explicitCandidates = preferredKeys.size || preferredLabels.size
    ? documentLibraries
        .filter((library) => preferredKeys.has(library.key) || preferredLabels.has(library.label))
        .map((library, index) => ({ library, score: 100 - index }))
    : [];
  const scoredCandidates = collectLibraryMatches(buildPromptForScoring(requestText, chatHistory), documentLibraries);
  const candidates = explicitCandidates.length ? explicitCandidates : scoredCandidates;
  const libraries = candidates.map((item) => ({ key: item.library.key, label: item.library.label }));

  const libraryScopedItems = candidates.length
    ? documentState.items.filter((item) =>
        candidates.some((candidate) => documentMatchesLibrary(item, candidate.library)),
      )
    : [];
  const timeScopedItems = filterDocumentsByTimeRange(libraryScopedItems, timeRange);
  const scopedItems = filterDocumentsByContentFocus(timeScopedItems, contentFocus);

  return { libraries, scopedItems };
}

export async function executeKnowledgeOutput(input: KnowledgeExecutionInput): Promise<KnowledgeExecutionResult> {
  const requestText = String(input.confirmedRequest || input.prompt).trim();
  const knowledgeChatHistory = buildKnowledgeChatHistory(input.chatHistory, requestText);
  const requestedKind = detectOutputKind(requestText) || 'table';
  const preferredLibraries = Array.isArray(input.preferredLibraries)
    ? input.preferredLibraries
        .map((item) => ({ key: String(item?.key || '').trim(), label: String(item?.label || '').trim() }))
        .filter((item) => item.key || item.label)
    : [];
  const { libraries, scopedItems } = await resolveKnowledgeScope(
    requestText,
    knowledgeChatHistory,
    preferredLibraries,
    input.timeRange,
    input.contentFocus,
  );
  const selectedTemplates = await selectKnowledgeTemplates(libraries, requestedKind);
  const templateTaskHint = inferTemplateTaskHint(selectedTemplates, requestedKind);
  const templateSearchHints = buildTemplateSearchHints(selectedTemplates);

  const retrieval = await retrieveKnowledgeMatches(
    scopedItems,
    buildKnowledgeRetrievalQuery(requestText, libraries, {
      timeRange: input.timeRange,
      contentFocus: input.contentFocus,
    }),
    { docLimit: 8, evidenceLimit: 10, templateTaskHint, templateSearchHints },
  );

  const effectiveRetrieval =
    retrieval.documents.length || retrieval.evidenceMatches.length
      ? retrieval
      : buildLibraryFallbackRetrieval(scopedItems);

  if (!effectiveRetrieval.documents.length) {
    const content = buildKnowledgeMissMessage(libraries);
    return {
      libraries,
      output: { type: 'answer', content },
      content,
      intent: 'report',
      mode: 'openclaw',
    };
  }

  const templateInstruction = await buildKnowledgeTemplateInstruction(libraries, requestedKind);
  const templateContext = buildTemplateContextBlock(selectedTemplates);
  const cloud = await runOpenClawChat({
    prompt: requestText,
    sessionUser: input.sessionUser,
    chatHistory: knowledgeChatHistory,
    contextBlocks: [
      templateContext,
      buildKnowledgeContext(requestText, libraries, effectiveRetrieval, {
        timeRange: input.timeRange,
        contentFocus: input.contentFocus,
      }),
    ].filter(Boolean),
    systemPrompt: [
      '你是 AI智能服务 中负责按知识库生成结果的助手。',
      '用户已经明确要求按知识库输出，请严格以提供的知识库证据为主。',
      '不要脱离知识库自由发挥。',
      '如果证据不足，只能有限补充，并在内容里保持克制。',
      templateInstruction,
      buildReportInstruction(requestedKind),
    ].filter(Boolean).join('\n'),
  });

  const output = normalizeReportOutput(
    requestedKind,
    requestText,
    cloud.content,
    selectedTemplates[0]?.envelope || null,
  );

  return {
    libraries,
    output,
    content: output.content,
    intent: 'report',
    mode: 'openclaw',
  };
}

export async function executeKnowledgeAnswer(input: KnowledgeAnswerInput): Promise<KnowledgeAnswerResult> {
  const requestText = String(input.prompt || '').trim();
  const knowledgeChatHistory = buildKnowledgeChatHistory(input.chatHistory, requestText);
  const preferredLibraries = Array.isArray(input.preferredLibraries)
    ? input.preferredLibraries
        .map((item) => ({ key: String(item?.key || '').trim(), label: String(item?.label || '').trim() }))
        .filter((item) => item.key || item.label)
    : [];

  const { libraries, scopedItems } = await resolveKnowledgeScope(
    requestText,
    knowledgeChatHistory,
    preferredLibraries,
    input.timeRange,
    input.contentFocus,
  );

  const retrieval = await retrieveKnowledgeMatches(
    scopedItems,
    buildKnowledgeRetrievalQuery(requestText, libraries, {
      timeRange: input.timeRange,
      contentFocus: input.contentFocus,
    }),
    { docLimit: 6, evidenceLimit: 8 },
  );

  const effectiveRetrieval =
    retrieval.documents.length || retrieval.evidenceMatches.length
      ? retrieval
      : buildLibraryFallbackRetrieval(scopedItems);

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
    systemPrompt: [
      '你是 AI智能服务 中负责基于知识库材料回答问题的助手。',
      '用户当前是在问库内材料相关问题，请优先依据提供的知识库文档摘要和证据回答。',
      '回答时先给结论，再补关键依据。',
      '不要脱离知识库自由发挥，不要跨库补充无关内容。',
      '如果证据不足，要明确说明是依据当前库内材料得到的有限结论。',
      '自然分段回答，不使用多余分隔符。',
    ].join('\n'),
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
