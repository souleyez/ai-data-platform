type KnowledgeLibrary = { key: string; label: string };

const OUTPUT_REQUEST_PATTERNS =
  /(输出|生成|整理|汇总|做成|做一份|做个|导出|形成|产出|对比表|报表|表格|静态页|数据可视化|PPT|PDF|正式文档|导出文档|word|docx)/i;
const KNOWLEDGE_SCOPE_PATTERNS =
  /(知识库|库内|文档库|资料库|最近上传|刚上传|这份文档|这个文件|这些材料|这批材料|这批文档|简历库|标书库|订单分析)/i;
const DETAIL_QUESTION_PATTERNS =
  /(细节|详细|具体|条款|参数|内容|依据|原文|证据|章节|接口|字段|学历|公司|日期|金额|结论)/;
const DENY_KNOWLEDGE_PATTERNS =
  /(不要按库|不用查知识库|不用按文档|直接回答|普通回答就行|不要按知识库|不用查库|不用按库|不用按材料|别查知识库|别按文档)/;
const CANCEL_PATTERNS = /^(不用了|算了|取消|先不做了|先不用|不用输出了)$/;

export function explicitlyRejectsKnowledgeMode(prompt: string) {
  return DENY_KNOWLEDGE_PATTERNS.test(String(prompt || '').trim());
}

export function isKnowledgeCancelPhrase(prompt: string) {
  return CANCEL_PATTERNS.test(String(prompt || '').trim());
}

export function looksLikeKnowledgeOutputIntent(input: {
  prompt: string;
  libraries: KnowledgeLibrary[];
  hasDocumentDetailFollowup?: boolean;
}) {
  const text = String(input.prompt || '').trim();
  if (!text) return false;
  if (!OUTPUT_REQUEST_PATTERNS.test(text)) return false;
  return KNOWLEDGE_SCOPE_PATTERNS.test(text) || input.libraries.length > 0 || Boolean(input.hasDocumentDetailFollowup);
}

export function looksLikeKnowledgeAnswerIntent(input: {
  prompt: string;
  libraries: KnowledgeLibrary[];
  hasDocumentDetailFollowup?: boolean;
}) {
  const text = String(input.prompt || '').trim();
  if (!text) return false;
  if (looksLikeKnowledgeOutputIntent(input)) return false;
  if (input.hasDocumentDetailFollowup) return false;
  const asksForDetail = DETAIL_QUESTION_PATTERNS.test(text);
  return asksForDetail && (KNOWLEDGE_SCOPE_PATTERNS.test(text) || input.libraries.length > 0);
}
