import { isOpenClawGatewayConfigured, runOpenClawChat } from './openclaw-adapter.js';

export type DocumentAdvancedParseRequest = {
  prompt: string;
};

export type DocumentAdvancedParseResponse = {
  content: string;
  model: string;
  provider: 'openclaw-chat';
};

export type DocumentAdvancedParseProviderMode =
  | 'disabled'
  | 'openclaw-chat'
  | 'openclaw-skill';

type DocumentAdvancedParseProvider = {
  mode: DocumentAdvancedParseProviderMode;
  run(request: DocumentAdvancedParseRequest): Promise<DocumentAdvancedParseResponse | null>;
};

function buildSystemPrompt() {
  return [
    'You are a document-structuring assistant for a private enterprise knowledge base.',
    'Return strict JSON only. No markdown. No explanation.',
    'Use this schema:',
    '{"summary":"","topicTags":[],"riskLevel":"low|medium|high","evidenceBlocks":[{"title":"","text":""}],"entities":[{"text":"","type":"","confidence":0.8,"evidenceText":""}],"claims":[{"subject":"","predicate":"","object":"","confidence":0.8,"evidenceText":""}],"intentSlots":{"audiences":[],"ingredients":[],"strains":[],"benefits":[],"doses":[],"organizations":[],"metrics":[]}}',
    'Do not invent facts.',
    'Keep 3-8 high-value evidence blocks.',
    'Prefer professional signals for contracts, formulas, technical documents, resumes, and research papers.',
  ].join(' ');
}

export function resolveDocumentAdvancedParseProviderMode(
  value = process.env.DOCUMENT_DEEP_PARSE_PROVIDER || 'openclaw-chat',
): DocumentAdvancedParseProviderMode {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'disabled') return 'disabled';
  if (normalized === 'openclaw-skill') return 'openclaw-skill';
  return 'openclaw-chat';
}

function buildDisabledProvider(): DocumentAdvancedParseProvider {
  return {
    mode: 'disabled',
    async run() {
      return null;
    },
  };
}

function buildOpenClawChatProvider(): DocumentAdvancedParseProvider {
  return {
    mode: 'openclaw-chat',
    async run(request) {
      if (!isOpenClawGatewayConfigured()) {
        return null;
      }

      const result = await runOpenClawChat({
        prompt: request.prompt,
        systemPrompt: buildSystemPrompt(),
      });

      return {
        content: result.content,
        model: result.model,
        provider: 'openclaw-chat',
      };
    },
  };
}

function buildOpenClawSkillProvider(): DocumentAdvancedParseProvider {
  return {
    mode: 'openclaw-skill',
    async run() {
      // Reserved for project-side workspace skill integration.
      // We deliberately keep this branch outside OpenClaw core so upgrades remain frictionless.
      return null;
    },
  };
}

export function getDocumentAdvancedParseProviderMode() {
  return resolveDocumentAdvancedParseProviderMode();
}

export function getDocumentAdvancedParseProvider(
  mode = resolveDocumentAdvancedParseProviderMode(),
): DocumentAdvancedParseProvider {
  if (mode === 'disabled') return buildDisabledProvider();
  if (mode === 'openclaw-skill') return buildOpenClawSkillProvider();
  return buildOpenClawChatProvider();
}

export async function runDocumentAdvancedParse(
  request: DocumentAdvancedParseRequest,
  options?: { mode?: DocumentAdvancedParseProviderMode },
): Promise<DocumentAdvancedParseResponse | null> {
  const provider = getDocumentAdvancedParseProvider(options?.mode);
  return provider.run(request);
}
