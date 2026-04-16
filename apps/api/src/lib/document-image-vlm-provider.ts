import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ParsedDocument } from './document-parser.js';
import { runOpenClawChat } from './openclaw-adapter.js';
import { loadDocumentImageVlmCapability } from './document-image-vlm-capability.js';
import {
  buildDocumentImageVlmChatRequest,
  buildDocumentImageVlmPrompt,
  buildDocumentImageVlmSystemPrompt,
  normalizeDocumentImageFieldCandidateKey,
  parseDocumentImageVlmPayload,
  resolveDocumentImageVlmModelOverride,
} from './document-image-vlm-provider-prompts.js';
import { env, withDocumentImageGatewayEnv, withHostedDocumentImageUrl } from './document-image-vlm-provider-runtime.js';
import type { DocumentImageVlmResult } from './document-image-vlm-provider-types.js';

export type {
  DocumentImageVlmClaim,
  DocumentImageVlmEntity,
  DocumentImageVlmEvidenceBlock,
  DocumentImageVlmFieldCandidate,
  DocumentImageVlmPayload,
  DocumentImageVlmPromptField,
  DocumentImageVlmResult,
} from './document-image-vlm-provider-types.js';

export {
  buildDocumentImageVlmChatRequest,
  buildDocumentImageVlmPrompt,
  buildDocumentImageVlmSystemPrompt,
  normalizeDocumentImageFieldCandidateKey,
  resolveDocumentImageVlmModelOverride,
} from './document-image-vlm-provider-prompts.js';

export async function runDocumentImageVlm(input: {
  item: ParsedDocument;
  imagePath?: string;
}): Promise<DocumentImageVlmResult | null> {
  const capability = await loadDocumentImageVlmCapability();
  if (!capability.available) return null;

  const imagePath = path.resolve(String(input.imagePath || input.item.path || '').trim());
  if (!imagePath) return null;

  try {
    const stat = await fs.stat(imagePath);
    const maxBytes = Math.max(1024 * 1024, Number(env('DOCUMENT_IMAGE_VLM_MAX_IMAGE_BYTES', '20000000')));
    if (!stat.isFile() || stat.size <= 0 || stat.size > maxBytes) {
      return null;
    }
  } catch {
    return null;
  }

  const result = await withDocumentImageGatewayEnv(
    capability,
    async () => withHostedDocumentImageUrl(
      imagePath,
      async (imageUrl) => runOpenClawChat(buildDocumentImageVlmChatRequest({
        item: input.item,
        imagePath,
        imageUrl,
        capability,
      })),
    ),
  );

  return {
    content: result.content,
    model: result.model,
    provider: 'openclaw-skill',
    capability,
    parsed: parseDocumentImageVlmPayload(result.content),
  };
}
