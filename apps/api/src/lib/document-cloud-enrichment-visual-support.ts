import type { EvidenceChunk, ParsedDocument } from './document-parser.js';
import {
  normalizeDocumentImageFieldCandidateKey,
  type DocumentImageVlmFieldCandidate,
  type DocumentImageVlmPayload,
} from './document-image-vlm-provider.js';
import {
  clampConfidence,
  findEvidenceChunkIdByText,
  hasStructuredValue,
  sanitizeText,
  uniqStrings,
} from './document-cloud-enrichment-common.js';

function extractImageFieldAliases(item: ParsedDocument) {
  const template = item.structuredProfile && typeof item.structuredProfile === 'object' && !Array.isArray(item.structuredProfile)
    ? item.structuredProfile.fieldTemplate as Record<string, unknown> | undefined
    : undefined;
  if (!template?.fieldAliases || typeof template.fieldAliases !== 'object' || Array.isArray(template.fieldAliases)) {
    return {};
  }
  return template.fieldAliases as Record<string, string>;
}

function normalizeImageFieldCandidateValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  const text = String(value ?? '').trim();
  return text || '';
}

export function normalizeImageFieldCandidates(item: ParsedDocument, incoming: DocumentImageVlmFieldCandidate[] | undefined) {
  const aliases = extractImageFieldAliases(item);
  const normalized: Array<{
    key: string;
    value: string | string[];
    confidence: number;
    source: 'vlm';
    evidenceText: string;
  }> = [];

  for (const entry of incoming || []) {
    const key = normalizeDocumentImageFieldCandidateKey(entry?.key, aliases);
    if (!key) continue;
    const value = normalizeImageFieldCandidateValue(entry?.value);
    if (!hasStructuredValue(value)) continue;
    normalized.push({
      key,
      value,
      confidence: clampConfidence(entry?.confidence, 0.72),
      source: 'vlm',
      evidenceText: sanitizeText(entry?.evidenceText, 500),
    });
  }

  return normalized;
}

function mergeStringArray(current: string[] | undefined, incoming: unknown) {
  const next = Array.isArray(incoming)
    ? incoming.map((item) => String(item || '').trim()).filter(Boolean)
    : String(incoming || '').split(/[,\n/|；;、]/).map((item) => item.trim()).filter(Boolean);
  return [...new Set([...(current || []), ...next])];
}

export function assignCandidateFields(item: ParsedDocument, candidates: Array<{ key: string; value: unknown }>) {
  const next = {
    ...item,
    contractFields: { ...(item.contractFields || {}) },
    enterpriseGuidanceFields: { ...(item.enterpriseGuidanceFields || {}) },
    orderFields: { ...(item.orderFields || {}) },
    resumeFields: { ...(item.resumeFields || {}) },
  };

  for (const candidate of candidates) {
    const key = candidate.key;
    const value = candidate.value;
    if (!hasStructuredValue(value)) continue;
    if (['contractNo', 'partyA', 'partyB', 'amount', 'signDate', 'effectiveDate', 'paymentTerms', 'duration'].includes(key)) {
      if (!hasStructuredValue((next.contractFields as Record<string, unknown>)[key])) {
        (next.contractFields as Record<string, unknown>)[key] = value;
      }
      continue;
    }
    if (['businessSystem', 'documentKind', 'applicableScope', 'operationEntry'].includes(key)) {
      if (!hasStructuredValue((next.enterpriseGuidanceFields as Record<string, unknown>)[key])) {
        (next.enterpriseGuidanceFields as Record<string, unknown>)[key] = value;
      }
      continue;
    }
    if (['approvalLevels', 'policyFocus', 'contacts'].includes(key)) {
      const current = (next.enterpriseGuidanceFields as Record<string, unknown>)[key];
      (next.enterpriseGuidanceFields as Record<string, unknown>)[key] = mergeStringArray(Array.isArray(current) ? current.map((entry) => String(entry || '')) : [], value);
      continue;
    }
    if (['period', 'platform', 'orderCount', 'netSales', 'grossMargin', 'topCategory', 'inventoryStatus', 'replenishmentAction'].includes(key)) {
      if (!hasStructuredValue((next.orderFields as Record<string, unknown>)[key])) {
        (next.orderFields as Record<string, unknown>)[key] = value;
      }
      continue;
    }
    if (['candidateName', 'targetRole', 'currentRole', 'yearsOfExperience', 'education', 'major', 'expectedCity', 'expectedSalary', 'latestCompany'].includes(key)) {
      if (!hasStructuredValue((next.resumeFields as Record<string, unknown>)[key])) {
        (next.resumeFields as Record<string, unknown>)[key] = value;
      }
      continue;
    }
    if (['companies', 'skills', 'highlights', 'projectHighlights', 'itProjectHighlights'].includes(key)) {
      const current = (next.resumeFields as Record<string, unknown>)[key];
      (next.resumeFields as Record<string, unknown>)[key] = mergeStringArray(Array.isArray(current) ? current.map((entry) => String(entry || '')) : [], value);
    }
  }

  return next;
}

export function buildImageStructuredFieldDetails(
  item: ParsedDocument,
  candidates: Array<{
    key: string;
    value: unknown;
    confidence: number;
    source: 'vlm';
    evidenceText: string;
  }>,
  evidenceChunks: EvidenceChunk[] | undefined,
) {
  const existing = item.structuredProfile && typeof item.structuredProfile === 'object' && !Array.isArray(item.structuredProfile)
    ? (item.structuredProfile.fieldDetails as Record<string, unknown> | undefined)
    : undefined;
  const next: Record<string, unknown> = { ...(existing || {}) };

  for (const candidate of candidates) {
    if (!candidate.key || !hasStructuredValue(candidate.value)) continue;
    if (next[candidate.key]) continue;
    next[candidate.key] = {
      value: candidate.value,
      confidence: candidate.confidence,
      source: candidate.source,
      evidenceChunkId: findEvidenceChunkIdByText(evidenceChunks, candidate.evidenceText),
    };
  }

  return next;
}

export function buildImageStructuredTopLevelFields(
  currentProfile: Record<string, unknown>,
  candidates: Array<{ key: string; value: unknown }>,
) {
  const next: Record<string, unknown> = {};
  for (const candidate of candidates) {
    if (!candidate.key || !hasStructuredValue(candidate.value)) continue;
    if (hasStructuredValue(currentProfile[candidate.key])) continue;
    next[candidate.key] = candidate.value;
  }
  return next;
}

export function buildImageUnderstandingPayload(
  structured: DocumentImageVlmPayload,
  candidates: Array<{
    key: string;
    value: unknown;
    confidence: number;
    source: 'vlm';
    evidenceText: string;
  }>,
) {
  return {
    documentKind: sanitizeText(structured.documentKind, 120),
    layoutType: sanitizeText(structured.layoutType, 120),
    visualSummary: sanitizeText(structured.visualSummary || structured.summary, 600),
    chartOrTableDetected: Boolean(structured.chartOrTableDetected),
    tableLikeSignals: uniqStrings((structured.tableLikeSignals || []).map((entry) => sanitizeText(entry, 120))),
    extractedFields: Object.fromEntries(
      candidates
        .filter((entry) => entry.key && hasStructuredValue(entry.value))
        .map((entry) => [entry.key, entry.value]),
    ),
  };
}

export function buildImageFullText(item: ParsedDocument, structured: DocumentImageVlmPayload) {
  const transcribedText = sanitizeText(structured.transcribedText, 6000);
  const visualSummary = sanitizeText(structured.visualSummary, 1000);
  const blocks = [
    `Image file: ${item.name}`,
    visualSummary ? `Visual summary:\n${visualSummary}` : '',
    transcribedText ? `Visual transcription:\n${transcribedText}` : '',
  ].filter(Boolean);
  return blocks.join('\n\n');
}
