import type { FastifyInstance } from 'fastify';
import { runChatOrchestrationV2 } from '../lib/orchestrator.js';

export async function registerChatRoutes(app: FastifyInstance) {
  app.post('/chat', async (request, reply) => {
    const body = (request.body || {}) as {
      prompt?: string;
      promptBase64?: string;
      sessionUser?: string;
      chatHistory?: Array<{ role?: string; content?: string }>;
    };
    let prompt = String(body.prompt || '').trim();

    if (body.promptBase64) {
      try {
        prompt = Buffer.from(String(body.promptBase64), 'base64').toString('utf8').trim() || prompt;
      } catch {
        // ignore invalid base64 payloads and fall back to plain prompt
      }
    }

    if (!prompt) {
      return reply.code(400).send({ error: 'prompt is required' });
    }

    return runChatOrchestrationV2({
      prompt,
      sessionUser: body.sessionUser,
      chatHistory: Array.isArray(body.chatHistory)
        ? body.chatHistory
          .map((item) => ({
            role: item?.role === 'assistant' ? 'assistant' as const : 'user' as const,
            content: String(item?.content || '').trim(),
          }))
          .filter((item) => item.content)
          .slice(-6)
        : [],
    });
  });
}
