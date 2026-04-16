import AiBot from '@wecom/aibot-node-sdk';
import type { FastifyBaseLogger } from 'fastify';
import { listWecomLongConnectionConfigs } from './wecom-long-connection-config.js';
import {
  handleWecomCardEvent,
  handleWecomEnterChat,
  handleWecomTextMessage,
  processPendingWecomSatisfactionPrompts,
} from './wecom-long-connection-handlers.js';
import {
  createLogger,
  type WecomWsClient,
} from './wecom-long-connection-support.js';

type ManagedClient = {
  externalBotId: string;
  client: WecomWsClient;
};

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

    client.on('message.text', async (frame) => {
      await handleWecomTextMessage(logger, client, item.externalBotId, frame);
    });

    client.on('event.template_card_event', async (frame) => {
      await handleWecomCardEvent(logger, client, item.externalBotId, frame);
    });

    client.on('event.enter_chat', async (frame) => {
      await handleWecomEnterChat(logger, client, item.externalBotId, frame);
    });

    client.connect();
    clients.push({ externalBotId: item.externalBotId, client });
    clientByExternalBotId.set(item.externalBotId, client);
  }

  const promptTimer = setInterval(async () => {
    await processPendingWecomSatisfactionPrompts(logger, clientByExternalBotId);
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
