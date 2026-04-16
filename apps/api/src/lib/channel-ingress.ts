import { resolveBotForChannel, type BotChannel } from './bot-definitions.js';
import { resolveChannelAccessContext, type ResolvedChannelAccess } from './channel-access-resolver.js';
import { runChatOrchestrationV2 } from './orchestrator.js';

type ChannelChatHistoryItem = { role?: string; content?: string };

export type ChannelIngressRequest = {
  channel: BotChannel;
  prompt?: string;
  promptBase64?: string;
  botId?: string;
  externalBotId?: string;
  routeKey?: string;
  tenantId?: string;
  sessionUser?: string;
  senderId?: string;
  senderName?: string;
  chatHistory?: ChannelChatHistoryItem[];
};

export type ResolvedChannelIngressContext = {
  prompt: string;
  bot: Awaited<ReturnType<typeof resolveBotForChannel>>;
  sessionUser: string;
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
  accessContext: ResolvedChannelAccess;
  orchestrationInput: {
    prompt: string;
    chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
    sessionUser: string;
    botId: string;
    effectiveVisibleLibraryKeys?: string[];
    accessContext?: ResolvedChannelAccess | null;
  };
};

function normalizePrompt(input: Pick<ChannelIngressRequest, 'prompt' | 'promptBase64'>) {
  let prompt = String(input.prompt || '').trim();
  if (input.promptBase64) {
    try {
      prompt = Buffer.from(String(input.promptBase64), 'base64').toString('utf8').trim() || prompt;
    } catch {
      // Ignore malformed base64 and fall back to plain prompt.
    }
  }
  return prompt;
}

function normalizeChatHistory(chatHistory?: ChannelChatHistoryItem[]) {
  return Array.isArray(chatHistory)
    ? chatHistory
        .map((item) => ({
          role: item?.role === 'assistant' ? 'assistant' as const : 'user' as const,
          content: String(item?.content || '').trim(),
        }))
        .filter((item) => item.content)
        .slice(-6)
    : [];
}

function buildSessionUser(input: ChannelIngressRequest) {
  const explicit = String(input.sessionUser || '').trim();
  if (explicit) return explicit;
  const senderId = String(input.senderId || '').trim();
  if (senderId) return `${input.channel}:${senderId}`;
  return `${input.channel}:anonymous`;
}

function buildDeniedOrchestrationResponse(accessContext: ResolvedChannelAccess) {
  const content = '当前身份未配置可访问的文档库，暂时无法回答该知识库内容。';
  return {
    mode: 'fallback',
    intent: 'general',
    needsKnowledge: false,
    libraries: [],
    output: { type: 'answer', content },
    reportTemplate: null,
    savedReport: null,
    knowledgePlan: null,
    guard: {
      requiresConfirmation: false,
      reason: 'external_access_denied',
    },
    traceId: `trace_${Date.now()}`,
    message: {
      role: 'assistant' as const,
      content,
      output: { type: 'answer' as const, content },
      meta: '外部用户文档权限未命中',
      references: [],
      confirmation: null,
    },
    sources: [],
    permissions: {
      readOnly: true,
      capabilities: {
        canReadLocalFiles: true,
        canImportLocalFiles: false,
        canModifyLocalSystemFiles: false,
      },
    },
    orchestration: {
      mode: 'fallback',
      routeKind: 'access_denied',
      docMatches: 0,
      evidenceMode: null,
      gatewayConfigured: false,
      fallbackReason: accessContext.denyReason,
      searchEnabledByDefault: true,
      nativeSearchPreferred: true,
      botId: accessContext.botId,
      botName: '',
    },
    debug: {
      accessContext,
    },
    conversationState: null,
    latencyMs: 0,
  };
}

export async function resolveChannelIngressContext(input: ChannelIngressRequest): Promise<ResolvedChannelIngressContext> {
  const prompt = normalizePrompt(input);
  if (!prompt) {
    throw new Error('prompt is required');
  }

  const bot = await resolveBotForChannel(input.channel, {
    botId: String(input.botId || '').trim() || undefined,
    externalBotId: String(input.externalBotId || '').trim() || undefined,
    routeKey: String(input.routeKey || '').trim() || undefined,
    tenantId: String(input.tenantId || '').trim() || undefined,
  });

  if (!bot) {
    throw new Error(`no enabled bot is configured for channel: ${input.channel}`);
  }

  const chatHistory = normalizeChatHistory(input.chatHistory);
  const sessionUser = buildSessionUser(input);
  const accessContext = await resolveChannelAccessContext({
    bot,
    channel: input.channel,
    senderId: String(input.senderId || '').trim() || undefined,
    senderName: String(input.senderName || '').trim() || undefined,
    routeKey: String(input.routeKey || '').trim() || undefined,
    tenantId: String(input.tenantId || '').trim() || undefined,
    externalBotId: String(input.externalBotId || '').trim() || undefined,
  });

  return {
    prompt,
    bot,
    sessionUser,
    chatHistory,
    accessContext,
    orchestrationInput: {
      prompt,
      chatHistory,
      sessionUser,
      botId: bot.id,
      effectiveVisibleLibraryKeys: accessContext.source === 'external-directory'
        ? accessContext.effectiveVisibleLibraryKeys
        : undefined,
      accessContext,
    },
  };
}

export async function handleChannelIngress(input: ChannelIngressRequest) {
  const context = await resolveChannelIngressContext(input);
  const result = context.accessContext.isDenied
    ? buildDeniedOrchestrationResponse(context.accessContext)
    : await runChatOrchestrationV2(context.orchestrationInput);

  return {
    channel: input.channel,
    bot: {
      id: context.bot?.id || '',
      name: context.bot?.name || '',
      description: context.bot?.description || '',
      routeKey: context.bot?.channelBindings.find((item) => item.channel === input.channel)?.routeKey || '',
      tenantId: context.bot?.channelBindings.find((item) => item.channel === input.channel)?.tenantId || '',
    },
    sessionUser: context.sessionUser,
    sender: {
      id: String(input.senderId || '').trim(),
      name: String(input.senderName || '').trim(),
    },
    accessContext: context.accessContext,
    result,
  };
}
