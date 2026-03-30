import type { DocumentLibrary } from './document-libraries.js';

export type CandidateLibrary = {
  library: DocumentLibrary;
  score: number;
};

export type KnowledgePlan = {
  request: string;
  libraries: Array<{ key: string; label: string }>;
  outputType: string;
};

const LIBRARY_ALIAS_HINTS: Array<{ matchers: string[]; aliases: string[] }> = [
  {
    matchers: ['resume', '简历', '人才', '候选人', 'cv'],
    aliases: ['resume', 'cv', '简历', '简历库', '人才', '人才简历', '候选人', '履历', '求职', '应聘'],
  },
  {
    matchers: ['iot', '物联网', '解决方案', '设备', '网关'],
    aliases: ['iot', '物联网', '解决方案', '设备', '网关', '传感', '平台'],
  },
  {
    matchers: ['bid', 'bids', 'tender', 'rfp', '招标', '投标', '标书'],
    aliases: ['bid', 'bids', 'tender', 'rfp', '招标', '投标', '标书', '采购'],
  },
  {
    matchers: ['order', '订单', '销售', 'inventory', '库存', 'sku'],
    aliases: ['order', 'orders', '订单', '销售', 'inventory', '库存', 'sku', '补货', 'erp'],
  },
  {
    matchers: ['paper', 'study', 'journal', '论文', '研究'],
    aliases: ['paper', 'study', 'journal', '论文', '研究', '学术'],
  },
  {
    matchers: ['contract', '合同', '条款'],
    aliases: ['contract', '合同', '条款', '法务'],
  },
];

function normalizeText(value: string) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[，。、、“”"'‘’；;!?！？（）()\[\]\-_/\\|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectOutputKind(text: string): 'table' | 'page' | 'pdf' | 'ppt' | null {
  const normalized = normalizeText(text);
  if (!normalized) return null;
  if (/静态页|可视化页面|数据可视化|图表页面|dashboard|landing page|\bpage\b/.test(normalized)) return 'page';
  if (/\bppt\b|演示稿|汇报稿|汇报提纲/.test(normalized)) return 'ppt';
  if (/\bpdf\b|文档版|正式文档|word|docx/.test(normalized)) return 'pdf';
  if (/报表|表格|对比表|清单|报告/.test(normalized)) return 'table';
  return null;
}

export function buildPromptForScoring(
  prompt: string,
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
) {
  const recent = chatHistory
    .filter((item) => item.role === 'user')
    .map((item) => item.content)
    .slice(-3)
    .join(' ');
  return `${recent} ${prompt}`.trim();
}

function collectLibraryTerms(library: DocumentLibrary) {
  const terms = [library.key, library.label, library.description]
    .filter(Boolean)
    .map((value) => normalizeText(String(value)));
  return [...new Set(terms.filter(Boolean))];
}

function collectLibraryAliases(library: DocumentLibrary) {
  const haystack = normalizeText(`${library.key} ${library.label} ${library.description || ''}`);
  const aliases = LIBRARY_ALIAS_HINTS
    .filter((hint) => hint.matchers.some((matcher) => haystack.includes(normalizeText(matcher))))
    .flatMap((hint) => hint.aliases)
    .map((value) => normalizeText(value))
    .filter(Boolean);

  return [...new Set(aliases)];
}

function scoreLibraryCandidate(prompt: string, library: DocumentLibrary) {
  const rawText = String(prompt || '');
  const text = normalizeText(prompt);
  const libraryText = normalizeText(`${library.key} ${library.label} ${library.description || ''}`);
  let score = 0;

  if (!text) return score;

  if (library.label && rawText.includes(library.label)) score += 36;
  if (library.key && rawText.includes(library.key)) score += 28;

  for (const term of collectLibraryTerms(library)) {
    if (!term) continue;
    if (text === term) score += 28;
    else if (text.includes(term)) score += Math.min(20, Math.max(8, term.length * 2));
  }

  for (const alias of collectLibraryAliases(library)) {
    if (!alias) continue;
    if (text === alias) score += 26;
    else if (text.includes(alias)) score += Math.min(18, Math.max(8, alias.length * 2));
  }

  if (/(配方|成分|formula)/.test(text) && /(配方|成分|formula)/.test(libraryText)) score += 18;
  if (/(合同|条款|付款|回款|违约|法务|contract)/.test(text) && /(合同|contract)/.test(libraryText)) score += 18;
  if (/(简历|候选人|招聘|应聘|resume|cv)/.test(text) && /(简历|resume|cv|候选人|人才)/.test(libraryText)) score += 18;
  if (/(论文|研究|期刊|paper|study|trial)/.test(text) && /(论文|paper|research|学术)/.test(libraryText)) score += 16;
  if (/(技术|接口|解决方案|物联网|api|technical|integration)/.test(text) && /(技术|解决方案|api|technical|iot)/.test(libraryText)) score += 16;
  if (/(招标|投标|标书|采购|bids|tender)/.test(text) && /(招标|投标|标书|bids|tender)/.test(libraryText)) score += 18;
  if (/(订单|库存|销量|平台|客诉|erp|经营)/.test(text) && /(订单|库存|销量|经营|erp|电商)/.test(libraryText)) score += 18;

  return score;
}

export function collectLibraryMatches(prompt: string, libraries: DocumentLibrary[]) {
  const candidates: CandidateLibrary[] = libraries
    .map((library) => ({ library, score: scoreLibraryCandidate(prompt, library) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!candidates.length) return [];
  const topScore = candidates[0].score;
  return candidates.filter((item) => item.score >= Math.max(12, topScore - 8)).slice(0, 4);
}

export function buildKnowledgePlanPrompt(
  prompt: string,
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
) {
  const recentTurns = chatHistory
    .map((item) => `${item.role === 'user' ? '用户' : '助手'}: ${item.content}`)
    .slice(-5)
    .join('\n');

  return [
    recentTurns ? `最近对话:\n${recentTurns}` : '',
    `当前补充输入: ${prompt}`,
    '请把最近 3 到 5 轮对话整理成一条“按知识库输出”的执行需求。',
    '要求:',
    '1. 只返回 JSON，不要解释，不要 Markdown。',
    '2. JSON schema 为 {"request":"...", "outputType":"page|table|pdf|ppt"}。',
    '3. request 必须是一句完整中文，明确主题、输出形式和重点。',
    '4. 如果无法稳定判断输出形式，outputType 默认使用 page。',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function shouldFallbackToLocalPlan(planText: string) {
  const text = String(planText || '').trim();
  if (!text) return true;
  const questionMarks = (text.match(/\?/g) || []).length;
  const hasTooManyQuestionMarks = questionMarks >= 4 || (text.length > 0 && questionMarks / text.length >= 0.2);
  return (
    hasTooManyQuestionMarks
    || /乱码|看不清|无法识别|未能识别|无法判断|重新发送|请提供具体|无法提取有效需求|输入内容无法提取|无效数据/.test(text)
  );
}

export function buildLocalKnowledgePlan(
  prompt: string,
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
) {
  const recentUserContent = chatHistory
    .filter((item) => item.role === 'user')
    .map((item) => item.content)
    .slice(-3)
    .join('。');

  const source = [recentUserContent, prompt]
    .filter(Boolean)
    .join('。')
    .replace(/\s+/g, ' ')
    .trim();

  const outputKind = detectOutputKind(source) || 'page';
  const outputLabel = outputKind === 'page'
    ? '数据可视化静态页'
    : outputKind === 'pdf'
      ? '文档'
      : outputKind === 'ppt'
        ? 'PPT'
        : '表格报表';

  const request = source
    ? `${source}，输出形式为${outputLabel}`
    : `请基于当前对话整理知识库内容，输出形式为${outputLabel}`;

  return {
    request,
    outputType: outputKind,
  };
}

export function buildKnowledgePlanMessage() {
  return '我已经根据最近几轮对话整理出一条按知识库处理的需求，你可以直接继续补充或确认。';
}

export function buildNoPlanMessage() {
  return '这次还没有整理出稳定的知识库处理需求，请补充更明确的目标后再继续。';
}

export function extractPlanningResult(
  rawContent: string,
  fallbackPrompt: string,
): { request: string; outputType: string } {
  try {
    const trimmed = String(rawContent || '').trim();
    const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1].trim() : trimmed;
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    const jsonText = firstBrace >= 0 && lastBrace > firstBrace
      ? candidate.slice(firstBrace, lastBrace + 1)
      : candidate;
    const parsed = JSON.parse(jsonText);
    const request = String(parsed?.request || '').trim() || fallbackPrompt;
    const detected = String(parsed?.outputType || '').trim().toLowerCase();
    const outputType = ['page', 'table', 'pdf', 'ppt'].includes(detected) ? detected : 'page';
    return { request, outputType };
  } catch {
    return { request: fallbackPrompt, outputType: 'page' };
  }
}
