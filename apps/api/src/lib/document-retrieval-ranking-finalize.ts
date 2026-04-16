import type { ParsedDocument } from './document-parser.js';
import type { DocumentEvidenceMatch } from './document-store.js';
import {
  type RetrievalIntent,
  type TemplateTask,
  isBidTemplateCandidate,
  isFootfallTemplateCandidate,
  isIotTemplateCandidate,
  isOrderTemplateCandidate,
  isPurePaperCandidate,
  isReliableResumeCandidate,
  isStoredKnowledgeDocument,
} from './document-retrieval-template-candidates.js';
import {
  scoreEvidenceTemplateFit,
  scoreProfileFit,
  scoreSchemaFit,
} from './document-retrieval-ranking-scoring.js';

export function buildFallbackEvidenceFromDocuments(documents: ParsedDocument[], templateTask: TemplateTask, evidenceLimit: number): DocumentEvidenceMatch[] {
  return documents
    .flatMap((item) =>
      (item.evidenceChunks || []).map((chunk, index) => ({
        item,
        chunkId: chunk.id,
        chunkText: String(chunk.text || '').trim(),
        score: Math.max(1, (item.evidenceChunks?.length || 0) - index),
      })),
    )
    .filter((entry) => entry.chunkText)
    .sort((a, b) => scoreEvidenceTemplateFit(b, '', templateTask) - scoreEvidenceTemplateFit(a, '', templateTask))
    .slice(0, evidenceLimit);
}

export function rerankDocuments(
  documents: ParsedDocument[],
  evidenceMatches: DocumentEvidenceMatch[],
  prompt: string,
  intent: RetrievalIntent,
  templateTask: TemplateTask,
  limit: number,
  vectorScores?: Map<string, number>,
) {
  const evidenceScoreByPath = new Map<string, number>();
  for (const match of evidenceMatches) {
    evidenceScoreByPath.set(match.item.path, Math.max(evidenceScoreByPath.get(match.item.path) || 0, match.score));
  }

  return [...documents]
    .map((item) => ({
      item,
      score:
        (evidenceScoreByPath.get(item.path) || 0) * 2.2
        + (vectorScores?.get(item.path) || 0) * 1.6
        + scoreSchemaFit(item, prompt, intent, templateTask)
        + scoreProfileFit(item, prompt, templateTask)
        + (item.parseStage === 'detailed' ? 6 : 0)
        + ((item.evidenceChunks?.length || 0) > 0 ? 2 : 0),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((entry) => entry.item);
}

export function finalizeDocuments(documents: ParsedDocument[], intent: RetrievalIntent, templateTask: TemplateTask, limit: number) {
  if (templateTask === 'resume-comparison') {
    const resumes = documents.filter((item) => isReliableResumeCandidate(item));
    return (resumes.length ? resumes : documents).slice(0, limit);
  }
  if (templateTask === 'technical-summary') {
    const stored = documents.filter((item) => item.schemaType === 'technical' && isStoredKnowledgeDocument(item));
    const reliable = documents.filter((item) => item.schemaType === 'technical');
    return (stored.length ? stored : reliable.length ? reliable : documents).slice(0, limit);
  }
  if (templateTask === 'order-static-page') {
    const orderDocs = documents.filter((item) => isOrderTemplateCandidate(item));
    return orderDocs.slice(0, limit);
  }
  if (templateTask === 'footfall-static-page') {
    const footfallDocs = documents.filter((item) => isFootfallTemplateCandidate(item));
    return (footfallDocs.length ? footfallDocs : documents).slice(0, limit);
  }
  if (templateTask === 'iot-static-page' || templateTask === 'iot-table') {
    const iotDocs = documents.filter((item) => isIotTemplateCandidate(item));
    return (iotDocs.length ? iotDocs : documents).slice(0, limit);
  }
  if (templateTask === 'bids-table' || templateTask === 'bids-static-page') {
    const bidDocs = documents.filter((item) => isBidTemplateCandidate(item));
    return bidDocs.slice(0, limit);
  }
  if (templateTask === 'paper-summary' || templateTask === 'paper-static-page' || templateTask === 'paper-table') {
    const papers = documents.filter((item) => isPurePaperCandidate(item));
    return (papers.length ? papers : documents).slice(0, limit);
  }
  if (intent === 'paper') {
    const papers = documents.filter((item) => isPurePaperCandidate(item));
    return (papers.length ? papers : documents).slice(0, limit);
  }
  return documents.slice(0, limit);
}
