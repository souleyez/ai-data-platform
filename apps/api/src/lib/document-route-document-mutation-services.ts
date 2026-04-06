import path from 'node:path';
import { promises as fs } from 'node:fs';
import { loadDocumentLibraries } from './document-libraries.js';
import { type BizCategory } from './document-config.js';
import { type EvidenceChunk, refreshDerivedSchemaProfile, type ParsedDocument } from './document-parser.js';
import { readDocumentCache } from './document-cache-repository.js';
import { replaceDocumentKnowledgeSnapshot } from './document-knowledge-lifecycle.js';
import { removeDocumentOverrides, saveDocumentOverride } from './document-overrides.js';
import { removeDocumentsFromCache } from './document-store.js';
import { buildDocumentId } from './document-store.js';
import { dedupeDocuments, sortDocumentsByRecency } from './document-scan-runtime.js';
import { buildPreviewItemFromDocument } from './ingest-feedback.js';
import { removeRetainedDocument } from './retained-documents.js';
import { STORAGE_FILES_DIR } from './paths.js';
import { loadIndexedDocumentMap } from './document-route-loaders.js';

const VALID_BIZ_CATEGORIES: BizCategory[] = ['paper', 'contract', 'daily', 'invoice', 'order', 'service', 'inventory'];

function normalizeEditableText(value: unknown, field: string) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    throw new Error(`${field} is required`);
  }
  return normalized;
}

function normalizeStructuredProfile(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('structuredProfile must be an object');
  }
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function normalizeEvidenceChunks(value: unknown): EvidenceChunk[] {
  if (!Array.isArray(value)) {
    throw new Error('evidenceChunks must be an array');
  }

  return value.reduce<EvidenceChunk[]>((acc, entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return acc;
    }

    const text = String((entry as { text?: unknown }).text ?? '').trim();
    if (!text) return acc;

    const title = String((entry as { title?: unknown }).title ?? '').trim();
    const id = String((entry as { id?: unknown }).id ?? '').trim() || `manual-evidence-${index + 1}`;
    acc.push({
      id,
      order: acc.length + 1,
      text,
      charLength: text.length,
      ...(title ? { title } : {}),
    });
    return acc;
  }, []);
}

export async function saveConfirmedDocumentClassifications(
  updates: Array<{ id?: string; bizCategory?: BizCategory }>,
) {
  const libraries = await loadDocumentLibraries();
  const { byId } = await loadIndexedDocumentMap();
  const results = [] as Array<{ id: string; bizCategory: BizCategory; sourceName: string; confirmedAt: string }>;

  for (const update of updates) {
    const found = update.id ? byId.get(update.id) : null;
    if (!found || !update.bizCategory || !VALID_BIZ_CATEGORIES.includes(update.bizCategory)) continue;
    const saved = await saveDocumentOverride(found.path, { bizCategory: update.bizCategory });
    results.push({
      id: update.id as string,
      bizCategory: update.bizCategory,
      sourceName: found.name,
      confirmedAt: saved.confirmedAt,
    });
  }

  const ingestItems = results.reduce<ReturnType<typeof buildPreviewItemFromDocument>[]>((acc, result) => {
    const found = byId.get(result.id);
    if (!found) return acc;
    acc.push(buildPreviewItemFromDocument({
      ...found,
      confirmedBizCategory: result.bizCategory,
      categoryConfirmedAt: result.confirmedAt,
    }, 'file', undefined, libraries));
    return acc;
  }, []);

  return { ingestItems, results };
}

export async function saveIgnoredDocuments(updates: Array<{ id?: string; ignored?: boolean }>) {
  const { byId } = await loadIndexedDocumentMap();
  const results = [] as Array<{ id: string; removed: boolean; deletedFile: boolean }>;
  const removedPaths: string[] = [];

  for (const update of updates) {
    const found = update.id ? byId.get(update.id) : null;
    if (!found || update.ignored !== true) continue;

    await removeRetainedDocument(found.path);
    removedPaths.push(found.path);

    const normalizedPath = path.resolve(found.path).toLowerCase();
    const managedRoot = path.resolve(STORAGE_FILES_DIR).toLowerCase();
    let deletedFile = false;

    if (normalizedPath.startsWith(managedRoot)) {
      try {
        await fs.rm(found.path, { force: true });
        deletedFile = true;
      } catch {
        deletedFile = false;
      }
    }

    results.push({ id: update.id as string, removed: true, deletedFile });
  }

  if (removedPaths.length) {
    await removeDocumentOverrides(removedPaths);
    await removeDocumentsFromCache(removedPaths);
  }

  return results;
}

export async function updateDocumentAnalysisResult(
  id: string,
  input: {
    summary?: unknown;
    structuredProfile?: unknown;
    evidenceChunks?: unknown;
  },
) {
  const cache = await readDocumentCache();
  if (!cache) {
    throw new Error('document cache is not initialized');
  }

  const targetIndex = cache.items.findIndex((item) => buildDocumentId(item.path) === id);
  if (targetIndex < 0) {
    throw new Error('document not found');
  }

  const current = cache.items[targetIndex] as ParsedDocument;
  const now = new Date().toISOString();

  const nextSummary = input.summary !== undefined
    ? normalizeEditableText(input.summary, 'summary')
    : current.summary;
  const nextStructuredProfile = input.structuredProfile !== undefined
    ? normalizeStructuredProfile(input.structuredProfile)
    : current.structuredProfile;
  const nextEvidenceChunks = input.evidenceChunks !== undefined
    ? normalizeEvidenceChunks(input.evidenceChunks)
    : current.evidenceChunks;

  const updated = refreshDerivedSchemaProfile({
    ...current,
    summary: nextSummary,
    excerpt: nextSummary.slice(0, 280),
    structuredProfile: nextStructuredProfile,
    evidenceChunks: nextEvidenceChunks,
    detailParseStatus: 'succeeded',
    detailParseError: '',
    detailParsedAt: now,
    detailParseAttempts: Math.max(1, Number(current.detailParseAttempts || 0)),
    analysisEditedAt: now,
    manualSummary: input.summary !== undefined ? true : current.manualSummary,
    manualStructuredProfile: input.structuredProfile !== undefined ? true : current.manualStructuredProfile,
    manualEvidenceChunks: input.evidenceChunks !== undefined ? true : current.manualEvidenceChunks,
  });

  const nextItems = [...cache.items];
  nextItems[targetIndex] = updated;
  const normalizedItems = dedupeDocuments(sortDocumentsByRecency(nextItems));

  await replaceDocumentKnowledgeSnapshot({
    cachePayload: {
      ...cache,
      generatedAt: now,
      items: normalizedItems,
    },
    vectorItems: normalizedItems,
    memorySyncMode: 'immediate',
    memorySyncReason: 'document-analysis-manual-edit',
  });

  return updated;
}
