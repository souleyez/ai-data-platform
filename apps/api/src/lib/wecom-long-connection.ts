import AiBot, { generateReqId, type WsFrame } from '@wecom/aibot-node-sdk';
import type { FastifyBaseLogger } from 'fastify';
import type { BotChannelBinding } from './bot-definitions.js';
import {
  completeThirdPartyFeedbackSelection,
  finalizeDueDefaultFeedbacks,
  handleThirdPartyInboundFeedback,
  listDueThirdPartyFeedbackPrompts,
  markThirdPartyFeedbackPromptSent,
  noteThirdPartyAssistantReply,
} from './channel-session-feedback.js';
import { listWecomLongConnectionConfigs } from './wecom-long-connection-config.js';
import { handleChannelIngress } from './channel-ingress.js';
import { listBotDefinitionsForManage } from './bot-definitions.js';

type WecomWsClient = InstanceType<typeof AiBot.WSClient>;

type ManagedClient = {
  externalBotId: string;
  client: WecomWsClient;
};

function normalizeText(value: unknown) {
  return String(value || '').trim();
}

function findWecomBinding(bindings: BotChannelBinding[], externalBotId: string) {
  return bindings.find((binding) => (
    binding.channel === 'wecom' && binding.enabled && normalizeText(binding.externalBotId) === externalBotId
  )) || null;
}

function buildWelcomeContent(botName: string) {
  return `您好，我是 ${botName}。请直接告诉我您要查询的内容。`;
}

async function resolveWecomRouteContext(externalBotId: string) {
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

function buildRecipientId(body: Record<string, unknown>, senderId: string) {
  const chatId = normalizeText(body.chatid);
  return chatId || senderId;
}

function buildSatisfactionEventKey(sessionId: string, rating: number) {
  return `satisfaction:${sessionId}:${rating}`;
}

function parseSatisfactionEventKey(eventKey: string) {
  const matched = String(eventKey || '').match(/^satisfaction:(.+):([1-5])$/);
  if (!matched) return null;
  return {
    sessionId: matched[1],
    rating: Number(matched[2]),
  };
}

function buildWecomSatisfactionCard(input: {
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

function buildSatisfactionAckCard(input: { taskId: string; rating: number }) {
  return {
    card_type: 'text_notice',
    main_title: {
      title: `已记录 ${input.rating} 星评价`,
      desc: '感谢你的反馈，我们会继续优化后续回答质量。',
    },
    task_id: input.taskId,
  };
}

async function replyText(client: WecomWsClient, frame: WsFrame, content: string) {
  const text = normalizeText(content) || 'success';
  await client.replyStream(frame, generateReqId('stream'), text, true);
}

function createLogger(logger: FastifyBaseLogger, externalBotId: string) {
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

export async function startWecomLongConnectionManager(logger: FastifyBaseLogger) {
  const configs = await listWecomLongConnectionConfigs();
  if (!configs.length) {
    logger.info('wecom long connection disabled: no configured bots');
    return {
      clients: [] as ManagedClient[],
      async stop() {},
    };
  }

  const clients: ManagedClient[] = [];
  const clientByExternalBotId = new Map<string, WecomWsClient>();

  for (const item of configs) {
    // Long connection is an additional ingress for the 智能机器人 API mode.
    // The self-built app callback route remains available in parallel.
    const client = new AiBot.WSClient({
      botId: item.externalBotId,
      secret: item.secret,
      wsUrl: item.wsUrl,
      logger: createLogger(logger, item.externalBotId),
      maxReconnectAttempts: -1,
    });

    client.on('authenticated', () => {
      logger.info({ externalBotId: item.externalBotId }, 'wecom long connection authenticated');
    });

    client.on('error', (error: Error) => {
      logger.warn({ externalBotId: item.externalBotId, error }, 'wecom long connection error');
    });

    client.on('message.text', async (frame: WsFrame) => {
      try {
        const body = (frame.body || {}) as Record<string, unknown>;
        const prompt = normalizeText((body.text as { content?: string } | undefined)?.content);
        const senderId = normalizeText((body.from as { userid?: string } | undefined)?.userid);
        const recipientId = buildRecipientId(body, senderId);

        logger.info({
          externalBotId: item.externalBotId,
          senderId,
          recipientId,
          promptLength: prompt.length,
        }, 'received wecom long connection text message');

        const routeContext = await resolveWecomRouteContext(item.externalBotId);
        if (!routeContext) {
          logger.warn({ externalBotId: item.externalBotId }, 'no bot binding found for wecom long connection message');
          return;
        }

        if (!prompt) return;

        const feedback = await handleThirdPartyInboundFeedback({
          channel: 'wecom',
          botId: routeContext.botId,
          botName: routeContext.botName,
          externalBotId: item.externalBotId,
          routeKey: routeContext.routeKey,
          tenantId: routeContext.tenantId,
          sessionUser: senderId ? `wecom:${senderId}` : 'wecom:anonymous',
          recipientId,
          senderId,
          senderName: senderId,
          prompt,
        });

        if (feedback.handled) {
          await replyText(client, frame, feedback.acknowledged || '感谢反馈，已记录。');
          logger.info({
            externalBotId: item.externalBotId,
            botId: routeContext.botId,
            senderId,
            recipientId,
          }, 'recorded wecom text satisfaction feedback');
          return;
        }

        logger.info({
          externalBotId: item.externalBotId,
          botId: routeContext.botId,
          routeKey: routeContext.routeKey,
          tenantId: routeContext.tenantId,
          senderId,
          recipientId,
          promptLength: prompt.length,
          defaultedPendingFeedback: feedback.defaultedExistingSession,
        }, 'routing wecom long connection text message');

        const result = await handleChannelIngress({
          channel: 'wecom',
          prompt,
          botId: routeContext.botId,
          routeKey: routeContext.routeKey,
          tenantId: routeContext.tenantId,
          senderId,
          senderName: senderId,
          sessionUser: senderId ? `wecom:${senderId}` : undefined,
        });

        const replyContent = result.result.message?.content || 'success';

        logger.info({
          externalBotId: item.externalBotId,
          botId: routeContext.botId,
          senderId,
          routeKind: result.result.orchestration?.routeKind || '',
          libraryKeys: Array.isArray(result.result.libraries)
            ? result.result.libraries.map((library) => library.key)
            : [],
          docMatches: Number(result.result.orchestration?.docMatches || 0),
          replyLength: normalizeText(replyContent).length,
        }, 'completed wecom long connection text message');

        await replyText(client, frame, replyContent);

        await noteThirdPartyAssistantReply({
          channel: 'wecom',
          botId: routeContext.botId,
          botName: routeContext.botName,
          externalBotId: item.externalBotId,
          routeKey: routeContext.routeKey,
          tenantId: routeContext.tenantId,
          sessionUser: senderId ? `wecom:${senderId}` : 'wecom:anonymous',
          recipientId,
          senderId,
          senderName: senderId,
          answerContent: replyContent,
        });

        logger.info({
          externalBotId: item.externalBotId,
          botId: routeContext.botId,
          senderId,
          recipientId,
        }, 'replied to wecom long connection text message');
      } catch (error) {
        logger.error({ externalBotId: item.externalBotId, error }, 'failed to handle wecom long connection text message');
      }
    });

    client.on('event.template_card_event', async (frame: WsFrame) => {
      try {
        const body = (frame.body || {}) as Record<string, unknown>;
        const event = (body.event || {}) as Record<string, unknown>;
        const eventKey = normalizeText(event.event_key);
        const taskId = normalizeText(event.task_id);
        const matched = parseSatisfactionEventKey(eventKey);
        if (!matched) return;

        const completed = await completeThirdPartyFeedbackSelection({
          sessionId: matched.sessionId,
          rating: matched.rating,
          source: 'user_card',
          responseText: eventKey,
        });
        if (!completed) return;

        await client.updateTemplateCard(frame, buildSatisfactionAckCard({
          taskId: taskId || `satisfaction-${matched.sessionId}`,
          rating: matched.rating,
        }));

        logger.info({
          externalBotId: item.externalBotId,
          botId: completed.botId,
          senderId: completed.senderId,
          recipientId: completed.recipientId,
          rating: matched.rating,
        }, 'recorded wecom card satisfaction feedback');
      } catch (error) {
        logger.warn({ externalBotId: item.externalBotId, error }, 'failed to handle wecom satisfaction card event');
      }
    });

    client.on('event.enter_chat', async (frame: WsFrame) => {
      try {
        const routeContext = await resolveWecomRouteContext(item.externalBotId);
        if (!routeContext) return;
        await client.replyWelcome(frame, {
          msgtype: 'text',
          text: {
            content: buildWelcomeContent(routeContext.botName),
          },
        });
      } catch (error) {
        logger.warn({ externalBotId: item.externalBotId, error }, 'failed to send wecom welcome message');
      }
    });

    client.connect();
    clients.push({ externalBotId: item.externalBotId, client });
    clientByExternalBotId.set(item.externalBotId, client);
  }

  const promptTimer = setInterval(async () => {
    try {
      const dueSessions = await listDueThirdPartyFeedbackPrompts();
      for (const session of dueSessions) {
        if (session.channel !== 'wecom' || !session.externalBotId || !session.recipientId) continue;
        const client = clientByExternalBotId.get(session.externalBotId);
        if (!client) continue;

        await client.sendMessage(session.recipientId, buildWecomSatisfactionCard({
          sessionId: session.id,
          botName: session.botName,
          answerExcerpt: session.lastAnswerExcerpt,
        }));
        await markThirdPartyFeedbackPromptSent(session.id);

        logger.info({
          externalBotId: session.externalBotId,
          botId: session.botId,
          recipientId: session.recipientId,
          sessionUser: session.sessionUser,
        }, 'sent wecom satisfaction prompt');
      }

      const finalized = await finalizeDueDefaultFeedbacks();
      if (finalized.completed) {
        logger.info({ completed: finalized.completed }, 'finalized default five-star satisfaction ratings');
      }
    } catch (error) {
      logger.warn({ error }, 'failed to process pending wecom satisfaction prompts');
    }
  }, 60 * 1000);
  promptTimer.unref?.();

  return {
    clients,
    async stop() {
      clearInterval(promptTimer);
      for (const item of clients) {
        try {
          item.client.disconnect();
        } catch (error) {
          logger.warn({ externalBotId: item.externalBotId, error }, 'failed to stop wecom long connection client');
        }
      }
    },
  };
}
