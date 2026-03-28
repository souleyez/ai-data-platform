import { detectOutputKind } from './knowledge-plan.js';

export type KnowledgeConversationState = {
  kind: 'knowledge_output';
  libraries: Array<{ key: string; label: string }>;
  timeRange: string;
  contentFocus: string;
  outputType: '' | 'table' | 'page' | 'pdf' | 'ppt';
  missingSlot: 'time' | 'content' | 'output';
};

export function parseKnowledgeConversationState(value: unknown): KnowledgeConversationState | null {
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

function extractLooseTimeRange(text: string) {
  const source = String(text || '').trim();
  const patterns = [
    /最近上传/,
    /刚上传/,
    /今天|今日/,
    /昨日|昨天/,
    /本周|这周|这一周/,
    /上周|上一周/,
    /本月|这个月/,
    /上个月|上月/,
    /最近一周|近一周/,
    /最近一个月|近一个月/,
    /最近三个月|近三个月/,
    /最近半年|近半年/,
    /最近一年|近一年/,
    /本季度|这个季度/,
    /全部时间|全时间|所有时间|全量|全部/,
    /all time|all-time|full range/i,
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[0]) return match[0];
  }
  return '';
}

export function extractNormalizedTimeRange(text: string) {
  const source = String(text || '').trim();
  if (!source) return '';

  const explicitPatterns = [
    /最近上传|刚上传/i,
    /今天|今日/i,
    /昨日|昨天/i,
    /本周|这周|这一周/i,
    /上周|上一周/i,
    /本月|这个月/i,
    /上个月|上月/i,
    /最近一周|近一周/i,
    /最近一个月|近一个月/i,
    /最近三个月|近三个月/i,
    /最近半年|近半年/i,
    /最近一年|近一年/i,
    /本季度|这个季度/i,
    /全部时间|全时间|所有时间|全量|全部/i,
    /all time|all-time|full range/i,
  ];

  for (const pattern of explicitPatterns) {
    const match = source.match(pattern);
    if (match?.[0]) return match[0];
  }

  return extractLooseTimeRange(source);
}

function extractLooseContentFocus(text: string) {
  return String(text || '')
    .replace(/请|请你|帮我|麻烦|想要|需要|希望|帮忙|基于|根据|按照|围绕|聚焦|针对|优先/gi, ' ')
    .replace(/知识库|文档库|资料库|库内|最近上传|刚上传|这份文档|这个文件|这些材料|这批材料|这批文档/g, ' ')
    .replace(/输出|生成|整理|汇总|做成|做一份|做个|导出|形成|产出/g, ' ')
    .replace(/报表|表格|对比表|静态页|数据可视化静态页|PPT|PDF|文档/g, ' ')
    .replace(/今天|昨日|昨天|本周|上周|本月|上个月|最近上传|最近一周|最近一个月|最近三个月|近一周|近一个月|近三个月|最近半年|近半年|最近一年|近一年|本季度|全部时间|全时间|所有时间|全量|全部/gi, ' ')
    .replace(/[，。；;,.!?！？]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractNormalizedContentFocus(text: string) {
  const source = String(text || '').trim();
  if (!source) return '';

  const cleaned = source
    .replace(/请|请你|帮我|麻烦|想要|需要|希望|帮忙|基于|根据|按照|围绕|聚焦|针对|优先/gi, ' ')
    .replace(/知识库|库内|文档库|资料库|最近上传|刚上传|这份文档|这个文件|这些材料|这批材料|这批文档/gi, ' ')
    .replace(/输出|生成|做成|做一份|做个|整理成|导出|形成|产出/gi, ' ')
    .replace(/报表|表格|对比表|静态页|数据可视化静态页|ppt|pdf|文档/gi, ' ')
    .replace(/今天|今日|昨天|昨日|本周|这周|这一周|上周|上一周|本月|这个月|上个月|上月|最近一周|近一周|最近一个月|近一个月|最近三个月|近三个月|最近半年|近半年|最近一年|近一年|本季度|这个季度|全部时间|全时间|所有时间|全量|全部|all time|all-time|full range/gi, ' ')
    .replace(/[，。；;：:.!?！？()（）【】\[\]<>《》"'“”‘’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned) return cleaned;

  const fallbackParts = [
    ...source.matchAll(/按(.{2,24}?)维度/g),
    ...source.matchAll(/提取(.{2,40}?)(?:，|。|并|并且|并按|按|输出|$)/g),
    ...source.matchAll(/整理(.{2,40}?)(?:，|。|并|并且|并按|按|输出|$)/g),
    ...source.matchAll(/汇总(.{2,40}?)(?:，|。|并|并且|并按|按|输出|$)/g),
    ...source.matchAll(/分析(.{2,40}?)(?:，|。|并|并且|并按|按|输出|$)/g),
  ]
    .map((match) => String(match[1] || '').trim())
    .filter(Boolean);

  return [...new Set(fallbackParts)].join(' ').trim() || extractLooseContentFocus(source);
}

export function extractExplicitKnowledgeFocus(text: string) {
  const source = String(text || '').trim();
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
  const source = String(text || '').trim();
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
    return '要按库内内容输出，还缺时间范围。请补充例如最近上传、本周、最近一个月这类时间范围。';
  }
  if (state.missingSlot === 'content') {
    return '要按库内内容输出，还缺内容范围。请说明要基于哪个知识库或哪批文档，以及重点看什么内容。';
  }
  return '要按库内内容输出，还缺输出形式。请说明要表格、数据可视化静态页、PPT 还是文档。';
}

export function buildKnowledgeRequest(state: KnowledgeConversationState) {
  const libraryLabel = state.libraries.length
    ? state.libraries.map((item) => item.label || item.key).join('、')
    : '相关知识库';
  const timeText = state.timeRange || '最近上传';
  const focusText = state.contentFocus || '相关内容';
  return `请基于 ${libraryLabel} 中 ${timeText} 范围内的材料，围绕 ${focusText}，输出一份 ${mapOutputTypeLabel(state.outputType)}。`;
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
