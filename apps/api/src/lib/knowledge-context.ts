import { loadDocumentLibraries, type DocumentLibrary } from './document-libraries.js';
import type { ParsedDocument } from './document-parser.js';
import { loadParsedDocuments, matchDocumentEvidenceByPrompt, matchDocumentsByPrompt } from './document-store.js';
import { buildPromptForScoring, collectLibraryMatches } from './knowledge-plan.js';

type ChatHistoryItem = { role: 'user' | 'assistant'; content: string };

const DOCUMENT_DETAIL_PATTERNS = [
  /刚上传/,
  /最近上传/,
  /上传的文档/,
  /上传的文件/,
  /这份文档/,
  /这个文档/,
  /这个文件/,
  /这份材料/,
  /该文档/,
  /该文件/,
  /文档里/,
  /材料里/,
  /文件里/,
  /详细看/,
  /仔细看/,
  /详细阅读/,
  /认真读/,
  /看看.*文档/,
  /查看.*文档/,
  /根据.*文档/,
  /按.*文档/,
];

const DETAIL_QUESTION_PATTERNS =
  /(细节|详细|具体|条款|参数|内容|依据|原文|证据|章节|接口|字段|学历|公司|日期|金额|结论)/;

const RECENT_UPLOAD_LIBRARY_PATTERNS =
  /(最近上传|刚上传|这份文档|这个文件|这些材料|这批文档|这批材料)/;

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
      '普通问答可优先参考这些材料的详细摘要、结构化重点和证据。',
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
  const hasRecentIngestContext = /(上传完成|涉及材料|入库|摘要|文档类型|知识库|解析)/.test(historyJoined);
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
