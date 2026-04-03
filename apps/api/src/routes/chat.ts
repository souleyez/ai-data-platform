import type { FastifyInstance } from 'fastify';
import { runChatOrchestrationV2 } from '../lib/orchestrator.js';

export async function registerChatRoutes(app: FastifyInstance) {
  app.post('/chat', async (request, reply) => {
    const body = (request.body || {}) as {
      prompt?: string;
      promptBase64?: string;
      sessionUser?: string;
      mode?: 'general' | 'knowledge_plan' | 'knowledge_output';
      debugResumePage?: boolean;
      confirmedRequest?: string;
      preferredLibraries?: Array<{ key?: string; label?: string }>;
      chatHistory?: Array<{ role?: string; content?: string }>;
      conversationState?: unknown;
      systemConstraints?: string;
      confirmedAction?: string;
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
      mode: body.mode || 'general',
      confirmedRequest: typeof body.confirmedRequest === 'string' ? body.confirmedRequest : '',
      preferredLibraries: Array.isArray(body.preferredLibraries)
        ? body.preferredLibraries
            .map((item) => ({
              key: String(item?.key || '').trim(),
              label: String(item?.label || '').trim(),
            }))
            .filter((item) => item.key || item.label)
        : [],
      sessionUser: body.sessionUser,
      debugResumePage: body.debugResumePage === true,
      conversationState: body.conversationState ?? null,
      systemConstraints: String(body.systemConstraints || '').trim(),
      confirmedAction: String(body.confirmedAction || '').trim() === 'openclaw_action'
        ? 'openclaw_action'
        : (String(body.confirmedAction || '').trim() === 'template_output' ? 'template_output' : undefined),
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
