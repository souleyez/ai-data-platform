'use client';

export const CHAT_HISTORY_STORAGE_KEY = 'aidp_home_chat_history_v1';
const MAX_STORED_MESSAGES = 30;
const MAX_HISTORY_ITEMS = 8;
const FAILURE_PATTERNS = [/失败/, /异常/, /不可用/, /错误/, /超时/, /未完成/, /failed/i, /error/i, /unavailable/i, /timeout/i];

function createMemoryId(prefix = 'memory') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function splitText(value) {
  return String(value || '')
    .split(/\r?\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function summarizeCredentialRequestMessage(message) {
  const request = message?.credentialRequest;
  if (!request) return '';

  const title = String(message?.title || '系统提示').trim();
  const content = String(message?.content || '').trim();
  const meta = String(message?.meta || request?.url || '').trim();
  return [title, content, meta ? `相关站点：${meta}` : '']
    .filter(Boolean)
    .join('。')
    .trim();
}

export function getMessageMemoryContent(message) {
  if (!message) return '';

  const explicitMemory = String(message?.memoryContent || '').trim();
  if (explicitMemory) return explicitMemory;

  if (message?.ingestFeedback) {
    return '';
  }

  if (message?.credentialRequest) {
    return summarizeCredentialRequestMessage(message);
  }

  return splitText(message?.content).join('\n');
}

function normalizeStoredMessages(raw) {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item, index) => {
      const content = String(item?.content || '').trim();
      const memoryContent = String(item?.memoryContent || content).trim();
      return {
        id: String(item?.id || `history-${index}`),
        role: item?.role === 'user' ? 'user' : 'assistant',
        title: typeof item?.title === 'string' ? item.title : '',
        content,
        memoryContent,
        meta: typeof item?.meta === 'string' ? item.meta : '',
        table: item?.table && typeof item.table === 'object' ? item.table : null,
        messageType: typeof item?.messageType === 'string' ? item.messageType : '',
      };
    })
    .filter((item) => Boolean(item.content || item.memoryContent));
}

export function isFailureFeedbackMessage(message) {
  if (!message || message.role !== 'assistant') return false;
  if (String(message?.messageType || '').trim() === 'system_failure') return true;

  const title = String(message?.title || '').trim();
  const content = String(message?.content || '').trim();
  const memoryContent = String(message?.memoryContent || '').trim();
  const meta = String(message?.meta || '').trim();
  const combined = [title, content, memoryContent, meta].filter(Boolean).join('\n');

  return FAILURE_PATTERNS.some((pattern) => pattern.test(combined));
}

export function compactFailureFeedbackMessages(messages) {
  const source = Array.isArray(messages) ? messages : [];
  let latestFailureIndex = -1;

  source.forEach((item, index) => {
    if (isFailureFeedbackMessage(item)) latestFailureIndex = index;
  });

  if (latestFailureIndex < 0) return source;

  return source.filter((item, index) => !isFailureFeedbackMessage(item) || index === latestFailureIndex);
}

export function appendChatMessageKeepingLatestFailure(messages, nextMessage) {
  return compactFailureFeedbackMessages([...(Array.isArray(messages) ? messages : []), nextMessage]);
}

export function loadStoredChatMessages(fallbackMessages = []) {
  if (typeof window === 'undefined') return fallbackMessages;

  try {
    const raw = window.localStorage.getItem(CHAT_HISTORY_STORAGE_KEY);
    if (!raw) return fallbackMessages;
    const normalized = normalizeStoredMessages(JSON.parse(raw));
    const compacted = compactFailureFeedbackMessages(normalized);
    return compacted.length ? compacted : fallbackMessages;
  } catch {
    return fallbackMessages;
  }
}

export function serializeChatMessages(messages, limit = MAX_STORED_MESSAGES) {
  return compactFailureFeedbackMessages(Array.isArray(messages) ? messages : [])
    .filter((item) => item?.role === 'user' || item?.role === 'assistant')
    .map((item, index) => {
      const content = String(item?.content || '').trim();
      const memoryContent = getMessageMemoryContent(item);
      if (!memoryContent) return null;

      return {
        id: String(item?.id || `history-${index}`),
        role: item?.role === 'user' ? 'user' : 'assistant',
        title: typeof item?.title === 'string' ? item.title : '',
        content: content || memoryContent,
        memoryContent,
        meta: typeof item?.meta === 'string' ? item.meta : '',
        table: item?.table && typeof item.table === 'object' ? item.table : null,
        messageType: typeof item?.messageType === 'string' ? item.messageType : '',
      };
    })
    .filter(Boolean)
    .slice(-limit);
}

export function persistChatMessages(messages) {
  if (typeof window === 'undefined') return;

  try {
    const serialized = serializeChatMessages(messages);
    window.localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(serialized));
  } catch {
    // Ignore local persistence failures.
  }
}

export function clearStoredChatMessages() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CHAT_HISTORY_STORAGE_KEY);
  } catch {
    // Ignore local persistence failures.
  }
}

export function buildRecentChatHistory(messages, limit = MAX_HISTORY_ITEMS) {
  return serializeChatMessages(messages, limit)
    .map((item) => ({
      role: item.role,
      content: item.memoryContent || item.content,
    }))
    .filter((item) => Boolean(String(item.content || '').trim()))
    .slice(-limit);
}

export function appendSystemMemoryEntry({ title = '', content = '', meta = '', memoryContent = '', messageType = '' }) {
  if (typeof window === 'undefined') return;

  const normalizedContent = String(content || memoryContent || '').trim();
  const normalizedMemory = String(memoryContent || normalizedContent).trim();
  if (!normalizedMemory) return;

  const nextMessage = {
    id: createMemoryId('system'),
    role: 'assistant',
    title: String(title || '').trim(),
    content: normalizedContent || normalizedMemory,
    memoryContent: normalizedMemory,
    meta: String(meta || '').trim(),
    messageType: String(messageType || '').trim(),
  };

  const current = loadStoredChatMessages([]);
  persistChatMessages(appendChatMessageKeepingLatestFailure(current, nextMessage));
}
