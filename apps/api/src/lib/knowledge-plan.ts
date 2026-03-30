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
    matchers: ['resume', '\u7b80\u5386', '\u4eba\u624d', '\u5019\u9009\u4eba', 'cv'],
    aliases: ['resume', 'cv', '\u7b80\u5386', '\u7b80\u5386\u5e93', '\u4eba\u624d', '\u4eba\u624d\u7b80\u5386', '\u5019\u9009\u4eba', '\u5c65\u5386', '\u6c42\u804c', '\u5e94\u8058'],
  },
  {
    matchers: ['iot', '\u7269\u8054\u7f51', '\u89e3\u51b3\u65b9\u6848', '\u8bbe\u5907', '\u7f51\u5173'],
    aliases: ['iot', '\u7269\u8054\u7f51', '\u89e3\u51b3\u65b9\u6848', '\u8bbe\u5907', '\u7f51\u5173', '\u4f20\u611f', '\u5e73\u53f0'],
  },
  {
    matchers: ['bid', 'bids', 'tender', 'rfp', '\u62db\u6807', '\u6295\u6807', '\u6807\u4e66'],
    aliases: ['bid', 'bids', 'tender', 'rfp', '\u62db\u6807', '\u6295\u6807', '\u6807\u4e66', '\u91c7\u8d2d'],
  },
  {
    matchers: ['order', '\u8ba2\u5355', '\u9500\u552e', 'inventory', '\u5e93\u5b58', 'sku'],
    aliases: ['order', 'orders', '\u8ba2\u5355', '\u9500\u552e', 'inventory', '\u5e93\u5b58', 'sku', '\u8865\u8d27', 'erp'],
  },
  {
    matchers: ['paper', 'study', 'journal', '\u8bba\u6587', '\u7814\u7a76'],
    aliases: ['paper', 'study', 'journal', '\u8bba\u6587', '\u7814\u7a76', '\u5b66\u672f'],
  },
  {
    matchers: ['contract', '\u5408\u540c', '\u6761\u6b3e'],
    aliases: ['contract', '\u5408\u540c', '\u6761\u6b3e', '\u6cd5\u52a1'],
  },
];

function normalizeText(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/[锛屻€傘€佲€溾€?'鈥樷€欙紱;!?锛侊紵锛堬級()\[\]\-_/\\|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectOutputKind(text: string): 'table' | 'page' | 'pdf' | 'ppt' | null {
  const normalized = normalizeText(text);
  if (!normalized) return null;
  if (/\u9759\u6001\u9875|\u53ef\u89c6\u5316\u9875\u9762|\u6570\u636e\u53ef\u89c6\u5316|\u56fe\u8868\u9875\u9762|dashboard|landing page|\bpage\b/.test(normalized)) return 'page';
  if (/\bppt\b|\u6f14\u793a\u7a3f|\u6c47\u62a5\u7a3f|\u6c47\u62a5\u63d0\u7eb2/.test(normalized)) return 'ppt';
  if (/\bpdf\b|\u6587\u6863\u7248|\u6b63\u5f0f\u6587\u6863|word|docx/.test(normalized)) return 'pdf';
  if (/\u62a5\u8868|\u8868\u683c|\u5bf9\u6bd4\u8868|\u6e05\u5355|\u62a5\u544a/.test(normalized)) return 'table';
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

  if (/(濂剁矇|閰嶆柟|钀ュ吇|鑿屾牚|formula)/.test(text) && /(濂剁矇|閰嶆柟|钀ュ吇|formula)/.test(libraryText)) score += 18;
  if (/(鍚堝悓|鏉℃|浠樻|鍥炴|杩濈害|娉曞姟|contract)/.test(text) && /(鍚堝悓|contract)/.test(libraryText)) score += 18;
  if (/(绠€鍘唡鍊欓€變汉|鎷涜仒|搴旇仒|resume|cv)/.test(text) && /(绠€鍘唡resume|cv|鍊欓€變汉|浜烘墠)/.test(libraryText)) score += 18;
  if (/(璁烘枃|鐮旂┒|瀹為獙|paper|study|trial)/.test(text) && /(璁烘枃|paper|瀛︽湳|research)/.test(libraryText)) score += 16;
  if (/(鎶€鏈瘄鎺ュ彛|閮ㄧ讲|绯荤粺|鏋舵瀯|api|technical|integration)/.test(text) && /(鎶€鏈瘄鎺ュ彛|閮ㄧ讲|api|technical|iot)/.test(libraryText)) score += 16;
  if (/(鎷涙爣|鎶曟爣|鏍囦功|閲囪喘|bids|tender)/.test(text) && /(鎷涙爣|鎶曟爣|鏍囦功|bids|tender)/.test(libraryText)) score += 18;
  if (/(璁㈠崟|搴撳瓨|閿€閲弢骞冲彴|瀹㈣瘔|erp|缁忚惀)/.test(text) && /(璁㈠崟|搴撳瓨|閿€閲弢缁忚惀|erp|鐢靛晢)/.test(libraryText)) score += 18;

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
    .map((item) => `${item.role === 'user' ? '\u7528\u6237' : '\u52a9\u624b'}: ${item.content}`)
    .slice(-5)
    .join('\n');

  return [
    recentTurns ? `\u6700\u8fd1\u5bf9\u8bdd:\n${recentTurns}` : '',
    `\u5f53\u524d\u8865\u5145\u8f93\u5165: ${prompt}`,
    '\u8bf7\u628a\u6700\u8fd1 3 \u5230 5 \u8f6e\u5bf9\u8bdd\u6574\u7406\u6210\u4e00\u6761\u201c\u6309\u77e5\u8bc6\u5e93\u8f93\u51fa\u201d\u7684\u6267\u884c\u9700\u6c42\u3002',
    '\u8981\u6c42:',
    '1. \u53ea\u8fd4\u56de JSON\uff0c\u4e0d\u8981\u89e3\u91ca\uff0c\u4e0d\u8981 Markdown\u3002',
    '2. JSON schema \u4e3a {"request":"...", "outputType":"page|table|pdf|ppt"}\u3002',
    '3. request \u5fc5\u987b\u662f\u4e00\u53e5\u5b8c\u6574\u4e2d\u6587\uff0c\u660e\u786e\u4e3b\u9898\u3001\u8f93\u51fa\u5f62\u5f0f\u548c\u91cd\u70b9\u3002',
    '4. \u5982\u679c\u65e0\u6cd5\u7a33\u5b9a\u5224\u65ad\u8f93\u51fa\u5f62\u5f0f\uff0coutputType \u9ed8\u8ba4\u4f7f\u7528 page\u3002',
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
    || /涔辩爜|鐪嬩笉娓厊鏃犳硶璇嗗埆|鏈兘璇嗗埆|鏃犳硶鍒ゆ柇|閲嶆柊鍙戦€亅璇锋彁渚涘叿浣搢鏃犳硶鎻愬彇鏈夋晥闇€姹倈杈撳叆鍐呭鏃犳硶鎻愬彇|鏃犳晥鏁版嵁/.test(text)
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
    .join('\u3002');

  const source = [recentUserContent, prompt]
    .filter(Boolean)
    .join('\u3002')
    .replace(/\s+/g, ' ')
    .trim();

  const outputKind = detectOutputKind(source) || 'page';
  const outputLabel = outputKind === 'page'
    ? '\u6570\u636e\u53ef\u89c6\u5316\u9759\u6001\u9875'
    : outputKind === 'pdf'
      ? '\u6587\u6863'
      : outputKind === 'ppt'
        ? 'PPT'
        : '\u8868\u683c\u62a5\u8868';

  const request = source
    ? `${source}\uff0c\u8f93\u51fa\u5f62\u5f0f\u4e3a${outputLabel}`
    : `\u8bf7\u57fa\u4e8e\u5f53\u524d\u5bf9\u8bdd\u6574\u7406\u77e5\u8bc6\u5e93\u5185\u5bb9\uff0c\u8f93\u51fa\u5f62\u5f0f\u4e3a${outputLabel}`;

  return {
    request,
    outputType: outputKind,
  };
}

export function buildKnowledgePlanMessage() {
  return '\u6211\u5df2\u7ecf\u6839\u636e\u6700\u8fd1\u51e0\u8f6e\u5bf9\u8bdd\u6574\u7406\u51fa\u4e00\u6761\u6309\u77e5\u8bc6\u5e93\u5904\u7406\u7684\u9700\u6c42\uff0c\u4f60\u53ef\u4ee5\u76f4\u63a5\u7ee7\u7eed\u8865\u5145\u6216\u786e\u8ba4\u3002';
}

export function buildNoPlanMessage() {
  return '\u8fd9\u6b21\u8fd8\u6ca1\u6709\u6574\u7406\u51fa\u7a33\u5b9a\u7684\u77e5\u8bc6\u5e93\u5904\u7406\u9700\u6c42\uff0c\u8bf7\u8865\u5145\u66f4\u660e\u786e\u7684\u76ee\u6807\u540e\u518d\u7ee7\u7eed\u3002';
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
