import AiBot, { generateReqId, type WsFrame } from '@wecom/aibot-node-sdk';
import type { FastifyBaseLogger } from 'fastify';
import type { BotChannelBinding } from './bot-definitions.js';
import { listBotDefinitionsForManage } from './bot-definitions.js';

export type WecomWsClient = InstanceType<typeof AiBot.WSClient>;

export function normalizeText(value: unknown) {
  return String(value || '').trim();
}

function findWecomBinding(bindings: BotChannelBinding[], externalBotId: string) {
  return bindings.find((binding) => (
    binding.channel === 'wecom' && binding.enabled && normalizeText(binding.externalBotId) === externalBotId
  )) || null;
}

export function buildWelcomeContent(botName: string) {
  return `您好，我是 ${botName}。请直接告诉我您要查询的内容。`;
}

export async function resolveWecomRouteContext(externalBotId: string) {
  const bots = await listBotDefinitionsForManage();
  const matchedBot = bots.find((bot) => findWecomBinding(bot.channelBindings, externalBotId));
  if (!matchedBot) return null;
  const binding = findWecomBinding(matchedBot.channelBindings, externalBotId);
  if (!binding) return null;
  return {
    botId: matchedBot.id,
    routeKey: binding.routeKey,
    tenantId: binding.tenantId,
    botName: matchedBot.name,
  };
}

export function buildRecipientId(body: Record<string, unknown>, senderId: string) {
  const chatId = normalizeText(body.chatid);
  return chatId || senderId;
}

function buildSatisfactionEventKey(sessionId: string, rating: number) {
  return `satisfaction:${sessionId}:${rating}`;
}

export function parseSatisfactionEventKey(eventKey: string) {
  const matched = String(eventKey || '').match(/^satisfaction:(.+):([1-5])$/);
  if (!matched) return null;
  return {
    sessionId: matched[1],
    rating: Number(matched[2]),
  };
}

export function buildWecomSatisfactionCard(input: {
  sessionId: string;
  botName: string;
  answerExcerpt: string;
}) {
  return {
    msgtype: 'template_card' as const,
    template_card: {
      card_type: 'button_interaction',
      main_title: {
        title: `${input.botName || '智能助手'} 服务满意度`,
        desc: input.answerExcerpt
          ? `刚才的回复：${input.answerExcerpt}`
          : '本次会话是否满意？如果没有回复，系统会默认记为 5 星。',
      },
      button_list: [
        1, 2, 3, 4, 5,
      ].map((rating) => ({
        text: `${rating}星`,
        key: buildSatisfactionEventKey(input.sessionId, rating),
        style: rating >= 4 ? 1 : 2,
      })),
      task_id: `satisfaction-${input.sessionId}`,
    },
  };
}

export function buildSatisfactionAckCard(input: { taskId: string; rating: number }) {
  return {
    card_type: 'text_notice',
    main_title: {
      title: `已记录 ${input.rating} 星评价`,
      desc: '感谢你的反馈，我们会继续优化后续回答质量。',
    },
    task_id: input.taskId,
  };
}

export async function replyText(client: WecomWsClient, frame: WsFrame, content: string) {
  const text = normalizeText(content) || 'success';
  await client.replyStream(frame, generateReqId('stream'), text, true);
}

export function createLogger(logger: FastifyBaseLogger, externalBotId: string) {
  return {
    debug(message: string, ...args: unknown[]) {
      logger.debug({ args, externalBotId }, message);
    },
    info(message: string, ...args: unknown[]) {
      logger.info({ args, externalBotId }, message);
    },
    warn(message: string, ...args: unknown[]) {
      logger.warn({ args, externalBotId }, message);
    },
    error(message: string, ...args: unknown[]) {
      logger.error({ args, externalBotId }, message);
    },
  };
}
