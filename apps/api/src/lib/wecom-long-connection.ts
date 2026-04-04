import AiBot, { generateReqId, type WsFrame } from '@wecom/aibot-node-sdk';
import type { FastifyBaseLogger } from 'fastify';
import type { BotChannelBinding } from './bot-definitions.js';
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

        logger.info({
          externalBotId: item.externalBotId,
          senderId,
          promptLength: prompt.length,
        }, 'received wecom long connection text message');

        const routeContext = await resolveWecomRouteContext(item.externalBotId);
        if (!routeContext) {
          logger.warn({ externalBotId: item.externalBotId }, 'no bot binding found for wecom long connection message');
          return;
        }

        if (!prompt) return;

        logger.info({
          externalBotId: item.externalBotId,
          botId: routeContext.botId,
          routeKey: routeContext.routeKey,
          tenantId: routeContext.tenantId,
          senderId,
          promptLength: prompt.length,
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

        logger.info({
          externalBotId: item.externalBotId,
          botId: routeContext.botId,
          senderId,
        }, 'replied to wecom long connection text message');
      } catch (error) {
        logger.error({ externalBotId: item.externalBotId, error }, 'failed to handle wecom long connection text message');
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
  }

  return {
    clients,
    async stop() {
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
