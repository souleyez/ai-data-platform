import type { FastifyBaseLogger } from 'fastify';
import type { WsFrame } from '@wecom/aibot-node-sdk';
import {
  completeThirdPartyFeedbackSelection,
  finalizeDueDefaultFeedbacks,
  handleThirdPartyInboundFeedback,
  listDueThirdPartyFeedbackPrompts,
  markThirdPartyFeedbackPromptSent,
  noteThirdPartyAssistantReply,
} from './channel-session-feedback.js';
import { handleChannelIngress } from './channel-ingress.js';
import {
  buildRecipientId,
  buildSatisfactionAckCard,
  buildWecomSatisfactionCard,
  buildWelcomeContent,
  normalizeText,
  parseSatisfactionEventKey,
  replyText,
  resolveWecomRouteContext,
  type WecomWsClient,
} from './wecom-long-connection-support.js';

export async function handleWecomTextMessage(
  logger: FastifyBaseLogger,
  client: WecomWsClient,
  externalBotId: string,
  frame: WsFrame,
) {
  try {
    const body = (frame.body || {}) as Record<string, unknown>;
    const prompt = normalizeText((body.text as { content?: string } | undefined)?.content);
    const senderId = normalizeText((body.from as { userid?: string } | undefined)?.userid);
    const recipientId = buildRecipientId(body, senderId);

    logger.info({
      externalBotId,
      senderId,
      recipientId,
      promptLength: prompt.length,
    }, 'received wecom long connection text message');

    const routeContext = await resolveWecomRouteContext(externalBotId);
    if (!routeContext) {
      logger.warn({ externalBotId }, 'no bot binding found for wecom long connection message');
      return;
    }

    if (!prompt) return;

    const feedback = await handleThirdPartyInboundFeedback({
      channel: 'wecom',
      botId: routeContext.botId,
      botName: routeContext.botName,
      externalBotId,
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
        externalBotId,
        botId: routeContext.botId,
        senderId,
        recipientId,
      }, 'recorded wecom text satisfaction feedback');
      return;
    }

    logger.info({
      externalBotId,
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
      externalBotId,
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
      externalBotId,
      routeKey: routeContext.routeKey,
      tenantId: routeContext.tenantId,
      sessionUser: senderId ? `wecom:${senderId}` : 'wecom:anonymous',
      recipientId,
      senderId,
      senderName: senderId,
      answerContent: replyContent,
    });

    logger.info({
      externalBotId,
      botId: routeContext.botId,
      senderId,
      recipientId,
    }, 'replied to wecom long connection text message');
  } catch (error) {
    logger.error({ externalBotId, error }, 'failed to handle wecom long connection text message');
  }
}

export async function handleWecomCardEvent(
  logger: FastifyBaseLogger,
  client: WecomWsClient,
  externalBotId: string,
  frame: WsFrame,
) {
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
      externalBotId,
      botId: completed.botId,
      senderId: completed.senderId,
      recipientId: completed.recipientId,
      rating: matched.rating,
    }, 'recorded wecom card satisfaction feedback');
  } catch (error) {
    logger.warn({ externalBotId, error }, 'failed to handle wecom satisfaction card event');
  }
}

export async function handleWecomEnterChat(
  logger: FastifyBaseLogger,
  client: WecomWsClient,
  externalBotId: string,
  frame: WsFrame,
) {
  try {
    const routeContext = await resolveWecomRouteContext(externalBotId);
    if (!routeContext) return;
    await client.replyWelcome(frame, {
      msgtype: 'text',
      text: {
        content: buildWelcomeContent(routeContext.botName),
      },
    });
  } catch (error) {
    logger.warn({ externalBotId, error }, 'failed to send wecom welcome message');
  }
}

export async function processPendingWecomSatisfactionPrompts(
  logger: FastifyBaseLogger,
  clientByExternalBotId: Map<string, WecomWsClient>,
) {
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
}
