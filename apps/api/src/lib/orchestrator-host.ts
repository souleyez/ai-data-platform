import { tryExecutePlatformChatAction, type ChatActionResult } from './platform-chat-actions.js';
import { summarizeError } from './orchestrator-support.js';

export async function tryRunHostPlatformAction(input: {
  prompt: string;
  requestMode: 'general' | 'knowledge_output';
  backgroundContinuation?: boolean;
}) {
  if (input.requestMode !== 'general' || input.backgroundContinuation) return null;

  try {
    const hostAction = await tryExecutePlatformChatAction({
      prompt: input.prompt,
    });
    if (!hostAction) return null;

    return {
      handled: true,
      mode: 'host' as const,
      intent: 'general' as const,
      content: hostAction.content,
      output: { type: 'answer' as const, content: hostAction.content },
      libraries: hostAction.libraries,
      conversationState: null,
      routeKind: hostAction.actionResult.status === 'failed'
        ? 'platform_action_failed'
        : 'platform_action',
      evidenceMode: null,
      actionResult: hostAction.actionResult,
      fallbackReason: '',
      guard: {
        requiresConfirmation: false,
        reason: '',
      },
    };
  } catch (error) {
    const content = error instanceof Error ? error.message : '系统操作执行失败，请稍后再试。';
    return {
      handled: true,
      mode: 'host' as const,
      intent: 'general' as const,
      content,
      output: { type: 'answer' as const, content },
      libraries: [],
      conversationState: null,
      routeKind: 'platform_action_failed',
      evidenceMode: null,
      actionResult: null as ChatActionResult | null,
      fallbackReason: summarizeError(error),
      guard: {
        requiresConfirmation: false,
        reason: '',
      },
    };
  }
}
