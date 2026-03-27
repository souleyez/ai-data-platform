import { loadDocumentLibraries } from './document-libraries.js';
import type { ParsedDocument } from './document-parser.js';
import { loadParsedDocuments, matchDocumentEvidenceByPrompt, matchDocumentsByPrompt } from './document-store.js';
import { executeKnowledgeAnswer, executeKnowledgeOutput } from './knowledge-execution.js';
import {
  buildKnowledgePlanMessage,
  buildKnowledgePlanPrompt,
  buildLocalKnowledgePlan,
  buildNoPlanMessage,
  buildPromptForScoring,
  collectLibraryMatches,
  detectOutputKind,
  extractPlanningResult,
  shouldFallbackToLocalPlan,
  type KnowledgePlan,
} from './knowledge-plan.js';
import { isOpenClawGatewayConfigured, isOpenClawGatewayReachable, runOpenClawChat } from './openclaw-adapter.js';
import type { ChatOutput } from './knowledge-output.js';

type ChatHistoryItem = { role: 'user' | 'assistant'; content: string };

type KnowledgeConversationState = {
  kind: 'knowledge_output';
  libraries: Array<{ key: string; label: string }>;
  timeRange: string;
  contentFocus: string;
  outputType: '' | 'table' | 'page' | 'pdf' | 'ppt';
  missingSlot: 'time' | 'content' | 'output';
};

export type ChatRequestInput = {
  prompt: string;
  sessionUser?: string;
  chatHistory?: ChatHistoryItem[];
  mode?: 'general' | 'knowledge_plan' | 'knowledge_output';
  confirmedRequest?: string;
  preferredLibraries?: Array<{ key: string; label: string }>;
  conversationState?: unknown;
};

const DOCUMENT_DETAIL_PATTERNS = [
  /刚上传/,
  /最近上传/,
  /上传的文档/,
  /上传的文件/,
  /这份文档/,
  /这个文档/,
  /这个文件/,
  /这份材料/,
  /该文档/,
  /该文件/,
  /文档里/,
  /材料里/,
  /文件里/,
  /详细看/,
  /仔细看/,
  /详细阅读/,
  /认真读/,
  /看看.*文档/,
  /查看.*文档/,
  /根据.*文档/,
  /按.*文档/,
];

const DETAIL_QUESTION_PATTERNS = /(细节|详细|具体|条款|参数|内容|依据|原文|证据|章节|接口|字段|学历|公司|日期|金额|结论)/;
const OUTPUT_REQUEST_PATTERNS = /(输出|生成|整理|汇总|做成|做一份|做个|导出|形成|产出|对比表|报表|表格|静态页|数据可视化|ppt|pdf|文档)/i;
const KNOWLEDGE_SCOPE_PATTERNS = /(知识库|库内|文档库|材料库|最近上传|刚上传|这份文档|这个文件|这些材料|这批材料|这批文档|资料库)/;
const CANCEL_PATTERNS = /^(不用了|算了|取消|先不做了|先不用|不用输出了)$/;
const DENY_KNOWLEDGE_PATTERNS = /(不要按库|不用查知识库|不用按文档|直接回答|普通回答就行|不要按知识库|不用查库|不用按库|不用按材料|别查知识库|别按文档)/;

function normalizeHistory(chatHistory?: ChatHistoryItem[]) {
  return Array.isArray(chatHistory)
    ? chatHistory
        .map((item) => ({
          role: item?.role === 'assistant' ? ('assistant' as const) : ('user' as const),
          content: String(item?.content || '').trim(),
        }))
        .filter((item) => item.content)
        .slice(-8)
    : [];
}

function summarizeError(error: unknown) {
  const message = String(error instanceof Error ? error.message : error ?? '').trim();
  return message ? message.replace(/\s+/g, ' ').slice(0, 240) : 'unknown-error';
}

function buildCloudUnavailableAnswer() {
  return '当前云端模型暂时不可用，请稍后再试。';
}

function isUploadedDocument(item: ParsedDocument) {
  const target = `${item.path || ''} ${item.name || ''}`.toLowerCase();
  return target.includes('\\uploads\\') || target.includes('/uploads/');
}

function extractDocumentFollowupKeywords(prompt: string) {
  const normalized = String(prompt || '').trim().toLowerCase();
  return normalized.match(/[a-z0-9][a-z0-9-]{1,}|[\u4e00-\u9fff]{2,}/g) ?? [];
}

function looksLikeDocumentDetailFollowup(prompt: string, chatHistory: ChatHistoryItem[]) {
  const text = String(prompt || '').trim();
  if (!text) return false;
  if (DOCUMENT_DETAIL_PATTERNS.some((pattern) => pattern.test(text))) return true;

  const keywords = extractDocumentFollowupKeywords(text);
  const historyJoined = chatHistory.map((item) => item.content).join('\n');
  const hasRecentIngestContext = /(上传完成|涉及材料|入库|摘要|文档类型|知识库|解析)/.test(historyJoined);
  return DETAIL_QUESTION_PATTERNS.test(text) && hasRecentIngestContext && keywords.length > 0;
}

function stringifyStructuredProfile(item: ParsedDocument) {
  const profile = item.structuredProfile;
  if (!profile || typeof profile !== 'object') return '';

  return Object.entries(profile)
    .flatMap(([key, value]) => {
      if (Array.isArray(value)) {
        const compact = value.map((entry) => String(entry || '').trim()).filter(Boolean).slice(0, 6);
        return compact.length ? [`${key}: ${compact.join('、')}`] : [];
      }
      const text = String(value || '').trim();
      return text ? [`${key}: ${text}`] : [];
    })
    .slice(0, 10)
    .join('\n');
}

function buildDocumentDetailContext(prompt: string, documents: ParsedDocument[]) {
  const docBlocks = documents.slice(0, 3).map((item, index) => {
    const evidence = (item.evidenceChunks || [])
      .slice(0, 3)
      .map((chunk) => String(chunk?.text || '').trim())
      .filter(Boolean);
    const claims = (item.claims || [])
      .slice(0, 3)
      .map((claim) => [claim.subject, claim.predicate, claim.object].filter(Boolean).join(' '))
      .filter(Boolean);
    const profileText = stringifyStructuredProfile(item);

    return [
      `文档 ${index + 1}: ${item.title || item.name}`,
      `类型: ${item.schemaType || item.category || 'generic'}`,
      `摘要: ${item.summary || item.excerpt || '无摘要'}`,
      profileText ? `结构化信息:\n${profileText}` : '',
      evidence.length ? `关键证据:\n${evidence.map((text, i) => `${i + 1}. ${text}`).join('\n')}` : '',
      claims.length ? `关键结论:\n${claims.map((text, i) => `${i + 1}. ${text}`).join('\n')}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
  });

  if (!docBlocks.length) return [];

  return [
    `用户正在追问最近上传文档的细节。请优先依据下列详细解析结果回答，当前问题：${prompt}`,
    ...docBlocks,
  ];
}

async function buildDocumentFollowupContext(prompt: string, chatHistory: ChatHistoryItem[]) {
  if (!looksLikeDocumentDetailFollowup(prompt, chatHistory)) {
    return { documents: [] as ParsedDocument[], contextBlocks: [] as string[] };
  }

  const { items } = await loadParsedDocuments(400, false);
  const uploadedDocuments = items.filter((item) => item.parseStatus === 'parsed' && isUploadedDocument(item));
  if (!uploadedDocuments.length) {
    return { documents: [], contextBlocks: [] };
  }

  const matchedDocuments = matchDocumentsByPrompt(uploadedDocuments, prompt, 3);
  const recentDocuments = matchedDocuments.length ? matchedDocuments : uploadedDocuments.slice(0, 6);
  const evidenceMatches = matchDocumentEvidenceByPrompt(recentDocuments, prompt, 3);
  const preferredDocuments = evidenceMatches.length ? evidenceMatches.map((entry) => entry.item) : recentDocuments;

  const dedupedDocuments: ParsedDocument[] = [];
  const seen = new Set<string>();
  for (const item of preferredDocuments) {
    if (seen.has(item.path)) continue;
    seen.add(item.path);
    dedupedDocuments.push(item);
    if (dedupedDocuments.length >= 3) break;
  }

  return {
    documents: dedupedDocuments,
    contextBlocks: buildDocumentDetailContext(prompt, dedupedDocuments),
  };
}

function parseConversationState(value: unknown): KnowledgeConversationState | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (raw.kind !== 'knowledge_output') return null;

  const outputType = String(raw.outputType || '').trim();
  const missingSlot = String(raw.missingSlot || '').trim();
  if (!['', 'table', 'page', 'pdf', 'ppt'].includes(outputType)) return null;
  if (!['time', 'content', 'output'].includes(missingSlot)) return null;

  return {
    kind: 'knowledge_output',
    libraries: Array.isArray(raw.libraries)
      ? raw.libraries
          .map((item) => {
            const entry = item as { key?: unknown; label?: unknown };
            return {
              key: String(entry?.key || '').trim(),
              label: String(entry?.label || '').trim(),
            };
          })
          .filter((item) => item.key || item.label)
      : [],
    timeRange: String(raw.timeRange || '').trim(),
    contentFocus: String(raw.contentFocus || '').trim(),
    outputType: outputType as KnowledgeConversationState['outputType'],
    missingSlot: missingSlot as KnowledgeConversationState['missingSlot'],
  };
}

function mapOutputTypeLabel(outputType: KnowledgeConversationState['outputType']) {
  if (outputType === 'page') return '数据可视化静态页';
  if (outputType === 'ppt') return 'PPT';
  if (outputType === 'pdf') return '文档';
  return '表格';
}

function extractOutputType(text: string): KnowledgeConversationState['outputType'] {
  const detected = detectOutputKind(text || '');
  if (detected) return detected;
  return /(文档|正文文档|正式文档|word|docx?)/i.test(String(text || '').trim()) ? 'pdf' : '';
}

function extractTimeRange(text: string) {
  const source = String(text || '').trim();
  const patterns = [
    /最近上传/,
    /刚上传/,
    /今天/,
    /昨日|昨天/,
    /本周/,
    /上周/,
    /本月/,
    /上个月/,
    /最近一周|近一周/,
    /最近一个月|近一个月/,
    /最近三个月|近三个月/,
    /最近半年|近半年/,
    /最近一年|近一年/,
    /本季度/,
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[0]) return match[0];
  }
  return '';
}

function extractContentFocus(text: string) {
  return String(text || '')
    .replace(/请|帮我|麻烦|想要|需要|希望|基于|根据|按照|按|围绕|聚焦|优先|针对/g, ' ')
    .replace(/知识库|文档库|材料库|库内|最近上传|刚上传|这份文档|这个文件|这些材料|这批材料|这批文档/g, ' ')
    .replace(/输出|生成|整理|汇总|做成|做一份|做个|导出|形成|产出/g, ' ')
    .replace(/报表|表格|对比表|静态页|数据可视化静态页|PPT|PDF|文档/g, ' ')
    .replace(/今天|昨天|本周|上周|本月|上个月|最近上传|最近一周|最近一个月|最近三个月|近一周|近一个月|近三个月|最近半年|近半年|最近一年|近一年|本季度/g, ' ')
    .replace(/[，。；：、,.!?！？]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isLikelySlotOnlyReply(text: string) {
  const source = String(text || '').trim();
  if (!source) return false;
  if (Boolean(extractTimeRange(source))) return true;
  if (Boolean(extractOutputType(source))) return true;
  return source.length <= 24 && !DETAIL_QUESTION_PATTERNS.test(source);
}

function mergeContentFocus(previousFocus: string, prompt: string) {
  const currentFocus = extractContentFocus(prompt);
  if (previousFocus && currentFocus) {
    if (previousFocus.includes(currentFocus)) return previousFocus;
    if (currentFocus.includes(previousFocus)) return currentFocus;
    return `${previousFocus} ${currentFocus}`.trim();
  }
  return currentFocus || previousFocus || '';
}

async function inferLibraries(
  prompt: string,
  chatHistory: ChatHistoryItem[],
  documentLibraries: Awaited<ReturnType<typeof loadDocumentLibraries>>,
) {
  const scored = collectLibraryMatches(buildPromptForScoring(prompt, chatHistory), documentLibraries).map((item) => ({
    key: item.library.key,
    label: item.library.label,
  }));
  if (scored.length) return scored;

  if (!/最近上传|刚上传|这份文档|这个文件|这些材料|这批文档|这批材料/.test(prompt)) {
    return [];
  }

  const { items } = await loadParsedDocuments(120, false);
  const uploaded = items.filter((item) => item.parseStatus === 'parsed' && isUploadedDocument(item)).slice(0, 8);
  const keyed = new Map<string, { key: string; label: string }>();
  for (const item of uploaded) {
    const groups = [...(item.confirmedGroups || []), ...(item.groups || [])].filter(Boolean);
    for (const group of groups) {
      const library = documentLibraries.find(
        (entry) => entry.key === group || entry.label === group,
      );
      if (library && !keyed.has(library.key)) {
        keyed.set(library.key, { key: library.key, label: library.label });
      }
    }
  }
  return Array.from(keyed.values()).slice(0, 4);
}

function looksLikeKnowledgeOutputIntent(
  prompt: string,
  chatHistory: ChatHistoryItem[],
  libraries: Array<{ key: string; label: string }>,
) {
  const text = String(prompt || '').trim();
  if (!text) return false;
  if (!OUTPUT_REQUEST_PATTERNS.test(text)) return false;
  return KNOWLEDGE_SCOPE_PATTERNS.test(text) || libraries.length > 0 || looksLikeDocumentDetailFollowup(text, chatHistory);
}

function looksLikeKnowledgeAnswerIntent(
  prompt: string,
  chatHistory: ChatHistoryItem[],
  libraries: Array<{ key: string; label: string }>,
) {
  const text = String(prompt || '').trim();
  if (!text) return false;
  if (looksLikeKnowledgeOutputIntent(text, chatHistory, libraries)) return false;
  if (looksLikeDocumentDetailFollowup(text, chatHistory)) return false;
  const asksForDetail = DETAIL_QUESTION_PATTERNS.test(text);
  return asksForDetail && (KNOWLEDGE_SCOPE_PATTERNS.test(text) || libraries.length > 0);
}

function explicitlyRejectsKnowledgeMode(prompt: string) {
  return DENY_KNOWLEDGE_PATTERNS.test(String(prompt || '').trim());
}

function getMissingSlot(state: Omit<KnowledgeConversationState, 'kind' | 'missingSlot'>) {
  if (!state.timeRange) return 'time' as const;
  if (!state.contentFocus) return 'content' as const;
  if (!state.outputType) return 'output' as const;
  return null;
}

function buildMissingSlotMessage(state: KnowledgeConversationState) {
  if (state.missingSlot === 'time') {
    return '要按库内内容输出，还缺时间范围。请补充例如最近上传、本周、最近一个月这类时间范围。';
  }
  if (state.missingSlot === 'content') {
    return '要按库内内容输出，还缺内容范围。请说明要基于哪个知识库或哪批文档，以及重点看什么内容。';
  }
  return '要按库内内容输出，还缺输出形式。请说明要表格、数据可视化静态页、PPT 还是文档。';
}

function buildKnowledgeRequest(state: KnowledgeConversationState) {
  const libraryLabel = state.libraries.length
    ? state.libraries.map((item) => item.label || item.key).join('、')
    : '相关知识库';
  const timeText = state.timeRange || '最近上传';
  const focusText = state.contentFocus || '相关内容';
  return `请基于 ${libraryLabel} 中 ${timeText} 范围内的材料，围绕 ${focusText}，输出一份 ${mapOutputTypeLabel(state.outputType)}。`;
}

function mergeConversationState(
  prompt: string,
  previous: KnowledgeConversationState | null,
  libraries: Array<{ key: string; label: string }>,
) {
  const base = previous || {
    kind: 'knowledge_output' as const,
    libraries,
    timeRange: '',
    contentFocus: '',
    outputType: '' as KnowledgeConversationState['outputType'],
  };

  const slotOnlyReply = isLikelySlotOnlyReply(prompt);
  const next = {
    ...base,
    libraries: libraries.length ? libraries : base.libraries,
    timeRange: base.timeRange || extractTimeRange(prompt),
    contentFocus: slotOnlyReply ? base.contentFocus : mergeContentFocus(base.contentFocus, prompt),
    outputType: base.outputType || extractOutputType(prompt),
  };

  const missingSlot = getMissingSlot(next);
  return {
    state: {
      kind: 'knowledge_output' as const,
      libraries: next.libraries,
      timeRange: next.timeRange,
      contentFocus: next.contentFocus,
      outputType: next.outputType,
      missingSlot: missingSlot || 'output',
    },
    complete: !missingSlot,
  };
}

async function executeKnowledgePlan(
  prompt: string,
  chatHistory: ChatHistoryItem[],
  sessionUser?: string,
) {
  const documentLibraries = await loadDocumentLibraries();
  const localPlan = buildLocalKnowledgePlan(prompt, chatHistory);
  let planning = localPlan;

  try {
    const cloud = await runOpenClawChat({
      prompt: buildKnowledgePlanPrompt(prompt, chatHistory),
      sessionUser,
      chatHistory: [],
    });
    const cloudPlan = extractPlanningResult(cloud.content, localPlan.request);
    if (!shouldFallbackToLocalPlan(cloudPlan.request)) {
      planning = {
        request: cloudPlan.request || localPlan.request,
        outputType: (cloudPlan.outputType || localPlan.outputType) as 'table' | 'page' | 'pdf' | 'ppt',
      };
    }
  } catch {
    planning = localPlan;
  }

  const matchedLibraries = collectLibraryMatches(
    buildPromptForScoring(planning.request, chatHistory),
    documentLibraries,
  ).map((item) => ({ key: item.library.key, label: item.library.label }));

  const knowledgePlan: KnowledgePlan = {
    request: planning.request,
    libraries: matchedLibraries,
    outputType: planning.outputType,
  };

  const content = planning.request ? buildKnowledgePlanMessage() : buildNoPlanMessage();
  const output: ChatOutput = { type: 'answer', content };

  return {
    libraries: matchedLibraries,
    knowledgePlan,
    content,
    output,
    intent: 'report' as const,
    mode: 'openclaw' as const,
  };
}

export async function runChatOrchestrationV2(input: ChatRequestInput) {
  const prompt = String(input.prompt || '').trim();
  const chatHistory = normalizeHistory(input.chatHistory);
  const gatewayReachable = await isOpenClawGatewayReachable();
  const gatewayConfigured = gatewayReachable || isOpenClawGatewayConfigured();
  const traceId = `trace_${Date.now()}`;
  const requestMode = input.mode || 'general';
  const existingState = parseConversationState(input.conversationState);

  let mode: 'openclaw' | 'fallback' = 'fallback';
  let content = buildCloudUnavailableAnswer();
  let output: ChatOutput = { type: 'answer', content };
  let intent: 'general' | 'report' = requestMode === 'general' ? 'general' : 'report';
  let libraries: Array<{ key: string; label: string }> = [];
  let fallbackReason = gatewayConfigured ? '' : 'cloud-gateway-not-configured';
  let knowledgePlan: KnowledgePlan | null = null;
  let conversationState: KnowledgeConversationState | null = null;

  if (gatewayConfigured) {
    try {
      if (requestMode === 'knowledge_plan') {
        const result = await executeKnowledgePlan(prompt, chatHistory, input.sessionUser);
        libraries = result.libraries;
        knowledgePlan = result.knowledgePlan;
        content = result.content;
        output = result.output;
        intent = result.intent;
        mode = result.mode;
      } else if (requestMode === 'knowledge_output') {
        const result = await executeKnowledgeOutput({
          prompt,
          confirmedRequest: input.confirmedRequest,
          preferredLibraries: input.preferredLibraries,
          timeRange: existingState?.timeRange,
          contentFocus: existingState?.contentFocus,
          sessionUser: input.sessionUser,
          chatHistory,
        });
        libraries = result.libraries;
        output = result.output;
        content = result.content;
        intent = result.intent;
        mode = result.mode;
      } else {
        if (existingState && CANCEL_PATTERNS.test(prompt)) {
          mode = 'openclaw';
          intent = 'general';
          content = '已取消这次按库输出准备。你可以继续直接提问。';
          output = { type: 'answer', content };
          conversationState = null;
        } else if (explicitlyRejectsKnowledgeMode(prompt)) {
          const cloud = await runOpenClawChat({
            prompt,
            sessionUser: input.sessionUser,
            chatHistory,
          });
          content = cloud.content;
          output = { type: 'answer', content };
          intent = 'general';
          mode = 'openclaw';
          libraries = [];
          conversationState = null;
        } else {
          const documentLibraries = await loadDocumentLibraries();
          const inferredLibraries = await inferLibraries(prompt, chatHistory, documentLibraries);
          const wantsKnowledgeOutput = existingState
            ? true
            : looksLikeKnowledgeOutputIntent(prompt, chatHistory, inferredLibraries);
          const wantsKnowledgeAnswer = !wantsKnowledgeOutput
            && looksLikeKnowledgeAnswerIntent(prompt, chatHistory, inferredLibraries);

          if (wantsKnowledgeOutput) {
            const merged = mergeConversationState(prompt, existingState, inferredLibraries);
            libraries = merged.state.libraries;
            intent = 'report';

            if (!merged.complete) {
              conversationState = merged.state;
              content = buildMissingSlotMessage(merged.state);
              output = { type: 'answer', content };
              mode = 'openclaw';
            } else {
              const result = await executeKnowledgeOutput({
                prompt,
                confirmedRequest: buildKnowledgeRequest(merged.state),
                preferredLibraries: merged.state.libraries,
                timeRange: merged.state.timeRange,
                contentFocus: merged.state.contentFocus,
                sessionUser: input.sessionUser,
                chatHistory,
              });
              libraries = result.libraries;
              output = result.output;
              content = result.content;
              intent = result.intent;
              mode = result.mode;
              conversationState = null;
            }
          } else if (wantsKnowledgeAnswer) {
            const result = await executeKnowledgeAnswer({
              prompt,
              preferredLibraries: inferredLibraries,
              timeRange: extractTimeRange(prompt),
              contentFocus: extractContentFocus(prompt),
              sessionUser: input.sessionUser,
              chatHistory,
            });
            libraries = result.libraries;
            output = result.output;
            content = result.content;
            intent = result.intent;
            mode = result.mode;
            conversationState = null;
          } else {
            const documentFollowup = await buildDocumentFollowupContext(prompt, chatHistory);
            const cloud = await runOpenClawChat({
              prompt,
              sessionUser: input.sessionUser,
              chatHistory,
              contextBlocks: documentFollowup.contextBlocks,
            });

            content = cloud.content;
            output = { type: 'answer', content };
            intent = 'general';
            mode = 'openclaw';
            libraries = documentFollowup.documents.map((item) => ({
              key: item.groups?.[0] || item.confirmedGroups?.[0] || item.bizCategory || item.schemaType || 'document',
              label: item.title || item.name,
            }));
          }
        }
      }
    } catch (error) {
      fallbackReason = summarizeError(error);
      console.warn(`[chat:fallback] trace=${traceId} reason=${fallbackReason}`);
      content = buildCloudUnavailableAnswer();
      output = { type: 'answer', content };
      mode = 'fallback';
      conversationState = null;
    }
  }

  return {
    mode,
    intent,
    needsKnowledge: intent === 'report' || Boolean(conversationState),
    libraries,
    output,
    knowledgePlan,
    guard: {
      requiresConfirmation: false,
      reason: '',
    },
    traceId,
    message: {
      role: 'assistant' as const,
      content,
      output,
      meta: mode === 'openclaw' ? '云端智能回复' : '云端回复暂不可用',
      references: [],
    },
    sources: [],
    permissions: { mode: 'read-only' as const },
    orchestration: {
      mode,
      docMatches: libraries.length,
      gatewayConfigured,
      fallbackReason: mode === 'fallback' ? fallbackReason : '',
    },
    conversationState,
    latencyMs: 120,
  };
}
