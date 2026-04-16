import type { FastifyInstance } from 'fastify';
import { resolveDatasetSecretGrants } from '../lib/dataset-secrets.js';
import { loadDocumentLibraries } from '../lib/document-libraries.js';
import { runChatOrchestrationV2 } from '../lib/orchestrator.js';

export async function registerChatRoutes(app: FastifyInstance) {
  app.post('/chat', async (request, reply) => {
    const body = (request.body || {}) as {
      prompt?: string;
      promptBase64?: string;
      sessionUser?: string;
      mode?: 'general' | 'knowledge_output';
      debugResumePage?: boolean;
      confirmedRequest?: string;
      preferredLibraries?: Array<{ key?: string; label?: string }>;
      chatHistory?: Array<{ role?: string; content?: string }>;
      conversationState?: unknown;
      systemConstraints?: string;
      confirmedAction?: string;
      botId?: string;
      datasetSecretGrants?: unknown[];
      activeDatasetSecretGrant?: unknown;
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

    const [libraries, resolvedDatasetSecrets] = await Promise.all([
      loadDocumentLibraries(),
      resolveDatasetSecretGrants({
        grants: body.datasetSecretGrants,
        activeGrant: body.activeDatasetSecretGrant,
      }),
    ]);
    const unlockedLibraryKeySet = new Set(resolvedDatasetSecrets.unlockedLibraryKeys);
    const accessibleLibraryKeys = libraries
      .filter((library) => !library.secretProtected || unlockedLibraryKeySet.has(library.key))
      .map((library) => library.key);

    return runChatOrchestrationV2({
      prompt,
      mode: body.mode || 'general',
      confirmedRequest: typeof body.confirmedRequest === 'string' ? body.confirmedRequest : '',
      preferredLibraries: Array.isArray(body.preferredLibraries)
        ? body.preferredLibraries
            .map((item) => ({
              key: typeof item === 'string' ? String(item).trim() : String(item?.key || '').trim(),
              label: typeof item === 'string' ? '' : String(item?.label || '').trim(),
            }))
            .filter((item) => item.key || item.label)
        : [],
      sessionUser: body.sessionUser,
      debugResumePage: body.debugResumePage === true,
      conversationState: body.conversationState ?? null,
      systemConstraints: String(body.systemConstraints || '').trim(),
      botId: String(body.botId || '').trim() || undefined,
      effectiveVisibleLibraryKeys: accessibleLibraryKeys,
      confirmedAction: String(body.confirmedAction || '').trim() === 'openclaw_action'
        ? 'openclaw_action'
        : (
          ['template_output', 'dataset_static_page'].includes(String(body.confirmedAction || '').trim())
            ? 'dataset_static_page'
            : undefined
        ),
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
