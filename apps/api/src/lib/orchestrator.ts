import { scenarios, type ScenarioKey } from './mock-data.js';
import { retrieveKnowledgeMatches } from './document-retrieval.js';
import { loadDocumentLibraries } from './document-libraries.js';
import { loadParsedDocuments } from './document-store.js';
import { findReportGroupForPrompt, loadReportCenterState, type ReportGroup } from './report-center.js';
import { isOpenClawGatewayConfigured, isOpenClawGatewayReachable, runOpenClawChat } from './openclaw-adapter.js';

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

function looksLikeKnowledgeReportPrompt(prompt: string) {
  const text = String(prompt || '').toLowerCase();
  const wantsKnowledge = /(知识库|资料库|文档库|按库|基于.*知识库|根据.*知识库)/i.test(text);
  const wantsOutput = /(报表|表格|静态页|pdf|ppt|报告|汇总页|分析页)/i.test(text);
  return wantsKnowledge && wantsOutput;
}

function detectRequestedOutput(prompt: string) {
  const text = String(prompt || '').toLowerCase();
  if (/(静态页|分析页|可视化页|页面)/i.test(text)) return 'page' as const;
  if (/\bppt\b/i.test(text)) return 'ppt' as const;
  if (/\bpdf\b/i.test(text)) return 'pdf' as const;
  return 'table' as const;
}

function buildReportTemplateInstruction(kind: 'table' | 'page' | 'pdf' | 'ppt') {
  if (kind === 'page') {
    return [
      'You must answer with valid JSON only.',
      'Schema:',
      '{"title":"...", "content":"...", "page":{"summary":"...", "cards":[{"label":"...","value":"...","note":"..."}], "sections":[{"title":"...","body":"...","bullets":["..."]}], "charts":[{"title":"...","items":[{"label":"...","value":12}]}]}}',
      'Keep content concise and readable.',
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

function collectLibraryMatches(
  prompt: string,
  groups: ReportGroup[],
  documentLibraries: Awaited<ReturnType<typeof loadDocumentLibraries>>,
) {
  const text = String(prompt || '').toLowerCase();
  const matched = documentLibraries.filter((library) => {
    const terms = [library.key, library.label, library.description]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());
    return terms.some((term) => term && text.includes(term));
  });

  if (matched.length) return matched;

  const groupMatch = findReportGroupForPrompt(groups, prompt);
  if (!groupMatch) return [];
  return documentLibraries.filter((library) => library.key === groupMatch.key);
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
          loadParsedDocuments(200, false),
        ]);
        const matchedLibraries = collectLibraryMatches(prompt, reportState.groups, documentLibraries);
        libraries = matchedLibraries.map((library) => ({ key: library.key, label: library.label }));

        const scopedItems = matchedLibraries.length
          ? documentState.items.filter((item) =>
              (item.confirmedGroups || item.groups || []).some((group) =>
                matchedLibraries.some((library) => library.key === group),
              ),
            )
          : documentState.items;

        const retrieval = retrieveKnowledgeMatches(scopedItems, prompt, { docLimit: 8, evidenceLimit: 10 });
        if (retrieval.documents.length) {
          const requestedKind = detectRequestedOutput(prompt);
          const knowledgeContext = buildKnowledgeContext(prompt, libraries.map((item) => item.label), retrieval);
          const cloud = await runOpenClawChat({
            prompt,
            sessionUser: input.sessionUser,
            chatHistory,
            contextBlocks: [knowledgeContext],
            systemPrompt: [
              'You are the cloud assistant inside the product "AI 知识数据管理".',
              'The user explicitly requested an output based on knowledge-base content.',
              'Use the supplied knowledge-base evidence as the primary basis.',
              'Do not mention hidden routing logic.',
              buildReportTemplateInstruction(requestedKind),
            ].join('\n'),
          });

          content = cloud.content;
          output = normalizeReportOutput(requestedKind, prompt, cloud.content);
          mode = 'openclaw';
        } else {
          const cloud = await runOpenClawChat({
            prompt: `${prompt}\n\n未命中有效知识库资料，请直接说明缺少相关资料，并提示用户补充知识库内容或换个更明确的知识库名称。`,
            sessionUser: input.sessionUser,
            chatHistory,
          });
          content = cloud.content;
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
