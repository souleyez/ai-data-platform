import { loadDocumentLibraries, type DocumentLibrary } from './document-libraries.js';
import type { ParsedDocument } from './document-parser.js';
import { loadParsedDocuments, matchDocumentEvidenceByPrompt, matchDocumentsByPrompt } from './document-store.js';
import { buildPromptForScoring, collectLibraryMatches } from './knowledge-plan.js';

type ChatHistoryItem = { role: 'user' | 'assistant'; content: string };

const DOCUMENT_DETAIL_PATTERNS = [
  /\u521a\u4e0a\u4f20/,
  /\u6700\u8fd1\u4e0a\u4f20/,
  /\u4e0a\u4f20\u7684\u6587\u6863/,
  /\u4e0a\u4f20\u7684\u6587\u4ef6/,
  /\u8fd9\u4efd\u6587\u6863/,
  /\u8fd9\u4e2a\u6587\u6863/,
  /\u8fd9\u4e2a\u6587\u4ef6/,
  /\u8fd9\u4efd\u6750\u6599/,
  /\u8be5\u6587\u6863/,
  /\u8be5\u6587\u4ef6/,
  /\u6587\u6863\u91cc/,
  /\u6750\u6599\u91cc/,
  /\u6587\u4ef6\u91cc/,
  /\u8be6\u7ec6\u770b/,
  /\u4ed4\u7ec6\u770b/,
  /\u8be6\u7ec6\u9605\u8bfb/,
  /\u8ba4\u771f\u8bfb/,
  /\u770b\u770b.*\u6587\u6863/,
  /\u67e5\u770b.*\u6587\u6863/,
  /\u6839\u636e.*\u6587\u6863/,
  /\u6309.*\u6587\u6863/,
];

const DETAIL_QUESTION_PATTERNS =
  /\u7ec6\u8282|\u8be6\u7ec6|\u5177\u4f53|\u6761\u6b3e|\u53c2\u6570|\u5185\u5bb9|\u4f9d\u636e|\u539f\u6587|\u8bc1\u636e|\u7ae0\u8282|\u63a5\u53e3|\u5b57\u6bb5|\u5b66\u5386|\u516c\u53f8|\u65e5\u671f|\u91d1\u989d|\u7ed3\u8bba/;

const RECENT_UPLOAD_LIBRARY_PATTERNS =
  /\u6700\u8fd1\u4e0a\u4f20|\u521a\u4e0a\u4f20|\u8fd9\u4efd\u6587\u6863|\u8fd9\u4e2a\u6587\u4ef6|\u8fd9\u4e9b\u6750\u6599|\u8fd9\u6279\u6587\u6863|\u8fd9\u6279\u6750\u6599/;

function isUploadedDocument(item: ParsedDocument) {
  const target = `${item.path || ''} ${item.name || ''}`.toLowerCase();
  return target.includes('\\uploads\\') || target.includes('/uploads/');
}

function isDetailedParsedDocument(item: ParsedDocument) {
  return item.parseStatus === 'parsed'
    && (item.parseStage === 'detailed' || item.detailParseStatus === 'succeeded');
}

function extractDocumentTimestamp(item: ParsedDocument) {
  const candidates = [
    Date.parse(String(item.detailParsedAt || '')),
    Date.parse(String(item.cloudStructuredAt || '')),
    Date.parse(String(item.retainedAt || '')),
  ].filter((value) => Number.isFinite(value) && value > 0);

  const pathMatch = String(item.path || '').match(/(?:^|[\\/])(\d{13})(?:[-_.]|$)/);
  if (pathMatch) {
    const value = Number(pathMatch[1]);
    if (Number.isFinite(value) && value > 0) candidates.push(value);
  }

  return candidates.length ? Math.max(...candidates) : 0;
}

function sortDocumentsByRecency(items: ParsedDocument[]) {
  return [...items].sort((left, right) => {
    const leftDetailed = isDetailedParsedDocument(left) ? 1 : 0;
    const rightDetailed = isDetailedParsedDocument(right) ? 1 : 0;
    if (rightDetailed !== leftDetailed) return rightDetailed - leftDetailed;
    return extractDocumentTimestamp(right) - extractDocumentTimestamp(left);
  });
}

function extractDocumentFollowupKeywords(prompt: string) {
  const normalized = String(prompt || '').trim().toLowerCase();
  return normalized.match(/[a-z0-9][a-z0-9-]{1,}|[\u4e00-\u9fff]{2,}/g) ?? [];
}

function formatStructuredProfile(profile: ParsedDocument['structuredProfile']) {
  if (!profile || typeof profile !== 'object') return '';

  return Object.entries(profile)
    .flatMap(([key, value]) => {
      if (Array.isArray(value)) {
        const compact = value.map((entry) => String(entry || '').trim()).filter(Boolean).slice(0, 5);
        return compact.length ? [`${key}: ${compact.join('、')}`] : [];
      }
      if (value && typeof value === 'object') {
        const compact = Object.entries(value as Record<string, unknown>)
          .map(([entryKey, entryValue]) => `${entryKey}:${String(entryValue || '').trim()}`)
          .filter((entry) => !entry.endsWith(':'))
          .slice(0, 4);
        return compact.length ? [`${key}: ${compact.join('；')}`] : [];
      }
      const text = String(value || '').trim();
      return text ? [`${key}: ${text}`] : [];
    })
    .slice(0, 8)
    .join('\n');
}

function formatClaims(item: ParsedDocument, limit = 3) {
  return (item.claims || [])
    .slice(0, limit)
    .map((claim) => [claim.subject, claim.predicate, claim.object].filter(Boolean).join(' '))
    .filter(Boolean);
}

function formatEvidence(item: ParsedDocument, limit = 3) {
  return (item.evidenceChunks || [])
    .slice(0, limit)
    .map((chunk) => String(chunk?.text || '').trim())
    .filter(Boolean);
}

function buildCompactDocumentBlock(item: ParsedDocument, index: number) {
  const summary = String(item.summary || item.excerpt || '无摘要').trim();
  const profile = formatStructuredProfile(item.structuredProfile);
  const evidence = formatEvidence(item, 2);

  return [
    `文档 ${index + 1}: ${item.title || item.name}`,
    `类型: ${item.schemaType || item.category || 'generic'}`,
    `知识库: ${[...(item.confirmedGroups || []), ...(item.groups || [])].filter(Boolean).join('、') || '未分组'}`,
    `摘要: ${summary}`,
    profile ? `结构化重点:\n${profile}` : '',
    evidence.length ? `关键证据:\n${evidence.map((text, evidenceIndex) => `${evidenceIndex + 1}. ${text}`).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function buildDetailedDocumentBlock(item: ParsedDocument, index: number) {
  const claims = formatClaims(item, 4);
  return [
    buildCompactDocumentBlock(item, index),
    claims.length ? `关键结论:\n${claims.map((text, claimIndex) => `${claimIndex + 1}. ${text}`).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function buildRecentUploadedContextBlocks(documents: ParsedDocument[]) {
  if (!documents.length) return [];
  return [
    [
      '系统最近完成详细解析的上传文档如下。',
      '普通问答可以优先参考这些材料的详细摘要、结构化重点和证据。',
      ...documents.slice(0, 2).map((item, index) => buildCompactDocumentBlock(item, index)),
    ].join('\n\n'),
  ];
}

function buildDocumentDetailContextBlocks(prompt: string, documents: ParsedDocument[]) {
  if (!documents.length) return [];
  return [
    [
      `用户正在追问最近上传文档的细节，请优先依据下列详细解析结果回答。当前问题：${prompt}`,
      ...documents.slice(0, 3).map((item, index) => buildDetailedDocumentBlock(item, index)),
    ].join('\n\n'),
  ];
}

export function looksLikeDocumentDetailFollowup(prompt: string, chatHistory: ChatHistoryItem[]) {
  const text = String(prompt || '').trim();
  if (!text) return false;
  if (DOCUMENT_DETAIL_PATTERNS.some((pattern) => pattern.test(text))) return true;

  const keywords = extractDocumentFollowupKeywords(text);
  const historyJoined = chatHistory.map((item) => item.content).join('\n');
  const hasRecentIngestContext =
    /\u4e0a\u4f20\u5b8c\u6210|\u6d89\u53ca\u6750\u6599|\u5165\u5e93|\u6458\u8981|\u6587\u6863\u7c7b\u578b|\u77e5\u8bc6\u5e93|\u89e3\u6790/.test(historyJoined);
  return DETAIL_QUESTION_PATTERNS.test(text) && hasRecentIngestContext && keywords.length > 0;
}

export async function buildKnowledgeDocumentContext(prompt: string, chatHistory: ChatHistoryItem[]) {
  if (!looksLikeDocumentDetailFollowup(prompt, chatHistory)) {
    return { documents: [] as ParsedDocument[], contextBlocks: [] as string[] };
  }

  const { items } = await loadParsedDocuments(400, false);
  const uploadedDocuments = sortDocumentsByRecency(
    items.filter((item) => isUploadedDocument(item) && isDetailedParsedDocument(item)),
  );
  if (!uploadedDocuments.length) {
    return { documents: [], contextBlocks: [] };
  }

  const matchedDocuments = matchDocumentsByPrompt(uploadedDocuments, prompt, 3);
  const recentDocuments = matchedDocuments.length ? matchedDocuments : uploadedDocuments.slice(0, 6);
  const evidenceMatches = matchDocumentEvidenceByPrompt(recentDocuments, prompt, 3);
  const preferredDocuments = evidenceMatches.length ? evidenceMatches.map((entry) => entry.item) : recentDocuments;

  const dedupedDocuments: ParsedDocument[] = [];
  const seen = new Set<string>();
  for (const item of preferredDocuments) {
    if (seen.has(item.path)) continue;
    seen.add(item.path);
    dedupedDocuments.push(item);
    if (dedupedDocuments.length >= 3) break;
  }

  return {
    documents: dedupedDocuments,
    contextBlocks: buildDocumentDetailContextBlocks(prompt, dedupedDocuments),
  };
}

export async function buildRecentUploadedContext() {
  const { items } = await loadParsedDocuments(240, false);
  const uploadedDocuments = sortDocumentsByRecency(
    items.filter((item) => isUploadedDocument(item) && isDetailedParsedDocument(item)),
  ).slice(0, 2);

  return {
    documents: uploadedDocuments,
    contextBlocks: buildRecentUploadedContextBlocks(uploadedDocuments),
  };
}

export async function inferKnowledgeLibraries(
  prompt: string,
  chatHistory: ChatHistoryItem[],
  documentLibraries?: DocumentLibrary[],
) {
  const libraries = documentLibraries ?? await loadDocumentLibraries();
  const scored = collectLibraryMatches(buildPromptForScoring(prompt, chatHistory), libraries).map((item) => ({
    key: item.library.key,
    label: item.library.label,
  }));
  if (scored.length) return scored;

  if (!RECENT_UPLOAD_LIBRARY_PATTERNS.test(prompt)) {
    return [];
  }

  const { items } = await loadParsedDocuments(120, false);
  const uploaded = sortDocumentsByRecency(
    items.filter((item) => item.parseStatus === 'parsed' && isUploadedDocument(item)),
  ).slice(0, 8);
  const keyed = new Map<string, { key: string; label: string }>();

  for (const item of uploaded) {
    const groups = [...(item.confirmedGroups || []), ...(item.groups || [])].filter(Boolean);
    for (const group of groups) {
      const library = libraries.find((entry) => entry.key === group || entry.label === group);
      if (library && !keyed.has(library.key)) {
        keyed.set(library.key, { key: library.key, label: library.label });
      }
    }
  }

  return Array.from(keyed.values()).slice(0, 4);
}
