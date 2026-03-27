import { runOpenClawChat } from './openclaw-adapter.js';

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

function getProviderMode(): DocumentAdvancedParseProviderMode {
  const value = String(process.env.DOCUMENT_DEEP_PARSE_PROVIDER || 'openclaw-chat').trim().toLowerCase();
  if (value === 'disabled') return 'disabled';
  if (value === 'openclaw-skill') return 'openclaw-skill';
  return 'openclaw-chat';
}

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

export function getDocumentAdvancedParseProviderMode() {
  return getProviderMode();
}

export async function runDocumentAdvancedParse(request: DocumentAdvancedParseRequest): Promise<DocumentAdvancedParseResponse | null> {
  const mode = getProviderMode();
  if (mode === 'disabled') return null;

  if (mode === 'openclaw-skill') {
    // Reserved for project-side workspace skill integration.
    // We deliberately keep this branch outside OpenClaw core so upgrades remain frictionless.
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
}
