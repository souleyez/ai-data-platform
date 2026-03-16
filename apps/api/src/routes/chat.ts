import type { FastifyInstance } from 'fastify';
import { runChatOrchestration } from '../lib/orchestrator.js';

export async function registerChatRoutes(app: FastifyInstance) {
  app.post('/chat', async (request, reply) => {
    const body = (request.body || {}) as { prompt?: string; sessionUser?: string };
    const prompt = String(body.prompt || '').trim();

    if (!prompt) {
      return reply.code(400).send({ error: 'prompt is required' });
    }

    return runChatOrchestration({
      prompt,
      sessionUser: body.sessionUser,
    });
  });
}
