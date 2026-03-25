import type { ParsedDocument } from './document-parser.js';
import {
  matchDocumentEvidenceByPrompt,
  matchDocumentsByPrompt,
  type DocumentEvidenceMatch,
} from './document-store.js';

export type RetrievalStage = 'rule' | 'vector' | 'rerank';

export type RetrievalResult = {
  documents: ParsedDocument[];
  evidenceMatches: DocumentEvidenceMatch[];
  meta: {
    stages: RetrievalStage[];
    vectorEnabled: boolean;
    candidateCount: number;
    rerankedCount: number;
  };
};

const VECTOR_RETRIEVAL_ENABLED = process.env.ENABLE_VECTOR_RETRIEVAL === '1';

function normalizePrompt(prompt: string) {
  return String(prompt || '').trim().toLowerCase();
}

function containsAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function collectPromptTokens(prompt: string) {
  const text = normalizePrompt(prompt);
  if (!text) return [];

  const asciiTokens = text
    .split(/[^a-z0-9]+/i)
    .filter((entry) => entry.length >= 2);

  const cjkTokens: string[] = [];
  const compact = text.replace(/\s+/g, '');
  for (let index = 0; index < compact.length - 1; index += 1) {
    const slice = compact.slice(index, index + 2);
    if (/[\u4e00-\u9fff]{2}/.test(slice)) cjkTokens.push(slice);
  }

  return [...new Set([...asciiTokens, ...cjkTokens])].slice(0, 24);
}

function scoreSchemaFit(item: ParsedDocument, prompt: string) {
  const text = normalizePrompt(prompt);
  let score = 0;

  if (item.schemaType === 'resume' && containsAny(text, ['简历', '候选人', '应聘', '招聘', '人才', 'resume', 'cv'])) score += 14;
  if (item.schemaType === 'contract' && containsAny(text, ['合同', '条款', '付款', '回款', '法务', '违约', 'contract'])) score += 14;
  if (item.schemaType === 'paper' && containsAny(text, ['论文', '研究', '实验', '文献', 'paper', 'study', 'trial'])) score += 12;
  if (item.schemaType === 'technical' && containsAny(text, ['技术', '接口', '部署', '系统', '方案', 'api', 'architecture'])) score += 10;
  if (item.schemaType === 'report' && containsAny(text, ['日报', '周报', '月报', '复盘', 'report'])) score += 10;
  if (item.schemaType === 'formula' && containsAny(text, ['配方', '奶粉', '菌株', '营养', 'formula'])) score += 12;

  return score;
}

function scoreProfileFit(item: ParsedDocument, prompt: string) {
  const profile = item.structuredProfile || {};
  const haystack = JSON.stringify(profile).toLowerCase();
  const tokens = collectPromptTokens(prompt);
  if (!haystack || !tokens.length) return 0;

  let score = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) score += token.length >= 4 ? 4 : 2;
  }
  return score;
}

function rerankDocuments(documents: ParsedDocument[], evidenceMatches: DocumentEvidenceMatch[], prompt: string, limit = 18) {
  const evidenceScoreByPath = new Map<string, number>();
  for (const match of evidenceMatches) {
    evidenceScoreByPath.set(match.item.path, Math.max(evidenceScoreByPath.get(match.item.path) || 0, match.score));
  }

  return [...documents]
    .map((item) => ({
      item,
      score:
        (evidenceScoreByPath.get(item.path) || 0) * 2
        + scoreSchemaFit(item, prompt)
        + scoreProfileFit(item, prompt)
        + (item.parseStage === 'detailed' ? 6 : 0)
        + ((item.evidenceChunks?.length || 0) > 0 ? 2 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.item);
}

export function retrieveKnowledgeMatches(
  items: ParsedDocument[],
  prompt: string,
  options?: { docLimit?: number; evidenceLimit?: number },
): RetrievalResult {
  const docLimit = options?.docLimit || 18;
  const evidenceLimit = options?.evidenceLimit || 24;
  const ruleDocuments = matchDocumentsByPrompt(items, prompt, Math.max(docLimit, 24));
  const ruleEvidence = matchDocumentEvidenceByPrompt(items, prompt, Math.max(evidenceLimit, 32));
  const rerankedDocuments = rerankDocuments(ruleDocuments, ruleEvidence, prompt, docLimit);
  const rerankedPathSet = new Set(rerankedDocuments.map((item) => item.path));
  const rerankedEvidence = ruleEvidence
    .filter((entry) => rerankedPathSet.has(entry.item.path))
    .sort((a, b) => b.score - a.score)
    .slice(0, evidenceLimit);

  return {
    documents: rerankedDocuments,
    evidenceMatches: rerankedEvidence,
    meta: {
      stages: VECTOR_RETRIEVAL_ENABLED ? ['rule', 'vector', 'rerank'] : ['rule', 'rerank'],
      vectorEnabled: VECTOR_RETRIEVAL_ENABLED,
      candidateCount: ruleDocuments.length,
      rerankedCount: rerankedDocuments.length,
    },
  };
}
