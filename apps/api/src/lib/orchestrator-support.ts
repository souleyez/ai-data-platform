import type { KnowledgePlan } from './knowledge-plan.js';
import type { ChatOutput } from './knowledge-output.js';
import type { ChatHistoryItem, ChatRequestInput } from './orchestrator-types.js';

export function normalizeHistory(chatHistory?: ChatHistoryItem[]) {
  if (!Array.isArray(chatHistory)) return [];
  return chatHistory
    .filter((item): item is ChatHistoryItem => item?.role === 'user' || item?.role === 'assistant')
    .map((item) => ({
      role: item.role,
      content: String(item.content || '').trim(),
    }))
    .filter((item) => Boolean(item.content))
    .slice(-12);
}

export function buildCloudUnavailableAnswer() {
  return '当前云端模型暂时不可用，请稍后再试。';
}

export function buildBackgroundContinuationAnswer() {
  return '这次内容较长，已转入报表中心继续生成。生成完成后会出现在“已出报表”里。';
}

function getBackgroundHandoffTimeoutMs() {
  const parsed = Number(process.env.CHAT_BACKGROUND_HANDOFF_TIMEOUT_MS || '45000');
  if (!Number.isFinite(parsed) || parsed < 5000) return 45000;
  return Math.floor(parsed);
}

export async function withBackgroundHandoffTimeout<T>(promise: Promise<T>) {
  const timeoutMs = getBackgroundHandoffTimeoutMs();
  let timer: NodeJS.Timeout | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Chat background handoff timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function summarizeError(error: unknown) {
  if (error instanceof Error) return error.message || error.name || 'unknown-error';
  return String(error || 'unknown-error');
}

export function buildFallbackResponse(
  gatewayConfigured: boolean,
  requestMode: ChatRequestInput['mode'],
): {
  mode: 'openclaw' | 'fallback' | 'host';
  intent: 'general' | 'report';
  content: string;
  output: ChatOutput;
  libraries: Array<{ key: string; label: string }>;
  knowledgePlan: KnowledgePlan | null;
  conversationState: unknown;
  fallbackReason: string;
} {
  const content = buildCloudUnavailableAnswer();
  return {
    mode: 'fallback',
    intent: requestMode === 'general' ? 'general' : 'report',
    content,
    output: { type: 'answer', content },
    libraries: [],
    knowledgePlan: null,
    conversationState: null,
    fallbackReason: gatewayConfigured ? '' : 'cloud-gateway-not-configured',
  };
}
