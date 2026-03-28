type KnowledgeLibrary = { key: string; label: string };

const OUTPUT_REQUEST_PATTERNS = [
  /\u8f93\u51fa|\u751f\u6210|\u6574\u7406|\u6c47\u603b|\u505a\u6210|\u505a\u4e00\u4efd|\u505a\u4e2a|\u5bfc\u51fa|\u5f62\u6210|\u4ea7\u51fa/i,
  /\u62a5\u8868|\u8868\u683c|\u5bf9\u6bd4\u8868|\u9759\u6001\u9875|\u6570\u636e\u53ef\u89c6\u5316\u9759\u6001\u9875|ppt|pdf|\u6b63\u5f0f\u6587\u6863|word|docx/i,
];

const KNOWLEDGE_SCOPE_PATTERNS = [
  /\u77e5\u8bc6\u5e93|\u5e93\u5185|\u6587\u6863\u5e93|\u8d44\u6599\u5e93/i,
  /\u6700\u8fd1\u4e0a\u4f20|\u521a\u4e0a\u4f20|\u8fd9\u4efd\u6587\u6863|\u8fd9\u4e2a\u6587\u4ef6|\u8fd9\u4e9b\u6750\u6599|\u8fd9\u6279\u6750\u6599|\u8fd9\u6279\u6587\u6863/i,
  /\u7b80\u5386\u5e93|\u4eba\u624d\u7b80\u5386|\u6807\u4e66\u5e93|\u8ba2\u5355\u5206\u6790/i,
];

const DETAIL_QUESTION_PATTERNS =
  /\u7ec6\u8282|\u8be6\u7ec6|\u5177\u4f53|\u6761\u6b3e|\u53c2\u6570|\u5185\u5bb9|\u4f9d\u636e|\u539f\u6587|\u8bc1\u636e|\u7ae0\u8282|\u63a5\u53e3|\u5b57\u6bb5|\u5b66\u5386|\u516c\u53f8|\u65e5\u671f|\u91d1\u989d|\u7ed3\u8bba/;

const DENY_KNOWLEDGE_PATTERNS = [
  /\u4e0d\u8981\u6309\u5e93/i,
  /\u4e0d\u7528\u67e5\u77e5\u8bc6\u5e93/i,
  /\u4e0d\u7528\u6309\u6587\u6863/i,
  /\u76f4\u63a5\u56de\u7b54/i,
  /\u666e\u901a\u56de\u7b54\u5c31\u884c/i,
  /\u4e0d\u8981\u6309\u77e5\u8bc6\u5e93/i,
  /\u4e0d\u7528\u67e5\u5e93/i,
  /\u4e0d\u7528\u6309\u6750\u6599/i,
  /\u522b\u67e5\u77e5\u8bc6\u5e93/i,
  /\u522b\u6309\u6587\u6863/i,
];

const CANCEL_PATTERNS = [
  /^\u4e0d\u7528\u4e86$/,
  /^\u7b97\u4e86$/,
  /^\u53d6\u6d88$/,
  /^\u5148\u4e0d\u505a\u4e86$/,
  /^\u5148\u4e0d\u7528$/,
  /^\u4e0d\u7528\u8f93\u51fa\u4e86$/,
];

function matchesAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

export function explicitlyRejectsKnowledgeMode(prompt: string) {
  const text = String(prompt || '').trim();
  if (!text) return false;
  return matchesAny(text, DENY_KNOWLEDGE_PATTERNS);
}

export function isKnowledgeCancelPhrase(prompt: string) {
  const text = String(prompt || '').trim();
  if (!text) return false;
  return matchesAny(text, CANCEL_PATTERNS);
}

export function looksLikeKnowledgeOutputIntent(input: {
  prompt: string;
  libraries: KnowledgeLibrary[];
  hasDocumentDetailFollowup?: boolean;
}) {
  const text = String(input.prompt || '').trim();
  if (!text) return false;
  if (!matchesAny(text, OUTPUT_REQUEST_PATTERNS)) return false;

  return (
    matchesAny(text, KNOWLEDGE_SCOPE_PATTERNS)
    || input.libraries.length > 0
    || Boolean(input.hasDocumentDetailFollowup)
  );
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
  return asksForDetail && (matchesAny(text, KNOWLEDGE_SCOPE_PATTERNS) || input.libraries.length > 0);
}
