import type { ParsedDocument } from './document-parser.js';
import {
  matchDocumentEvidenceByPrompt,
  matchDocumentsByPrompt,
  type DocumentEvidenceMatch,
} from './document-store.js';
import { searchDocumentVectorIndex } from './document-vector-index.js';
import {
  buildFallbackEvidenceFromDocuments,
  finalizeDocuments,
  matchesTemplateTask,
  preselectDocumentsByTemplateTask,
  preselectEvidencePoolByTemplateTask,
  rerankDocuments,
  scoreEvidenceTemplateFit,
  selectTemplateCandidates,
} from './document-retrieval-candidates.js';
import {
  detectRetrievalIntent,
  detectTemplateTask,
  expandPromptBySchema,
} from './document-retrieval-heuristics.js';

export type RetrievalStage = 'rule' | 'vector' | 'rerank';
export type RetrievalIntent = 'generic' | 'formula' | 'paper' | 'technical' | 'contract' | 'resume' | 'iot' | 'footfall';
export type TemplateTask =
  | 'general'
  | 'resume-comparison'
  | 'formula-table'
  | 'formula-static-page'
  | 'bids-table'
  | 'bids-static-page'
  | 'footfall-static-page'
  | 'paper-table'
  | 'paper-static-page'
  | 'paper-summary'
  | 'technical-summary'
  | 'contract-risk'
  | 'order-static-page'
  | 'iot-table'
  | 'iot-static-page'
  | 'static-page';

export type RetrievalResult = {
  documents: ParsedDocument[];
  evidenceMatches: DocumentEvidenceMatch[];
  meta: {
    stages: RetrievalStage[];
    vectorEnabled: boolean;
    candidateCount: number;
    rerankedCount: number;
    intent: RetrievalIntent;
    templateTask: TemplateTask;
  };
};

const VECTOR_RETRIEVAL_ENABLED = process.env.ENABLE_VECTOR_RETRIEVAL !== '0';

export async function retrieveKnowledgeMatches(
  items: ParsedDocument[],
  prompt: string,
  options?: { docLimit?: number; evidenceLimit?: number; templateTaskHint?: TemplateTask; templateSearchHints?: string[] },
): Promise<RetrievalResult> {
  const templateHintPrompt = (options?.templateSearchHints || []).slice(0, 24).join(' ');
  const expandedPrompt = expandPromptBySchema([prompt, templateHintPrompt].filter(Boolean).join(' '));
  const intent = detectRetrievalIntent(expandedPrompt);
  const templateTask = options?.templateTaskHint || detectTemplateTask(expandedPrompt);
  const docLimit = options?.docLimit || 18;
  const evidenceLimit = options?.evidenceLimit || 24;

  const preselectedItems = preselectDocumentsByTemplateTask(items, templateTask, expandedPrompt);
  const evidencePool = preselectEvidencePoolByTemplateTask(preselectedItems, templateTask);

  const ruleDocuments = matchDocumentsByPrompt(preselectedItems, expandedPrompt, Math.max(docLimit, 24));
  const ruleEvidence = matchDocumentEvidenceByPrompt(evidencePool, expandedPrompt, Math.max(evidenceLimit, 32));
  const templateDocuments = selectTemplateCandidates(preselectedItems, templateTask).slice(0, Math.max(docLimit, 24));

  const vectorHits = VECTOR_RETRIEVAL_ENABLED
    ? await searchDocumentVectorIndex(expandedPrompt, Math.max(docLimit, 24), { intent, templateTask })
    : [];

  const itemByPath = new Map(preselectedItems.map((item) => [item.path, item]));
  const vectorDocuments = vectorHits
    .map((hit) => itemByPath.get(hit.documentPath))
    .filter((item): item is ParsedDocument => Boolean(item));
  const vectorScores = new Map(vectorHits.map((hit) => [hit.documentPath, hit.score]));

  const combinedDocuments = [
    ...new Map([...ruleDocuments, ...templateDocuments, ...vectorDocuments].map((item) => [item.path, item])).values(),
  ];

  const rerankedDocuments = rerankDocuments(
    combinedDocuments,
    ruleEvidence,
    expandedPrompt,
    intent,
    templateTask,
    Math.max(docLimit, 24),
    vectorScores,
  );
  const finalDocuments = finalizeDocuments(rerankedDocuments, intent, templateTask, docLimit);

  const rerankedPathSet = new Set(finalDocuments.map((item) => item.path));
  let rerankedEvidence = ruleEvidence
    .filter((entry) => rerankedPathSet.has(entry.item.path))
    .filter((entry) => (templateTask === 'general' ? true : matchesTemplateTask(entry.item, templateTask)))
    .sort((left, right) => scoreEvidenceTemplateFit(right, expandedPrompt, templateTask) - scoreEvidenceTemplateFit(left, expandedPrompt, templateTask))
    .slice(0, evidenceLimit);

  if (!rerankedEvidence.length && finalDocuments.length) {
    rerankedEvidence = buildFallbackEvidenceFromDocuments(finalDocuments, templateTask, evidenceLimit);
  }

  rerankedEvidence = rerankedEvidence.map((entry) => ({
    ...entry,
    chunkText: typeof entry.chunkText === 'string'
      ? entry.chunkText
      : typeof (entry.chunkText as any)?.text === 'string'
        ? (entry.chunkText as any).text
        : String(entry.chunkText || ''),
  }));

  return {
    documents: finalDocuments,
    evidenceMatches: rerankedEvidence,
    meta: {
      stages: VECTOR_RETRIEVAL_ENABLED ? ['rule', 'vector', 'rerank'] : ['rule', 'rerank'],
      vectorEnabled: VECTOR_RETRIEVAL_ENABLED,
      candidateCount: combinedDocuments.length,
      rerankedCount: finalDocuments.length,
      intent,
      templateTask,
    },
  };
}
