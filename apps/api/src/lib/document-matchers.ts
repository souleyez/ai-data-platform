import type { ParsedDocument } from './document-parser.js';
import type { DocumentEvidenceMatch } from './document-matchers-types.js';
import {
  buildCanonicalDocKey,
  buildDocumentId,
  containsAnyKeyword,
  detectPromptIntent,
  extractExplicitIdentifiers,
  extractPromptKeywords,
  extractStrongKeywords,
  isPlatformInternalDocumentPath,
  looksLikeResumeDocument,
} from './document-matchers-support.js';
import { scoreChunkMatch, scoreDocumentMatch } from './document-matchers-scoring.js';

export type { DocumentEvidenceMatch } from './document-matchers-types.js';
export { buildDocumentId } from './document-matchers-support.js';

export function matchDocumentsByPrompt(items: ParsedDocument[], prompt: string, limit = Number.POSITIVE_INFINITY) {
  const keywords = extractPromptKeywords(prompt);
  if (!keywords.length) return [];
  const promptIntent = detectPromptIntent(keywords);
  const strongKeywords = extractStrongKeywords(keywords);
  const explicitIdentifiers = extractExplicitIdentifiers(prompt);

  return items
    .filter((item) => !isPlatformInternalDocumentPath(item.path))
    .map((item) => {
      const searchable = [item.name, item.title, item.summary, item.excerpt, (item.topicTags || []).join(' ')]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const blockedByIdentifier = explicitIdentifiers.length > 0 && !containsAnyKeyword(searchable, explicitIdentifiers);
      const blockedByStrongKeyword = strongKeywords.length > 0 && !containsAnyKeyword(searchable, strongKeywords);
      return { item, score: (blockedByIdentifier || blockedByStrongKeyword) ? 0 : scoreDocumentMatch(item, keywords, promptIntent) };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Number.isFinite(limit) ? limit : undefined)
    .map((entry) => entry.item);
}

export function matchDocumentEvidenceByPrompt(items: ParsedDocument[], prompt: string, limit = Number.POSITIVE_INFINITY) {
  const keywords = extractPromptKeywords(prompt);
  if (!keywords.length) return [] as DocumentEvidenceMatch[];
  const promptIntent = detectPromptIntent(keywords);
  const strongKeywords = extractStrongKeywords(keywords);
  const explicitIdentifiers = extractExplicitIdentifiers(prompt);

  const ranked = items
    .filter((item) => !isPlatformInternalDocumentPath(item.path))
    .flatMap((item) => {
      const docScore = scoreDocumentMatch(item, keywords, promptIntent);
      const searchable = [item.name, item.title, item.summary, item.excerpt, (item.topicTags || []).join(' ')]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (explicitIdentifiers.length > 0 && !containsAnyKeyword(searchable, explicitIdentifiers)) {
        return [];
      }
      if (strongKeywords.length > 0 && !containsAnyKeyword(searchable, strongKeywords)) {
        return [];
      }
      const chunks = item.evidenceChunks?.length
        ? item.evidenceChunks
        : [{ id: 'excerpt', text: item.excerpt || item.summary || '', charLength: (item.excerpt || item.summary || '').length, order: 0 }];

      return chunks
        .map((chunk) => ({
          item,
          chunkId: chunk.id,
          chunkText: chunk.text,
          score: docScore + scoreChunkMatch(chunk.text, keywords) - Math.min(chunk.order, 6),
        }))
        .filter((entry) => entry.score > 0);
    })
    .sort((a, b) => b.score - a.score);

  const deduped: DocumentEvidenceMatch[] = [];
  const seenDocKeys = new Set<string>();
  for (const entry of ranked) {
    const docKey = buildCanonicalDocKey(entry.item);
    if (seenDocKeys.has(docKey)) continue;
    seenDocKeys.add(docKey);
    deduped.push(entry);
    if (Number.isFinite(limit) && deduped.length >= limit) break;
  }

  return deduped;
}

export function matchResumeDocuments(items: ParsedDocument[], prompt: string, limit = 30) {
  const keywords = extractPromptKeywords(prompt);
  return items
    .filter((item) => looksLikeResumeDocument(item))
    .map((item) => ({
      item,
      score: scoreDocumentMatch(item, keywords, 'mixed') + (item.resumeFields ? 12 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.item);
}
