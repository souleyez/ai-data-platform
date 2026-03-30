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
