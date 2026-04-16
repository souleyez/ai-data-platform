import type { ChatHistoryItem } from './knowledge-supply-types.js';

export function tokenizeKnowledgeText(text: string) {
  return String(text || '').toLowerCase().match(/[a-z0-9-]{2,}|[\u4e00-\u9fff]{2,}/g) ?? [];
}

function looksLikeOperationalFeedback(text: string) {
  const source = String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!source) return true;

  const noisyTokens = [
    '上传', '采集', '入库', '分组', '保存', '删除', '凭据', '数据源', '运行记录',
    '云端模型暂时不可用', '云端回复暂不可用', '知识库分组更新失败', '已确认分组', '已保存', '已删除', '已取消',
    'upload', 'uploaded successfully', 'ingest', 'saved', 'deleted', 'credential', 'datasource', 'run record',
    'cloud model unavailable', 'cloud reply unavailable', 'group update failed',
  ];

  return noisyTokens.some((token) => source.includes(token)) && source.length <= 120;
}

export function buildKnowledgeChatHistory(chatHistory: ChatHistoryItem[], requestText: string) {
  const cleaned = chatHistory
    .map((item) => ({
      role: item.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: String(item.content || '').trim(),
    }))
    .filter((item) => item.content)
    .filter((item) => !looksLikeOperationalFeedback(item.content));

  if (!cleaned.length) return [];

  const requestTerms = new Set(tokenizeKnowledgeText(requestText));
  const selectedIndexes = new Set(cleaned.map((_, index) => index).slice(-4));
  const relevantIndexes = cleaned
    .map((item, index) => {
      const overlap = tokenizeKnowledgeText(item.content).filter((token) => requestTerms.has(token)).length;
      return { index, overlap, role: item.role };
    })
    .filter((item) => item.overlap > 0)
    .sort((left, right) => {
      if (right.overlap !== left.overlap) return right.overlap - left.overlap;
      if (left.role !== right.role) return left.role === 'user' ? -1 : 1;
      return right.index - left.index;
    })
    .slice(0, 3)
    .map((item) => item.index);

  for (const index of relevantIndexes) {
    selectedIndexes.add(index);
  }

  return Array.from(selectedIndexes)
    .sort((left, right) => left - right)
    .slice(-6)
    .map((index) => cleaned[index]);
}
