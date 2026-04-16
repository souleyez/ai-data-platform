import type {
  ChatBackgroundJob,
  ChatBackgroundJobRequest,
  ChatBackgroundJobState,
} from './chat-background-jobs-types.js';
import type { ResolvedChannelAccess } from './channel-access-resolver.js';

export function buildChatBackgroundJobId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeChatBackgroundText(value: unknown) {
  return String(value || '').trim();
}

export function normalizeBackgroundLibraries(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      key: normalizeChatBackgroundText((item as { key?: unknown } | null)?.key),
      label: normalizeChatBackgroundText((item as { label?: unknown } | null)?.label),
    }))
    .filter((item) => item.key || item.label);
}

export function normalizeBackgroundChatHistory(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      role: (item as { role?: unknown } | null)?.role === 'assistant' ? 'assistant' as const : 'user' as const,
      content: normalizeChatBackgroundText((item as { content?: unknown } | null)?.content),
    }))
    .filter((item) => item.content)
    .slice(-12);
}

export function normalizeBackgroundJobRequest(value: unknown): ChatBackgroundJobRequest {
  const record = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  return {
    prompt: normalizeChatBackgroundText(record.prompt),
    sessionUser: normalizeChatBackgroundText(record.sessionUser) || undefined,
    chatHistory: normalizeBackgroundChatHistory(record.chatHistory),
    mode: record.mode === 'knowledge_output' ? 'knowledge_output' : 'general',
    conversationState: (record.conversationState && typeof record.conversationState === 'object')
      ? record.conversationState
      : null,
    systemConstraints: normalizeChatBackgroundText(record.systemConstraints) || undefined,
    botId: normalizeChatBackgroundText(record.botId) || undefined,
    effectiveVisibleLibraryKeys: Array.isArray(record.effectiveVisibleLibraryKeys)
      ? record.effectiveVisibleLibraryKeys.map((item) => normalizeChatBackgroundText(item)).filter(Boolean)
      : [],
    accessContext: (record.accessContext && typeof record.accessContext === 'object') ? record.accessContext as ResolvedChannelAccess : null,
    confirmedAction: ['template_output', 'dataset_static_page'].includes(normalizeChatBackgroundText(record.confirmedAction))
      ? 'dataset_static_page'
      : 'openclaw_action',
  };
}

export function normalizeBackgroundJob(value: unknown): ChatBackgroundJob | null {
  const record = typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
  if (!record) return null;
  const id = normalizeChatBackgroundText(record.id);
  const reportOutputId = normalizeChatBackgroundText(record.reportOutputId);
  const request = normalizeBackgroundJobRequest(record.request);
  if (!id || !reportOutputId || !request.prompt) return null;
  const status = normalizeChatBackgroundText(record.status);
  return {
    id,
    reportOutputId,
    status: status === 'running' || status === 'succeeded' || status === 'failed' ? status : 'queued',
    attemptCount: Math.max(0, Math.floor(Number(record.attemptCount || 0))),
    prompt: request.prompt,
    promptPreview: normalizeChatBackgroundText(record.promptPreview) || request.prompt.slice(0, 120),
    request,
    libraries: normalizeBackgroundLibraries(record.libraries),
    latestDocumentPath: normalizeChatBackgroundText(record.latestDocumentPath),
    createdAt: normalizeChatBackgroundText(record.createdAt) || new Date().toISOString(),
    startedAt: normalizeChatBackgroundText(record.startedAt),
    finishedAt: normalizeChatBackgroundText(record.finishedAt),
    error: normalizeChatBackgroundText(record.error),
  };
}

export function summarizeBackgroundPrompt(prompt: string) {
  const normalized = normalizeChatBackgroundText(prompt).replace(/\s+/g, ' ');
  if (!normalized) return '后台生成内容';
  return normalized.length > 48 ? `${normalized.slice(0, 48)}...` : normalized;
}

export function joinConstraintBlocks(blocks: Array<string | undefined>) {
  return blocks
    .map((item) => normalizeChatBackgroundText(item))
    .filter(Boolean)
    .join('\n');
}

export function buildBackgroundReportTitle(prompt: string, latestDocumentTitle?: string) {
  const docTitle = normalizeChatBackgroundText(latestDocumentTitle);
  if (docTitle) return `${docTitle} 后台生成`;
  return `${summarizeBackgroundPrompt(prompt)} 后台生成`;
}

export function buildProcessingContent(prompt: string) {
  return [
    '该内容超过同步窗口，已转入报表中心后台继续生成。',
    '',
    `原始请求：${summarizeBackgroundPrompt(prompt)}`,
    '状态：处理中',
  ].join('\n');
}

export function buildBackgroundContinuationSystemConstraints(systemConstraints?: string) {
  return joinConstraintBlocks([
    systemConstraints,
    [
      '当前输出将直接存入报表中心的 Markdown 报表。',
      '不要描述你的执行过程、搜索过程、读取过程、思考过程或工具调用过程。',
      '不要说“让我先”“我已经”“下面我来”“接下来我会”。',
      '不要声称已经把结果写入某个本地文件、工作区路径或外部路径。',
      '不要输出文件保存路径、命令行、内部目录、workspace 路径、/home 路径。',
      '直接输出最终可交付内容本身，允许使用 Markdown 标题、列表、表格。',
      '结尾不要反问用户，不要加“是否需要我继续”之类的话。',
    ].join('\n'),
  ]);
}

export function sanitizeBackgroundMarkdownContent(content: string) {
  const normalized = String(content || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return '';

  const paragraphs = normalized.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);
  const isProcessParagraph = (paragraph: string) => (
    /^(让我先|我先|现在让我|下面我来|接下来我会|我已经|现在我已经|我来先获取)/u.test(paragraph)
    || /(?:工具|搜索|读取|获取).*(?:招标文件|文档|资料)/u.test(paragraph)
    || /已保存至/u.test(paragraph)
    || /(?:\/home\/|\.openclaw\/workspace|workspace\/|[A-Z]:\\)/.test(paragraph)
  );

  let start = 0;
  while (start < paragraphs.length && isProcessParagraph(paragraphs[start])) {
    start += 1;
  }

  let end = paragraphs.length;
  while (end > start && (/^(是否需要我|如需我|如果你需要我继续)/u.test(paragraphs[end - 1]) || isProcessParagraph(paragraphs[end - 1]))) {
    end -= 1;
  }

  const kept = paragraphs
    .slice(start, end)
    .filter((paragraph) => !/已保存至/u.test(paragraph))
    .filter((paragraph) => !/(?:\/home\/|\.openclaw\/workspace|workspace\/|[A-Z]:\\)/.test(paragraph));

  return kept.join('\n\n').trim();
}

export function summarizeBackgroundError(error: unknown) {
  if (error instanceof Error) return error.message || error.name || 'unknown-error';
  return String(error || 'unknown-error');
}

export function isChatTimeoutBackgroundCandidate(error: unknown) {
  const message = summarizeBackgroundError(error).toLowerCase();
  return message.includes('timed out after');
}

export function isRetryableBackgroundExecutionError(error: unknown) {
  return isChatTimeoutBackgroundCandidate(error);
}

export function getBackgroundJobMaxAttempts() {
  const parsed = Number(process.env.CHAT_BACKGROUND_JOB_MAX_ATTEMPTS || '2');
  if (!Number.isFinite(parsed) || parsed < 1) return 2;
  return Math.floor(parsed);
}

export function patchBackgroundJobInState(
  state: ChatBackgroundJobState,
  jobId: string,
  patch: Partial<ChatBackgroundJob>,
) {
  const index = state.items.findIndex((item) => item.id === jobId);
  if (index < 0) return null;
  const nextJob: ChatBackgroundJob = {
    ...state.items[index],
    ...patch,
  };
  state.items[index] = nextJob;
  return nextJob;
}
