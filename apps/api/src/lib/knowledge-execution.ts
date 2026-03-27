import { retrieveKnowledgeMatches } from './document-retrieval.js';
import { documentMatchesLibrary, loadDocumentLibraries } from './document-libraries.js';
import { loadParsedDocuments } from './document-store.js';
import { buildKnowledgeContext, buildKnowledgeRetrievalQuery, buildLibraryFallbackRetrieval } from './knowledge-evidence.js';
import { buildKnowledgeMissMessage, buildReportInstruction, normalizeReportOutput, type ChatOutput } from './knowledge-output.js';
import { buildPromptForScoring, collectLibraryMatches, detectOutputKind } from './knowledge-plan.js';
import {
  buildKnowledgeTemplateInstruction,
  buildTemplateContextBlock,
  buildTemplateSearchHints,
  inferTemplateTaskHint,
  selectKnowledgeTemplates,
} from './knowledge-template.js';
import { runOpenClawChat } from './openclaw-adapter.js';

export type KnowledgeExecutionInput = {
  prompt: string;
  confirmedRequest?: string;
  preferredLibraries?: Array<{ key: string; label: string }>;
  sessionUser?: string;
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
};

export type KnowledgeExecutionResult = {
  libraries: Array<{ key: string; label: string }>;
  output: ChatOutput;
  content: string;
  intent: 'report';
  mode: 'openclaw';
};

export async function executeKnowledgeOutput(input: KnowledgeExecutionInput): Promise<KnowledgeExecutionResult> {
  const requestText = String(input.confirmedRequest || input.prompt).trim();
  const requestedKind = detectOutputKind(requestText) || 'table';
  const [documentLibraries, documentState] = await Promise.all([
    loadDocumentLibraries(),
    loadParsedDocuments(240, false),
  ]);

  const preferredLibraries = Array.isArray(input.preferredLibraries)
    ? input.preferredLibraries
        .map((item) => ({ key: String(item?.key || '').trim(), label: String(item?.label || '').trim() }))
        .filter((item) => item.key || item.label)
    : [];

  const preferredKeys = new Set(preferredLibraries.map((item) => item.key));
  const preferredLabels = new Set(preferredLibraries.map((item) => item.label));
  const explicitCandidates = preferredKeys.size || preferredLabels.size
    ? documentLibraries
        .filter((library) => preferredKeys.has(library.key) || preferredLabels.has(library.label))
        .map((library, index) => ({ library, score: 100 - index }))
    : [];
  const scoredCandidates = collectLibraryMatches(buildPromptForScoring(requestText, input.chatHistory), documentLibraries);
  const candidates = explicitCandidates.length ? explicitCandidates : scoredCandidates;
  const libraries = candidates.map((item) => ({ key: item.library.key, label: item.library.label }));
  const selectedTemplates = await selectKnowledgeTemplates(libraries, requestedKind);
  const templateTaskHint = inferTemplateTaskHint(selectedTemplates, requestedKind);
  const templateSearchHints = buildTemplateSearchHints(selectedTemplates);

  const scopedItems = candidates.length
    ? documentState.items.filter((item) =>
        candidates.some((candidate) => documentMatchesLibrary(item, candidate.library)),
      )
    : [];

  const retrieval = await retrieveKnowledgeMatches(
    scopedItems,
    buildKnowledgeRetrievalQuery(requestText, libraries),
    { docLimit: 8, evidenceLimit: 10, templateTaskHint, templateSearchHints },
  );

  const effectiveRetrieval =
    retrieval.documents.length || retrieval.evidenceMatches.length
      ? retrieval
      : buildLibraryFallbackRetrieval(scopedItems);

  if (!effectiveRetrieval.documents.length) {
    const content = buildKnowledgeMissMessage(libraries);
    return {
      libraries,
      output: { type: 'answer', content },
      content,
      intent: 'report',
      mode: 'openclaw',
    };
  }

  const templateInstruction = await buildKnowledgeTemplateInstruction(libraries, requestedKind);
  const templateContext = buildTemplateContextBlock(selectedTemplates);
  const cloud = await runOpenClawChat({
    prompt: requestText,
    sessionUser: input.sessionUser,
    chatHistory: input.chatHistory,
    contextBlocks: [
      templateContext,
      buildKnowledgeContext(requestText, libraries, effectiveRetrieval),
    ].filter(Boolean),
    systemPrompt: [
      '你是 AI智能服务 中负责按知识库生成结果的助手。',
      '用户已经明确要求按知识库输出，请严格以提供的知识库证据为主。',
      '不要脱离知识库自由发挥。',
      '如果证据不足，只能有限补充，并在内容里保持克制。',
      templateInstruction,
      buildReportInstruction(requestedKind),
    ].filter(Boolean).join('\n'),
  });

  const output = normalizeReportOutput(
    requestedKind,
    requestText,
    cloud.content,
    selectedTemplates[0]?.envelope || null,
  );

  return {
    libraries,
    output,
    content: output.content,
    intent: 'report',
    mode: 'openclaw',
  };
}
