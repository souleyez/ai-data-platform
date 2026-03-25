import { scenarios, type ScenarioKey } from './mock-data.js';
import { retrieveKnowledgeMatches } from './document-retrieval.js';
import { documentMatchesLibrary, loadDocumentLibraries, type DocumentLibrary } from './document-libraries.js';
import { loadParsedDocuments } from './document-store.js';
import { findReportGroupForPrompt, loadReportCenterState, type ReportGroup, type ReportTemplateType } from './report-center.js';
import { isOpenClawGatewayConfigured, isOpenClawGatewayReachable, runOpenClawChat } from './openclaw-adapter.js';
import type { ParsedDocument } from './document-parser.js';

export type ChatRequestInput = {
  prompt: string;
  sessionUser?: string;
  chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
};

type ChatOutput =
  | {
      type: 'answer';
      content: string;
    }
  | {
      type: 'table' | 'page' | 'pdf' | 'ppt';
      title: string;
      content: string;
      format?: string;
      table?: {
        title?: string;
        subtitle?: string;
        columns?: string[];
        rows?: Array<Array<string | number | null>>;
      } | null;
      page?: {
        summary?: string;
        cards?: Array<{ label?: string; value?: string; note?: string }>;
        sections?: Array<{ title?: string; body?: string; bullets?: string[] }>;
        charts?: Array<{ title?: string; items?: Array<{ label?: string; value?: number }> }>;
      } | null;
    };

type CandidateLibrary = {
  library: DocumentLibrary;
  group?: ReportGroup;
  score: number;
};

type RetrievalLikeResult = ReturnType<typeof retrieveKnowledgeMatches>;

function buildCloudUnavailableAnswer() {
  return '当前云端模型暂时不可用，请稍后再试。';
}

function buildDefaultPanel() {
  return scenarios.default;
}

function normalizeHistory(chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>) {
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
  if (!message) return 'unknown-error';
  return message.replace(/\s+/g, ' ').slice(0, 240);
}

function normalizeText(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '');
}

function containsAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => keyword && text.includes(keyword));
}

function mentionsKnowledgeBase(prompt: string) {
  const text = normalizeText(prompt);
  return /(知识库|资料库|文档库|库里的|库内|基于知识库|根据知识库|按知识库|按库)/.test(text);
}

function mentionsReportOutput(prompt: string) {
  const text = normalizeText(prompt);
  return /(报表|表格|静态页|可视化页|分析页|pdf|ppt|报告|汇总页)/.test(text);
}

function detectExplicitOutputKind(prompt: string): 'table' | 'page' | 'pdf' | 'ppt' | null {
  const text = normalizeText(prompt);
  if (/(静态页|可视化页|分析页|页面)/.test(text)) return 'page';
  if (/\bppt\b/.test(text)) return 'ppt';
  if (/\bpdf\b/.test(text)) return 'pdf';
  if (/(报表|表格|报告|汇总页)/.test(text)) return 'table';
  return null;
}

function looksLikeKnowledgeReportPrompt(prompt: string) {
  const text = normalizeText(prompt);
  if (!mentionsReportOutput(text)) return false;
  if (mentionsKnowledgeBase(text)) return true;
  return /(合同协议|奶粉配方|配方建议|简历|论文|技术文档|订单分析|库存监控|发票凭据|客服采集|工作日报)/.test(text);
}

function templateTypeToOutputKind(type?: ReportTemplateType): 'table' | 'page' | 'ppt' {
  if (type === 'static-page') return 'page';
  if (type === 'ppt') return 'ppt';
  return 'table';
}

function buildReportTemplateInstruction(kind: 'table' | 'page' | 'pdf' | 'ppt') {
  if (kind === 'page') {
    return [
      'You must answer with valid JSON only.',
      'Schema:',
      '{"title":"...", "content":"...", "page":{"summary":"...", "cards":[{"label":"...","value":"...","note":"..."}], "sections":[{"title":"...","body":"...","bullets":["..."]}], "charts":[{"title":"...","items":[{"label":"...","value":12}]}]}}',
      'Keep the page concise, readable, and presentation-ready.',
      'All text must be Chinese.',
    ].join('\n');
  }

  if (kind === 'pdf' || kind === 'ppt') {
    return [
      'You must answer with valid JSON only.',
      'Schema:',
      '{"title":"...", "content":"...", "page":{"summary":"...", "sections":[{"title":"...","body":"...","bullets":["..."]}]}}',
      'All text must be Chinese.',
    ].join('\n');
  }

  return [
    'You must answer with valid JSON only.',
    'Schema:',
    '{"title":"...", "content":"...", "table":{"title":"...", "subtitle":"...", "columns":["..."], "rows":[["...","..."]]}}',
    'All text must be Chinese.',
  ].join('\n');
}

function tryParseJsonPayload(content: string) {
  try {
    const trimmed = String(content || '').trim();
    const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1].trim() : trimmed;
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    const jsonText = firstBrace >= 0 && lastBrace > firstBrace ? candidate.slice(firstBrace, lastBrace + 1) : candidate;
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function sanitizeRows(rows: unknown) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => Array.isArray(row))
    .map((row) => row.map((cell) => (cell == null ? '' : String(cell))));
}

function sanitizeColumns(columns: unknown) {
  if (!Array.isArray(columns)) return [];
  return columns.map((column) => String(column || '').trim()).filter(Boolean);
}

function buildFallbackTableOutput(title: string, content: string) {
  return {
    type: 'table' as const,
    title,
    content,
    format: 'csv',
    table: {
      title,
      subtitle: '根据知识库整理',
      columns: ['结论', '说明'],
      rows: [[content, '请继续细化字段要求']],
    },
  };
}

function normalizeReportOutput(
  requestedKind: 'table' | 'page' | 'pdf' | 'ppt',
  prompt: string,
  rawContent: string,
) {
  const parsed = tryParseJsonPayload(rawContent);
  const title = String(parsed?.title || '知识库输出结果').trim() || '知识库输出结果';
  const content = String(parsed?.content || rawContent || '').trim();

  if (requestedKind === 'page') {
    return {
      type: 'page' as const,
      title,
      content,
      format: 'html',
      page: {
        summary: String(parsed?.page?.summary || content).trim(),
        cards: Array.isArray(parsed?.page?.cards) ? parsed.page.cards : [],
        sections: Array.isArray(parsed?.page?.sections) ? parsed.page.sections : [],
        charts: Array.isArray(parsed?.page?.charts) ? parsed.page.charts : [],
      },
    };
  }

  if (requestedKind === 'pdf') {
    return {
      type: 'pdf' as const,
      title,
      content,
      format: 'pdf',
      page: {
        summary: String(parsed?.page?.summary || content).trim(),
        sections: Array.isArray(parsed?.page?.sections) ? parsed.page.sections : [],
      },
    };
  }

  if (requestedKind === 'ppt') {
    return {
      type: 'ppt' as const,
      title,
      content,
      format: 'ppt',
      page: {
        summary: String(parsed?.page?.summary || content).trim(),
        sections: Array.isArray(parsed?.page?.sections) ? parsed.page.sections : [],
      },
    };
  }

  const columns = sanitizeColumns(parsed?.table?.columns);
  const rows = sanitizeRows(parsed?.table?.rows);
  if (!columns.length || !rows.length) {
    return buildFallbackTableOutput(title || prompt, content || rawContent);
  }

  return {
    type: 'table' as const,
    title,
    content,
    format: 'csv',
    table: {
      title: String(parsed?.table?.title || title).trim(),
      subtitle: String(parsed?.table?.subtitle || '根据知识库整理').trim(),
      columns,
      rows,
    },
  };
}

function collectLibraryTerms(library: DocumentLibrary, group?: ReportGroup) {
  return [
    library.key,
    library.label,
    library.description,
    group?.label,
    ...(group?.triggerKeywords || []),
  ]
    .filter(Boolean)
    .map((value) => normalizeText(String(value)))
    .filter(Boolean);
}

function scoreLibraryCandidate(prompt: string, library: DocumentLibrary, group?: ReportGroup) {
  const text = normalizeText(prompt);
  let score = 0;
  for (const term of collectLibraryTerms(library, group)) {
    if (!term) continue;
    if (text === term) score += 30;
    else if (text.includes(term)) score += Math.min(22, Math.max(8, term.length * 2));
  }

  if (group && findReportGroupForPrompt([group], prompt)) score += 18;
  if (library.key === 'contract' && /(合同|条款|付款|回款|违约|法务)/.test(text)) score += 20;
  if (/(奶粉|配方|菌株|营养|formula)/.test(text) && /(配方|formula|奶粉)/.test(normalizeText(`${library.key} ${library.label}`))) score += 22;
  if (/(简历|候选人|应聘|招聘|resume|cv)/.test(text) && /(resume|简历)/.test(normalizeText(`${library.key} ${library.label}`))) score += 16;
  if (/(论文|研究|实验|文献|paper|study)/.test(text) && /(paper|论文|学术)/.test(normalizeText(`${library.key} ${library.label}`))) score += 16;
  if (/(技术|接口|部署|系统|方案|api|architecture)/.test(text) && /(technical|技术|接口|部署)/.test(normalizeText(`${library.key} ${library.label}`))) score += 16;

  return score;
}

function collectLibraryMatches(
  prompt: string,
  groups: ReportGroup[],
  documentLibraries: Awaited<ReturnType<typeof loadDocumentLibraries>>,
) {
  const candidates: CandidateLibrary[] = documentLibraries
    .map((library) => {
      const group = groups.find((item) => item.key === library.key);
      return {
        library,
        group,
        score: scoreLibraryCandidate(prompt, library, group),
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!candidates.length) {
    const reportGroup = findReportGroupForPrompt(groups, prompt);
    if (!reportGroup) return [];
    const library = documentLibraries.find((item) => item.key === reportGroup.key);
    return library ? [{ library, group: reportGroup, score: 20 }] : [];
  }

  const topScore = candidates[0].score;
  return candidates.filter((item) => item.score >= Math.max(12, topScore - 8)).slice(0, 4);
}

function pickRequestedOutputKind(
  prompt: string,
  candidates: CandidateLibrary[],
): 'table' | 'page' | 'pdf' | 'ppt' {
  const explicit = detectExplicitOutputKind(prompt);
  if (explicit) return explicit;

  const templateType = candidates[0]?.group?.templates.find(
    (item) => item.key === candidates[0]?.group?.defaultTemplateKey,
  )?.type;
  return templateTypeToOutputKind(templateType);
}

function buildKnowledgeRetrievalQuery(prompt: string, libraries: Array<{ key: string; label: string }>) {
  const cleaned = String(prompt || '')
    .replace(/请按|按照|基于|根据|围绕|针对/g, ' ')
    .replace(/知识库|资料库|文档库|库内容|库里的|内容输出/g, ' ')
    .replace(/输出|生成|做一份|给我一份|一份/g, ' ')
    .replace(/表格报表|表格|报表|静态页|可视化页|分析页|报告|pdf|ppt/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const libraryHint = libraries.map((item) => item.label).join(' ');
  const merged = [cleaned, libraryHint].filter(Boolean).join(' ').trim();
  return merged || libraryHint || String(prompt || '').trim();
}

function buildKnowledgeContext(prompt: string, libraryLabels: string[], matches: ReturnType<typeof retrieveKnowledgeMatches>) {
  const topDocuments = matches.documents.slice(0, 6);
  const topEvidence = matches.evidenceMatches.slice(0, 8);
  return [
    `用户要求：${prompt}`,
    `限定知识库：${libraryLabels.join('、') || '未明确指定'}`,
    '',
    '文档摘要：',
    ...topDocuments.map(
      (item, index) =>
        `${index + 1}. ${item.title || item.name}\n摘要：${item.summary || item.excerpt || '无摘要'}\n主题：${
          (item.topicTags || []).join('、') || '未识别'
        }`,
    ),
    '',
    '高相关证据：',
    ...topEvidence.map(
      (item, index) => `${index + 1}. ${item.item.title || item.item.name}\n证据：${item.chunkText}`,
    ),
  ].join('\n\n');
}

function buildLibraryFallbackRetrieval(items: ParsedDocument[]): RetrievalLikeResult {
  const documents = [...items]
    .sort((a, b) => {
      const scoreA = (a.evidenceChunks?.length || 0) + (a.summary ? 4 : 0) + (a.parseStage === 'detailed' ? 6 : 0);
      const scoreB = (b.evidenceChunks?.length || 0) + (b.summary ? 4 : 0) + (b.parseStage === 'detailed' ? 6 : 0);
      return scoreB - scoreA;
    })
    .slice(0, 8);

  const evidenceMatches = documents.flatMap((item) =>
    (item.evidenceChunks || []).slice(0, 3).map((chunk, index) => ({
      item,
      chunkId: chunk.id || `${item.path}#fallback-${index}`,
      chunkText: chunk.text,
      score: Math.max(1, 20 - index),
    })),
  );

  return {
    documents,
    evidenceMatches: evidenceMatches.slice(0, 12),
    meta: {
      stages: ['rule', 'rerank'],
      vectorEnabled: false,
      candidateCount: items.length,
      rerankedCount: documents.length,
    },
  };
}

export async function runChatOrchestrationV2(input: ChatRequestInput) {
  const prompt = String(input.prompt || '').trim();
  const chatHistory = normalizeHistory(input.chatHistory);
  const gatewayReachable = await isOpenClawGatewayReachable();
  const gatewayConfigured = gatewayReachable || isOpenClawGatewayConfigured();
  const traceId = `trace_${Date.now()}`;

  let mode: 'openclaw' | 'fallback' = 'fallback';
  let content = buildCloudUnavailableAnswer();
  let output: ChatOutput = { type: 'answer', content };
  let libraries: Array<{ key: string; label: string }> = [];
  let fallbackReason = gatewayConfigured ? '' : 'cloud-gateway-not-configured';

  if (gatewayConfigured) {
    try {
      if (looksLikeKnowledgeReportPrompt(prompt)) {
        const [reportState, documentLibraries, documentState] = await Promise.all([
          loadReportCenterState(),
          loadDocumentLibraries(),
          loadParsedDocuments(240, false),
        ]);

        const candidates = collectLibraryMatches(prompt, reportState.groups, documentLibraries);
        libraries = candidates.map((item) => ({ key: item.library.key, label: item.library.label }));

        const scopedItems = candidates.length
          ? documentState.items.filter((item) =>
              candidates.some((candidate) => documentMatchesLibrary(item, candidate.library)),
            )
          : [];

        const retrievalQuery = buildKnowledgeRetrievalQuery(prompt, libraries);
        let retrieval = retrieveKnowledgeMatches(scopedItems, retrievalQuery, { docLimit: 8, evidenceLimit: 10 });
        if (!retrieval.documents.length && scopedItems.length) {
          retrieval = buildLibraryFallbackRetrieval(scopedItems);
        }

        if (retrieval.documents.length) {
          const requestedKind = pickRequestedOutputKind(prompt, candidates);
          const knowledgeContext = buildKnowledgeContext(
            prompt,
            libraries.map((item) => item.label),
            retrieval,
          );
          const cloud = await runOpenClawChat({
            prompt,
            sessionUser: input.sessionUser,
            chatHistory,
            contextBlocks: [knowledgeContext],
            systemPrompt: [
              '你是产品“AI 知识数据管理”里的云端智能助手。',
              '用户明确要求按知识库内容输出结果。',
              '必须以提供的知识库证据为主，不能脱离知识库自由发挥。',
              '如果证据不足，只能补充有限推断，并明确哪些点来自知识库，哪些点是补充建议。',
              buildReportTemplateInstruction(requestedKind),
            ].join('\n'),
          });

          content = cloud.content;
          output = normalizeReportOutput(requestedKind, prompt, cloud.content);
          mode = 'openclaw';
        } else {
          const libraryHint = libraries.length
            ? `当前已尝试知识库：${libraries.map((item) => item.label).join('、')}`
            : '当前没有稳定命中的知识库';
          content = `${libraryHint}。\n\n这次没有检索到足够的知识库证据，暂不生成报表。请换一种更明确的知识库表述，或者先把相关文档加入对应知识库后再试。`;
          output = { type: 'answer', content };
          mode = 'openclaw';
        }
      } else {
        const result = await runOpenClawChat({
          prompt,
          sessionUser: input.sessionUser,
          chatHistory,
        });
        content = result.content;
        output = { type: 'answer', content };
        mode = 'openclaw';
      }
    } catch (error) {
      fallbackReason = summarizeError(error);
      console.warn(`[chat:fallback] trace=${traceId} reason=${fallbackReason}`);
      content = buildCloudUnavailableAnswer();
      output = { type: 'answer', content };
      mode = 'fallback';
    }
  }

  return {
    mode,
    intent: output.type === 'answer' ? ('general' as const) : ('report' as const),
    needsKnowledge: libraries.length > 0,
    libraries,
    output,
    guard: {
      requiresConfirmation: false,
      reason: '',
    },
    scenario: 'default' as ScenarioKey,
    traceId,
    message: {
      role: 'assistant' as const,
      content,
      output,
      meta: mode === 'openclaw' ? '云端智能回复' : '云端回复暂不可用',
      references: [],
    },
    panel: buildDefaultPanel(),
    sources: [],
    permissions: { mode: 'read-only' as const },
    orchestration: {
      mode,
      docMatches: libraries.length,
      gatewayConfigured,
      fallbackReason: mode === 'fallback' ? fallbackReason : '',
    },
    conversationState: null,
    latencyMs: 120,
  };
}
