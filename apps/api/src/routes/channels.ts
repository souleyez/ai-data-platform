import type { FastifyInstance } from 'fastify';
import { handleChannelIngress } from '../lib/channel-ingress.js';
import type { BotChannel } from '../lib/bot-definitions.js';
import { handleWecomCallbackMessage, verifyWecomCallbackUrl, type WecomCallbackQuery } from '../lib/wecom-callback.js';

function normalizeChannel(value: unknown): BotChannel | null {
  const channel = String(value || '').trim().toLowerCase();
  return channel === 'web' || channel === 'wecom' || channel === 'teams'
    ? channel
    : null;
}

function normalizeXmlBody(body: unknown) {
  if (typeof body === 'string') return body;
  if (Buffer.isBuffer(body)) return body.toString('utf8');
  const source = body && typeof body === 'object' && !Array.isArray(body)
    ? body as Record<string, unknown>
    : null;
  if (!source) return '';
  const encrypt = String(source.Encrypt || source.encrypt || '').trim();
  if (encrypt) {
    return `<xml><Encrypt><![CDATA[${encrypt}]]></Encrypt></xml>`;
  }
  return '';
}

export async function registerChannelRoutes(app: FastifyInstance) {
  app.addContentTypeParser(['application/xml', 'text/xml'], { parseAs: 'string' }, (_request, body, done) => {
    done(null, body);
  });

  app.post('/channels/:channel/messages/test', async (request, reply) => {
    const params = request.params as { channel?: string };
    const channel = normalizeChannel(params.channel);
    if (!channel) {
      return reply.code(400).send({ error: 'unsupported channel' });
    }

    const body = (request.body || {}) as {
      prompt?: string;
      promptBase64?: string;
      botId?: string;
      routeKey?: string;
      tenantId?: string;
      sessionUser?: string;
      senderId?: string;
      senderName?: string;
      chatHistory?: Array<{ role?: string; content?: string }>;
    };

    try {
      return await handleChannelIngress({
        channel,
        prompt: body.prompt,
        promptBase64: body.promptBase64,
        botId: String(body.botId || '').trim() || undefined,
        routeKey: String(body.routeKey || '').trim() || undefined,
        tenantId: String(body.tenantId || '').trim() || undefined,
        sessionUser: String(body.sessionUser || '').trim() || undefined,
        senderId: String(body.senderId || '').trim() || undefined,
        senderName: String(body.senderName || '').trim() || undefined,
        chatHistory: Array.isArray(body.chatHistory) ? body.chatHistory : [],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'channel ingress failed';
      const statusCode = message === 'prompt is required'
        ? 400
        : (message.startsWith('no enabled bot is configured for channel:') ? 404 : 500);
      return reply.code(statusCode).send({ error: message });
    }
  });

  app.get('/channels/wecom/callback/:routeKey', async (request, reply) => {
    const params = request.params as { routeKey?: string };
    const query = (request.query || {}) as WecomCallbackQuery;
    try {
      const body = await verifyWecomCallbackUrl(String(params.routeKey || ''), query);
      reply.header('Content-Type', 'text/plain; charset=utf-8');
      return reply.send(body);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'wecom verify failed';
      const statusCode = message === 'wecom route not configured'
        ? 404
        : (message === 'invalid wecom signature' ? 401 : 400);
      return reply.code(statusCode).send({ error: message });
    }
  });

  app.post('/channels/wecom/callback/:routeKey', async (request, reply) => {
    const params = request.params as { routeKey?: string };
    const query = (request.query || {}) as WecomCallbackQuery;
    try {
      const rawXml = normalizeXmlBody(request.body);
      const result = await handleWecomCallbackMessage({
        routeKey: String(params.routeKey || ''),
        query,
        rawXml,
      });
      if (result.type === 'success') {
        reply.header('Content-Type', 'text/plain; charset=utf-8');
        return reply.send(result.body);
      }
      reply.header('Content-Type', 'application/xml; charset=utf-8');
      return reply.send(result.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'wecom callback failed';
      const statusCode = message === 'wecom route not configured'
        ? 404
        : (message === 'invalid wecom signature' ? 401 : 400);
      return reply.code(statusCode).send({ error: message });
    }
  });
}
