import type {
  GeneralKnowledgeConversationState,
  KnowledgeConversationState,
} from './knowledge-request-state-types.js';
import {
  buildKnowledgeOutputRequestText,
  extractExplicitKnowledgeFocus,
  extractNormalizedContentFocus,
  extractNormalizedTimeRange,
  extractOutputTypeFromPrompt,
  isLikelySlotOnlyReply,
  mergeContentFocus,
} from './knowledge-request-state-extraction.js';
import {
  buildGeneralKnowledgeConversationState,
  parseGeneralKnowledgeConversationState,
  parseKnowledgeConversationState,
} from './knowledge-request-state-general.js';

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
  return buildKnowledgeOutputRequestText({
    libraries: state.libraries,
    timeRange: state.timeRange,
    contentFocus: state.contentFocus,
    outputType: state.outputType,
  });
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
    outputType: base.outputType || extractOutputTypeFromPrompt(prompt),
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

export type {
  GeneralKnowledgeConversationState,
  KnowledgeConversationState,
};

export {
  buildGeneralKnowledgeConversationState,
  extractExplicitKnowledgeFocus,
  extractNormalizedContentFocus,
  extractNormalizedTimeRange,
  parseGeneralKnowledgeConversationState,
  parseKnowledgeConversationState,
};
