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

function normalizeText(value: string) {
  return String(value || '').toLowerCase().replace(/\s+/g, '');
}

export function detectOutputKind(text: string): 'table' | 'page' | 'pdf' | 'ppt' | null {
  if (/(静态页|可视化页|分析页|页面)/.test(text)) return 'page';
  if (/\bppt\b/i.test(text)) return 'ppt';
  if (/\bpdf\b/i.test(text)) return 'pdf';
  if (/(报表|表格|报告)/.test(text)) return 'table';
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

export function collectLibraryMatches(prompt: string, libraries: DocumentLibrary[]) {
  const candidates: CandidateLibrary[] = libraries
    .map((library) => ({ library, score: scoreLibraryCandidate(prompt, library) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!candidates.length) return [];
  const topScore = candidates[0].score;
  return candidates.filter((item) => item.score >= Math.max(10, topScore - 6)).slice(0, 4);
}

export function buildKnowledgePlanPrompt(
  prompt: string,
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
) {
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

export function shouldFallbackToLocalPlan(planText: string) {
  const text = String(planText || '').trim();
  if (!text) return true;
  return /(乱码|无法从当前对话|重新发送清晰|未能识别|看不清|无法判断)/.test(text);
}

export function buildLocalKnowledgePlan(
  prompt: string,
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
) {
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

export function buildKnowledgePlanMessage() {
  return '我已根据最近几轮对话整理出一条按知识库输出的需求。请先确认或修改，再执行输出。';
}

export function buildNoPlanMessage() {
  return '这次还没有整理出稳定的知识库输出需求。请再补充一句更明确的目标，然后重新点击“按知识库输出”。';
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
    const jsonText = firstBrace >= 0 && lastBrace > firstBrace ? candidate.slice(firstBrace, lastBrace + 1) : candidate;
    const parsed = JSON.parse(jsonText);
    const request = String(parsed?.request || '').trim() || fallbackPrompt;
    const detected = String(parsed?.outputType || '').trim().toLowerCase();
    const outputType = detected === 'page' || detected === 'pdf' || detected === 'ppt' ? detected : 'table';
    return { request, outputType };
  } catch {
    return { request: fallbackPrompt, outputType: 'table' };
  }
}
