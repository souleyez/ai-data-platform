import type { FastifyInstance } from 'fastify';
import { matchDocumentsByPrompt, loadParsedDocuments } from '../lib/document-store.js';
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
    const { items } = await loadParsedDocuments();
    const matchedDocs = matchDocumentsByPrompt(items, prompt);

    const docContext = matchedDocs.length
      ? `\n\n文档相关摘要：${matchedDocs
          .map((item, index) => `${index + 1}. ${item.name}：${item.summary}`)
          .join(' ')}`
      : '';

    return {
      scenario: scenarioKey,
      traceId: `trace_${Date.now()}`,
      message: {
        role: 'assistant',
        content: `${scenario.reply}${docContext}`,
        meta: scenario.source,
      },
      panel: scenario,
      sources: [
        ...scenario.sources,
        ...matchedDocs.map((item) => ({ type: 'documents', name: item.name, table: item.path })),
      ],
      permissions: {
        mode: 'read-only',
      },
      latencyMs: 120,
    };
  });
}
