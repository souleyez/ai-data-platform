import { retrieveKnowledgeMatches } from './document-retrieval.js';
import { documentMatchesLibrary, loadDocumentLibraries, type DocumentLibrary } from './document-libraries.js';
import { loadParsedDocuments } from './document-store.js';
import { isOpenClawGatewayConfigured, isOpenClawGatewayReachable, runOpenClawChat } from './openclaw-adapter.js';

export type ChatRequestInput = {
  prompt: string;
  sessionUser?: string;
  chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  mode?: 'general' | 'knowledge_plan' | 'knowledge_output';
  confirmedRequest?: string;
};

type ChatOutput =
  | { type: 'answer'; content: string }
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
  score: number;
};

type KnowledgePlan = {
  request: string;
  libraries: Array<{ key: string; label: string }>;
  outputType: string;
};

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
  return message ? message.replace(/\s+/g, ' ').slice(0, 240) : 'unknown-error';
}

function buildCloudUnavailableAnswer() {
  return '当前云端模型暂时不可用，请稍后再试。';
}

function normalizeText(value: string) {
  return String(value || '').toLowerCase().replace(/\s+/g, '');
}

function detectOutputKind(text: string): 'table' | 'page' | 'pdf' | 'ppt' | null {
  if (/(静态页|可视化页|分析页|页面)/.test(text)) return 'page';
  if (/\bppt\b/i.test(text)) return 'ppt';
  if (/\bpdf\b/i.test(text)) return 'pdf';
  if (/(报表|表格|报告)/.test(text)) return 'table';
  return null;
}

function buildPromptForScoring(prompt: string, chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>) {
  const recent = chatHistory
    .filter((item) => item.role === 'user')
    .map((item) => item.content)
    .slice(-3)
    .join(' ');
  return `${recent} ${prompt}`.trim();
}

function collectLibraryTerms(library: DocumentLibrary) {
  return [library.key, library.label, library.description]
    .filter(Boolean)
    .map((value) => normalizeText(String(value)));
}

function scoreLibraryCandidate(prompt: string, library: DocumentLibrary) {
  const rawText = String(prompt || '');
  const text = normalizeText(prompt);
  let score = 0;

  if (rawText.includes(library.label) || rawText.includes(library.key)) score += 28;

  for (const term of collectLibraryTerms(library)) {
    if (!term) continue;
    if (text === term) score += 24;
    else if (text.includes(term)) score += Math.min(18, Math.max(6, term.length * 2));
  }

  const libraryText = normalizeText(`${library.key} ${library.label} ${library.description || ''}`);
  if (/(奶粉|配方|formula|营养|菌株)/.test(text) && /(奶粉|配方|formula)/.test(libraryText)) score += 18;
  if (/(合同|条款|付款|回款|违约|法务|contract)/.test(text) && /(合同|contract)/.test(libraryText)) score += 16;
  if (/(简历|候选人|招聘|应聘|resume|cv)/.test(text) && /(简历|resume|cv|候选人)/.test(libraryText)) score += 16;
  if (/(论文|研究|实验|paper|study)/.test(text) && /(论文|paper|学术)/.test(libraryText)) score += 14;
  if (/(技术|接口|部署|系统|api|architecture)/.test(text) && /(技术|接口|部署|api|technical)/.test(libraryText)) score += 14;

  return score;
}

function collectLibraryMatches(prompt: string, libraries: DocumentLibrary[]) {
  const candidates: CandidateLibrary[] = libraries
    .map((library) => ({ library, score: scoreLibraryCandidate(prompt, library) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!candidates.length) return [];
  const topScore = candidates[0].score;
  return candidates.filter((item) => item.score >= Math.max(10, topScore - 6)).slice(0, 4);
}

function buildKnowledgeRetrievalQuery(requestText: string, libraries: Array<{ key: string; label: string }>) {
  const cleaned = String(requestText || '')
    .replace(/请按|按照|基于|根据|围绕|针对/g, ' ')
    .replace(/知识库|资料库|文档库|库内内容/g, ' ')
    .replace(/输出|生成|做一份|给我一份/g, ' ')
    .replace(/表格报表|表格|报表|静态页|可视化页|分析页|报告|pdf|ppt/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const libraryHint = libraries.map((item) => item.label).join(' ');
  return [cleaned, libraryHint].filter(Boolean).join(' ').trim();
}

function buildKnowledgeContext(
  requestText: string,
  libraries: Array<{ key: string; label: string }>,
  retrieval: ReturnType<typeof retrieveKnowledgeMatches> | { documents: any[]; evidenceMatches: any[] },
) {
  const documents = retrieval.documents.slice(0, 6);
  const evidence = retrieval.evidenceMatches.slice(0, 8);

  return [
    `用户需求：${requestText}`,
    `优先知识库：${libraries.map((item) => item.label).join('、') || '未明确'}`,
    '',
    '文档摘要：',
    ...documents.map(
      (item, index) =>
        `${index + 1}. ${item.title || item.name}\n摘要：${item.summary || item.excerpt || '无摘要'}\n主题：${
          (item.topicTags || []).join('、') || '未识别'
        }`,
    ),
    '',
    '高相关证据：',
    ...evidence.map((item, index) => `${index + 1}. ${item.item.title || item.item.name}\n证据：${item.chunkText}`),
  ].join('\n\n');
}

function buildLibraryFallbackRetrieval(scopedItems: any[]) {
  const documents = scopedItems.slice(0, 6).map((item) => ({
    ...item,
    title: item.title || item.name || '未命名文档',
  }));

  const evidenceMatches = scopedItems
    .flatMap((item) =>
      (item.evidenceChunks || [])
        .slice(0, 2)
        .map((chunk: string) => ({
          item,
          chunkText: String(chunk || '').trim(),
          score: 1,
        })),
    )
    .filter((entry) => entry.chunkText)
    .slice(0, 8);

  return { documents, evidenceMatches };
}

function buildKnowledgePlanPrompt(prompt: string, chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>) {
  const recentTurns = chatHistory
    .map((item) => `${item.role === 'user' ? '用户' : '助手'}：${item.content}`)
    .slice(-5)
    .join('\n');

  return [
    recentTurns ? `最近对话：\n${recentTurns}` : '',
    `当前补充输入：${prompt}`,
    '请把最近 3 到 5 轮对话整理成一条“按知识库输出”的执行需求。',
    '要求：',
    '1. 输出中文。',
    '2. 只返回 JSON，不要解释，不要使用 Markdown。',
    '3. JSON schema 为 {"request":"...", "outputType":"table|page|pdf|ppt"}。',
    '4. request 必须是一句完整自然语言，清楚说明主题、输出形式和重点。',
    '5. 如果无法判断输出形式，默认 outputType 为 table。',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function shouldFallbackToLocalPlan(planText: string) {
  const text = String(planText || '').trim();
  if (!text) return true;
  return /(乱码|无法从当前对话|重新发送清晰|未能识别|看不清|无法判断)/.test(text);
}

function buildLocalKnowledgePlan(prompt: string, chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>) {
  const recentUserContent = chatHistory
    .filter((item) => item.role === 'user')
    .map((item) => item.content)
    .slice(-3)
    .join('，');

  const source = [recentUserContent, prompt].filter(Boolean).join('，').replace(/\s+/g, ' ').trim();
  const outputKind = detectOutputKind(source) || 'table';
  const outputLabel = outputKind === 'page'
    ? '静态页'
    : outputKind === 'pdf'
      ? 'PDF'
      : outputKind === 'ppt'
        ? 'PPT'
        : '表格报表';

  const request = source
    ? `${source}，输出为${outputLabel}`
    : `请基于当前对话整理知识库内容，输出为${outputLabel}`;

  return {
    request,
    outputType: outputKind,
  };
}

function buildReportInstruction(kind: 'table' | 'page' | 'pdf' | 'ppt') {
  if (kind === 'page') {
    return [
      '你必须只输出 JSON。',
      'Schema:',
      '{"title":"...","content":"...","page":{"summary":"...","cards":[{"label":"...","value":"...","note":"..."}],"sections":[{"title":"...","body":"...","bullets":["..."]}],"charts":[{"title":"...","items":[{"label":"...","value":12}]}]}}',
      '所有内容必须是中文。',
    ].join('\n');
  }

  if (kind === 'pdf' || kind === 'ppt') {
    return [
      '你必须只输出 JSON。',
      'Schema:',
      '{"title":"...","content":"...","page":{"summary":"...","sections":[{"title":"...","body":"...","bullets":["..."]}]}}',
      '所有内容必须是中文。',
    ].join('\n');
  }

  return [
    '你必须只输出 JSON。',
    'Schema:',
    '{"title":"...","content":"...","table":{"title":"...","subtitle":"...","columns":["..."],"rows":[["...","..."]]}}',
    '所有内容必须是中文。',
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

function sanitizeColumns(columns: unknown) {
  if (!Array.isArray(columns)) return [];
  return columns.map((column) => String(column || '').trim()).filter(Boolean);
}

function sanitizeRows(rows: unknown) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => Array.isArray(row))
    .map((row) => row.map((cell) => (cell == null ? '' : String(cell))));
}

function buildFallbackTableOutput(title: string, content: string): ChatOutput {
  return {
    type: 'table',
    title,
    content,
    format: 'csv',
    table: {
      title,
      subtitle: '根据知识库整理',
      columns: ['结论', '说明'],
      rows: [[content, '如需更细字段，可以继续补充要求']],
    },
  };
}

function normalizeReportOutput(kind: 'table' | 'page' | 'pdf' | 'ppt', requestText: string, rawContent: string): ChatOutput {
  const parsed = tryParseJsonPayload(rawContent);
  const title = String(parsed?.title || '知识库输出结果').trim() || '知识库输出结果';
  const content = String(parsed?.content || rawContent || '').trim();

  if (kind === 'page') {
    return {
      type: 'page',
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

  if (kind === 'pdf') {
    return {
      type: 'pdf',
      title,
      content,
      format: 'pdf',
      page: {
        summary: String(parsed?.page?.summary || content).trim(),
        sections: Array.isArray(parsed?.page?.sections) ? parsed.page.sections : [],
      },
    };
  }

  if (kind === 'ppt') {
    return {
      type: 'ppt',
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
    return buildFallbackTableOutput(title || requestText, content || rawContent);
  }

  return {
    type: 'table',
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

function buildKnowledgePlanMessage() {
  return '我已根据最近几轮对话整理出一条按知识库输出的需求。请先确认或修改，再执行输出。';
}

function buildKnowledgeMissMessage(libraries: Array<{ key: string; label: string }>) {
  if (libraries.length) {
    return `当前已尝试知识库：${libraries.map((item) => item.label).join('、')}。\n\n这次没有检索到足够的知识库证据，暂不生成结果。请换一种更明确的知识库表述，或先补充相关文档。`;
  }
  return '当前没有稳定命中的知识库，暂不生成结果。请先说明要基于哪个知识库输出。';
}

function buildNoPlanMessage() {
  return '这次还没有整理出稳定的知识库输出需求。请再补充一句更明确的目标，然后重新点击“按知识库输出”。';
}

function extractPlanningResult(rawContent: string, fallbackPrompt: string): { request: string; outputType: string } {
  const parsed = tryParseJsonPayload(rawContent);
  const request = String(parsed?.request || '').trim() || fallbackPrompt;
  const detected = String(parsed?.outputType || '').trim().toLowerCase();
  const outputType = detected === 'page' || detected === 'pdf' || detected === 'ppt' ? detected : 'table';
  return { request, outputType };
}

export async function runChatOrchestrationV2(input: ChatRequestInput) {
  const prompt = String(input.prompt || '').trim();
  const chatHistory = normalizeHistory(input.chatHistory);
  const gatewayReachable = await isOpenClawGatewayReachable();
  const gatewayConfigured = gatewayReachable || isOpenClawGatewayConfigured();
  const traceId = `trace_${Date.now()}`;
  const requestMode = input.mode || 'general';

  let mode: 'openclaw' | 'fallback' = 'fallback';
  let content = buildCloudUnavailableAnswer();
  let output: ChatOutput = { type: 'answer', content };
  let intent: 'general' | 'report' = requestMode === 'general' ? 'general' : 'report';
  let libraries: Array<{ key: string; label: string }> = [];
  let fallbackReason = gatewayConfigured ? '' : 'cloud-gateway-not-configured';
  let knowledgePlan: KnowledgePlan | null = null;

  if (gatewayConfigured) {
    try {
      if (requestMode === 'knowledge_plan') {
        const [documentLibraries, cloud] = await Promise.all([
          loadDocumentLibraries(),
          runOpenClawChat({
            prompt: buildKnowledgePlanPrompt(prompt, chatHistory),
            sessionUser: input.sessionUser,
            chatHistory: [],
          }),
        ]);

        const cloudPlan = extractPlanningResult(cloud.content, prompt);
        const planning = shouldFallbackToLocalPlan(cloudPlan.request)
          ? buildLocalKnowledgePlan(prompt, chatHistory)
          : cloudPlan;
        const matchedLibraries = collectLibraryMatches(buildPromptForScoring(planning.request, chatHistory), documentLibraries)
          .map((item) => ({ key: item.library.key, label: item.library.label }));

        knowledgePlan = {
          request: planning.request,
          libraries: matchedLibraries,
          outputType: planning.outputType,
        };

        content = planning.request ? buildKnowledgePlanMessage() : buildNoPlanMessage();
        output = { type: 'answer', content };
        intent = 'report';
        libraries = matchedLibraries;
        mode = 'openclaw';
      } else if (requestMode === 'knowledge_output') {
        const requestText = String(input.confirmedRequest || prompt).trim();
        const [documentLibraries, documentState] = await Promise.all([
          loadDocumentLibraries(),
          loadParsedDocuments(240, false),
        ]);

        const candidates = collectLibraryMatches(buildPromptForScoring(requestText, chatHistory), documentLibraries);
        libraries = candidates.map((item) => ({ key: item.library.key, label: item.library.label }));

        const scopedItems = candidates.length
          ? documentState.items.filter((item) =>
              candidates.some((candidate) => documentMatchesLibrary(item, candidate.library)),
            )
          : [];

        const retrieval = retrieveKnowledgeMatches(
          scopedItems,
          buildKnowledgeRetrievalQuery(requestText, libraries),
          { docLimit: 8, evidenceLimit: 10 },
        );

        const effectiveRetrieval =
          retrieval.documents.length || retrieval.evidenceMatches.length
            ? retrieval
            : buildLibraryFallbackRetrieval(scopedItems);

        if (!effectiveRetrieval.documents.length) {
          content = buildKnowledgeMissMessage(libraries);
          output = { type: 'answer', content };
          intent = 'report';
          mode = 'openclaw';
        } else {
          const requestedKind = detectOutputKind(requestText) || 'table';
          const cloud = await runOpenClawChat({
            prompt: requestText,
            sessionUser: input.sessionUser,
            chatHistory,
            contextBlocks: [buildKnowledgeContext(requestText, libraries, effectiveRetrieval)],
            systemPrompt: [
              '你是 AI智能服务 中负责按知识库生成结果的助手。',
              '用户已经明确要求按知识库输出，请严格以提供的知识库证据为主。',
              '不要脱离知识库自由发挥。',
              '如果证据不足，只能有限补充，并在内容里保持克制。',
              buildReportInstruction(requestedKind),
            ].join('\n'),
          });

          output = normalizeReportOutput(requestedKind, requestText, cloud.content);
          content = output.content;
          intent = 'report';
          mode = 'openclaw';
        }
      } else {
        const cloud = await runOpenClawChat({
          prompt,
          sessionUser: input.sessionUser,
          chatHistory,
        });

        content = cloud.content;
        output = { type: 'answer', content };
        intent = 'general';
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
    intent,
    needsKnowledge: requestMode !== 'general',
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
    conversationState: null,
    latencyMs: 120,
  };
}
