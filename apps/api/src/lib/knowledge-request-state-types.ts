export type KnowledgeConversationState = {
  kind: 'knowledge_output';
  libraries: Array<{ key: string; label: string }>;
  timeRange: string;
  contentFocus: string;
  outputType: '' | 'table' | 'page' | 'pdf' | 'ppt' | 'doc' | 'md';
  missingSlot: 'time' | 'content' | 'output';
};

export type GeneralKnowledgeConversationState = {
  kind: 'general';
  preferredDocumentPath: string;
  expiresAt: string;
};
