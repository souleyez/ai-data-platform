import { resolveBotForChannel, type BotChannel } from './bot-definitions.js';
import { runChatOrchestrationV2 } from './orchestrator.js';

type ChannelChatHistoryItem = { role?: string; content?: string };

export type ChannelIngressRequest = {
  channel: BotChannel;
  prompt?: string;
  promptBase64?: string;
  botId?: string;
  routeKey?: string;
  tenantId?: string;
  sessionUser?: string;
  senderId?: string;
  senderName?: string;
  chatHistory?: ChannelChatHistoryItem[];
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

export async function handleChannelIngress(input: ChannelIngressRequest) {
  const prompt = normalizePrompt(input);
  if (!prompt) {
    throw new Error('prompt is required');
  }

  const bot = await resolveBotForChannel(input.channel, {
    botId: String(input.botId || '').trim() || undefined,
    routeKey: String(input.routeKey || '').trim() || undefined,
    tenantId: String(input.tenantId || '').trim() || undefined,
  });

  if (!bot) {
    throw new Error(`no enabled bot is configured for channel: ${input.channel}`);
  }

  const result = await runChatOrchestrationV2({
    prompt,
    chatHistory: normalizeChatHistory(input.chatHistory),
    sessionUser: buildSessionUser(input),
    botId: bot.id,
  });

  return {
    channel: input.channel,
    bot: {
      id: bot.id,
      name: bot.name,
      description: bot.description,
      routeKey: bot.channelBindings.find((item) => item.channel === input.channel)?.routeKey || '',
      tenantId: bot.channelBindings.find((item) => item.channel === input.channel)?.tenantId || '',
    },
    sessionUser: buildSessionUser(input),
    sender: {
      id: String(input.senderId || '').trim(),
      name: String(input.senderName || '').trim(),
    },
    result,
  };
}
