'use client';

export const CHAT_STORAGE_KEY = 'aidp-home-chat-v1';
export const DEFAULT_UPLOAD_NOTE = '优先解析论文、技术白皮书、需求说明、合同、简历等资料。';

export function createMessageId(prefix = 'msg') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function buildSummaryText(status, fallbackMessage) {
  if (!status?.summary) return fallbackMessage;
  return `${fallbackMessage} 共 ${status.summary.total} 项，成功 ${status.summary.successCount} 项，失败 ${status.summary.failedCount} 项。`;
}

export function buildIngestChatMessage({ title, content, meta, feedback }) {
  return {
    id: createMessageId('ingest'),
    role: 'assistant',
    title,
    content,
    meta,
    ingestFeedback: feedback,
  };
}

export function buildCredentialRequestMessage({ url, credentialRequest }) {
  return {
    id: createMessageId('credential'),
    role: 'assistant',
    title: '登录采集需要安全凭据',
    content: '这个站点需要登录后才能继续采集。请在下方安全表单里填写账号密码，系统会单独提交，不会写进聊天记录。',
    meta: url,
    credentialRequest: {
      url,
      origin: credentialRequest?.origin || '',
      maskedUsername: credentialRequest?.maskedUsername || '',
    },
  };
}

export function patchMessageById(messages, messageId, updater) {
  return messages.map((message) => (message.id === messageId ? updater(message) : message));
}

export function patchMessagesWithIngestItems(messages, refreshedItems, nextMessage) {
  if (!refreshedItems.length) return messages;
  const byId = new Map(refreshedItems.map((item) => [item.id, item]));

  return messages.map((message) => {
    const feedback = message.ingestFeedback;
    if (!feedback?.ingestItems?.some((item) => byId.has(item.id))) return message;

    return {
      ...message,
      ingestFeedback: {
        ...feedback,
        message: nextMessage || feedback.message,
        ingestItems: feedback.ingestItems.map((item) => byId.get(item.id) || item),
      },
    };
  });
}

export function findIngestItem(messages, itemId) {
  for (const message of messages) {
    const found = message.ingestFeedback?.ingestItems?.find((item) => item.id === itemId);
    if (found) return found;
  }
  return null;
}

export function extractFirstUrl(text) {
  const match = text.match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : '';
}

export function parseConversationAction(text) {
  const url = extractFirstUrl(text);
  if (!url) return null;

  const wantsCapture = /(采集|抓取|入库|capture|crawl)/i.test(text);
  const wantsLogin = /(登录|login)/i.test(text);

  if (wantsLogin) {
    return {
      type: 'login_capture',
      url,
      focus: '正文、结构化要点、最新内容',
      note: text,
    };
  }

  if (wantsCapture) {
    return {
      type: 'capture_public',
      url,
      focus: '正文、结构化要点、最新内容',
      note: text,
    };
  }

  return null;
}
