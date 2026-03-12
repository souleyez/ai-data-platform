import type { FastifyInstance } from 'fastify';
import { resolveScenario, scenarios } from '../lib/mock-data.js';

export async function registerChatRoutes(app: FastifyInstance) {
  app.post('/chat', async (request, reply) => {
    const body = (request.body || {}) as { prompt?: string };
    const prompt = String(body.prompt || '').trim();

    if (!prompt) {
      return reply.code(400).send({ error: 'prompt is required' });
    }

    const scenarioKey = resolveScenario(prompt);
    const scenario = scenarios[scenarioKey];

    return {
      scenario: scenarioKey,
      traceId: `trace_${Date.now()}`,
      message: {
        role: 'assistant',
        content: scenario.reply,
        meta: scenario.source,
      },
      panel: scenario,
      sources: scenario.sources,
      permissions: {
        mode: 'read-only',
      },
      latencyMs: 120,
    };
  });
}
