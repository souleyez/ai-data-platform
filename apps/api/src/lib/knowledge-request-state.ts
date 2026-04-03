import { detectOutputKind } from './knowledge-plan.js';

export type KnowledgeConversationState = {
  kind: 'knowledge_output';
  libraries: Array<{ key: string; label: string }>;
  timeRange: string;
  contentFocus: string;
  outputType: '' | 'table' | 'page' | 'pdf' | 'ppt' | 'doc' | 'md';
  missingSlot: 'time' | 'content' | 'output';
};

const TIME_RANGE_RULES: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /\u6700\u8fd1\u4e0a\u4f20|\u521a\u4e0a\u4f20|recent upload|latest upload/i, value: '最近上传' },
  { pattern: /\u4eca\u5929|\u4eca\u65e5|today/i, value: '今天' },
  { pattern: /\u6628\u5929|\u6628\u65e5|yesterday/i, value: '昨天' },
  { pattern: /\u672c\u5468|\u8fd9\u5468|\u8fd9\u4e00\u5468|this week/i, value: '本周' },
  { pattern: /\u4e0a\u5468|\u4e0a\u4e00\u5468|last week/i, value: '上周' },
  { pattern: /\u672c\u6708|\u8fd9\u4e2a\u6708|this month/i, value: '本月' },
  { pattern: /\u4e0a\u4e2a\u6708|\u4e0a\u6708|last month/i, value: '上个月' },
  { pattern: /\u6700\u8fd1\u4e00\u5468|\u8fd1\u4e00\u5468|recent week/i, value: '最近一周' },
  { pattern: /\u6700\u8fd1\u4e00\u4e2a\u6708|\u8fd1\u4e00\u4e2a\u6708|recent month|last month/i, value: '最近一个月' },
  { pattern: /\u6700\u8fd1\u4e09\u4e2a\u6708|\u8fd1\u4e09\u4e2a\u6708|recent 3 months|last 3 months/i, value: '最近三个月' },
  { pattern: /\u6700\u8fd1\u534a\u5e74|\u8fd1\u534a\u5e74|recent 6 months|last 6 months/i, value: '最近半年' },
  { pattern: /\u6700\u8fd1\u4e00\u5e74|\u8fd1\u4e00\u5e74|recent year|last year/i, value: '最近一年' },
  { pattern: /\u672c\u5b63\u5ea6|\u8fd9\u4e2a\u5b63\u5ea6|this quarter/i, value: '本季度' },
  { pattern: /\u5168\u90e8\u65f6\u95f4|\u5168\u65f6\u95f4|\u6240\u6709\u65f6\u95f4|\u5168\u91cf|\u5168\u90e8|all time|all-time|full range/i, value: '全部时间' },
];

function normalizeText(text: string) {
  return String(text || '').trim();
}

export function parseKnowledgeConversationState(value: unknown): KnowledgeConversationState | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (raw.kind !== 'knowledge_output') return null;

  const outputType = String(raw.outputType || '').trim();
  const missingSlot = String(raw.missingSlot || '').trim();
  if (!['', 'table', 'page', 'pdf', 'ppt', 'doc', 'md'].includes(outputType)) return null;
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
  if (outputType === 'md') return 'Markdown 文档';
  if (outputType === 'pdf') return '文档';
  if (outputType === 'doc') return 'Word 文档';
  return '表格';
}

function extractOutputType(text: string): KnowledgeConversationState['outputType'] {
  const detected = detectOutputKind(text || '');
  if (detected) return detected;
  const source = String(text || '').trim();
  if (/markdown|\bmd\b/i.test(source)) return 'md';
  return /\u6587\u6863|\u6b63\u6587\u6587\u6863|\u6b63\u5f0f\u6587\u6863|word|docx?/i.test(source) ? 'doc' : '';
}

function extractLooseTimeRange(text: string) {
  const source = normalizeText(text);
  for (const rule of TIME_RANGE_RULES) {
    if (rule.pattern.test(source)) return rule.value;
  }
  return '';
}

export function extractNormalizedTimeRange(text: string) {
  return extractLooseTimeRange(text);
}

function stripControlWords(text: string) {
  return String(text || '')
    .replace(/\u8bf7|\u8bf7\u4f60|\u5e2e\u6211|\u9ebb\u70e6|\u60f3\u8981|\u9700\u8981|\u5e0c\u671b|\u5e2e\u5fd9|\u57fa\u4e8e|\u6839\u636e|\u6309\u7167|\u56f4\u7ed5|\u805a\u7126|\u9488\u5bf9|\u4f18\u5148/gi, ' ')
    .replace(/\u77e5\u8bc6\u5e93|\u6587\u6863\u5e93|\u8d44\u6599\u5e93|\u5e93\u5185|\u6700\u8fd1\u4e0a\u4f20|\u521a\u4e0a\u4f20|\u8fd9\u4efd\u6587\u6863|\u8fd9\u4e2a\u6587\u4ef6|\u8fd9\u4e9b\u6750\u6599|\u8fd9\u6279\u6750\u6599|\u8fd9\u6279\u6587\u6863/gi, ' ')
    .replace(/\u8f93\u51fa|\u751f\u6210|\u505a\u6210|\u505a\u4e00\u4efd|\u505a\u4e2a|\u6574\u7406|\u6c47\u603b|\u5bfc\u51fa|\u5f62\u6210|\u4ea7\u51fa/gi, ' ')
    .replace(/\u62a5\u8868|\u8868\u683c|\u5bf9\u6bd4\u8868|\u9759\u6001\u9875|\u6570\u636e\u53ef\u89c6\u5316\u9759\u6001\u9875|ppt|pdf|markdown|\bmd\b|word|docx?|\u6587\u6863/gi, ' ')
    .replace(/\u4eca\u5929|\u4eca\u65e5|\u6628\u5929|\u6628\u65e5|\u672c\u5468|\u8fd9\u5468|\u8fd9\u4e00\u5468|\u4e0a\u5468|\u4e0a\u4e00\u5468|\u672c\u6708|\u8fd9\u4e2a\u6708|\u4e0a\u4e2a\u6708|\u4e0a\u6708|\u6700\u8fd1\u4e00\u5468|\u8fd1\u4e00\u5468|\u6700\u8fd1\u4e00\u4e2a\u6708|\u8fd1\u4e00\u4e2a\u6708|\u6700\u8fd1\u4e09\u4e2a\u6708|\u8fd1\u4e09\u4e2a\u6708|\u6700\u8fd1\u534a\u5e74|\u8fd1\u534a\u5e74|\u6700\u8fd1\u4e00\u5e74|\u8fd1\u4e00\u5e74|\u672c\u5b63\u5ea6|\u5168\u90e8\u65f6\u95f4|\u5168\u65f6\u95f4|\u6240\u6709\u65f6\u95f4|\u5168\u91cf|\u5168\u90e8|all time|all-time|full range/gi, ' ')
    .replace(/[，。；;,.!?！？()（）【】[\]<>《》“”"'‘’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractLooseContentFocus(text: string) {
  return stripControlWords(text);
}

export function extractNormalizedContentFocus(text: string) {
  const source = normalizeText(text);
  if (!source) return '';

  const cleaned = stripControlWords(source);
  if (cleaned) return cleaned;

  const fallbackParts = [
    ...source.matchAll(/按(.{2,24}?)维度/g),
    ...source.matchAll(/提取(.{2,40}?)(?:，|。|并且|并按|按.*输出|$)/g),
    ...source.matchAll(/整理(.{2,40}?)(?:，|。|并且|并按|按.*输出|$)/g),
    ...source.matchAll(/汇总(.{2,40}?)(?:，|。|并且|并按|按.*输出|$)/g),
    ...source.matchAll(/分析(.{2,40}?)(?:，|。|并且|并按|按.*输出|$)/g),
  ]
    .map((match) => String(match[1] || '').trim())
    .filter(Boolean);

  return [...new Set(fallbackParts)].join(' ').trim() || extractLooseContentFocus(source);
}

export function extractExplicitKnowledgeFocus(text: string) {
  const source = normalizeText(text);
  if (!source) return '';

  if (/公司/.test(source) && /(项目|IT|系统|平台|接口|技术|开发|实施)/i.test(source)) {
    return '公司维度 IT 项目信息';
  }

  const captures = [
    ...source.matchAll(/按(.{2,24}?)维度/g),
    ...source.matchAll(/((?:IT|技术)?项目.{0,24}?信息)/gi),
    ...source.matchAll(/(公司.{0,24}?项目.{0,24}?信息)/g),
    ...source.matchAll(/(简历.{0,24}?项目.{0,24}?信息)/g),
    ...source.matchAll(/(涉及公司.{0,24}?项目.{0,24}?信息)/g),
  ]
    .map((match) => String(match[1] || '').trim())
    .filter(Boolean);

  if (captures.length) {
    return [...new Set(captures)].join(' ');
  }

  return '';
}

function isLikelySlotOnlyReply(text: string) {
  const source = normalizeText(text);
  if (!source) return false;
  if (Boolean(extractNormalizedTimeRange(source))) return true;
  if (Boolean(extractOutputType(source))) return true;
  return source.length <= 24;
}

function mergeContentFocus(previousFocus: string, prompt: string) {
  const currentFocus = extractNormalizedContentFocus(prompt);
  if (previousFocus && currentFocus) {
    if (previousFocus.includes(currentFocus)) return previousFocus;
    if (currentFocus.includes(previousFocus)) return currentFocus;
    return `${previousFocus} ${currentFocus}`.trim();
  }
  return currentFocus || previousFocus || '';
}

function getMissingSlot(state: Omit<KnowledgeConversationState, 'kind' | 'missingSlot'>) {
  if (!state.timeRange) return 'time' as const;
  if (!state.contentFocus) return 'content' as const;
  if (!state.outputType) return 'output' as const;
  return null;
}

export function buildMissingKnowledgeSlotMessage(state: KnowledgeConversationState) {
  if (state.missingSlot === 'time') {
    return '要按库内内容处理，还缺时间范围。请补充例如最近上传、本周、最近一个月、全部时间这类时间约束。';
  }
  if (state.missingSlot === 'content') {
    return '要按库内内容处理，还缺内容范围。请说明要基于哪个知识库或哪批文档，以及重点看什么内容。';
  }
  return '要按库内内容处理，还缺输出形式。请说明要表格、数据可视化静态页、PPT 还是文档。';
}

export function buildKnowledgeRequest(state: KnowledgeConversationState) {
  const libraryLabel = state.libraries.length
    ? state.libraries.map((item) => item.label || item.key).join('、')
    : '相关知识库';
  const timeText = state.timeRange || '最近上传';
  const focusText = state.contentFocus || '相关内容';
  return `请基于 ${libraryLabel} 中 ${timeText} 范围内的材料，围绕 ${focusText}，输出一份${mapOutputTypeLabel(state.outputType)}。`;
}

export function mergeKnowledgeConversationState(
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
  const mergedFocus = slotOnlyReply ? base.contentFocus : mergeContentFocus(base.contentFocus, prompt);
  const next = {
    ...base,
    libraries: libraries.length ? libraries : base.libraries,
    timeRange: base.timeRange || extractNormalizedTimeRange(prompt),
    contentFocus: mergedFocus || extractExplicitKnowledgeFocus(prompt),
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
