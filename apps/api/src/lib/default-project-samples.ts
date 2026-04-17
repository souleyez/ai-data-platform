import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadDocumentCategoryConfig } from './document-config.js';
import { runDetailedParseBatch } from './document-deep-parse-queue.js';
import { createDocumentLibrary, loadDocumentLibraries, type DocumentLibrary } from './document-libraries.js';
import { upsertDocumentsIntoKnowledgeBase } from './document-knowledge-lifecycle.js';
import { saveDocumentOverride } from './document-overrides.js';
import { parseDocument } from './document-parser.js';
import { REPO_ROOT, STORAGE_FILES_DIR } from './paths.js';
import { createReportOutput, deleteReportOutput, loadReportCenterState } from './report-center.js';
import { loadParsedDocuments } from './document-store.js';
import {
  DEFAULT_SAMPLE_DOCUMENTS,
  DEFAULT_SAMPLE_OUTPUTS,
  LABEL_BIDS,
  LABEL_IOT,
  LABEL_ORDER,
  LABEL_RESUME,
  type SampleDocDefinition,
} from './default-project-samples-data.js';
import { DEFAULT_SAMPLE_ORDER_INVENTORY_OUTPUT } from './default-project-samples-order-inventory-output.js';

const DEFAULT_SAMPLE_SOURCE_DIR = path.join(REPO_ROOT, 'default-samples', 'assets');
const DEFAULT_SAMPLE_UPLOAD_DIR = path.join(STORAGE_FILES_DIR, 'uploads');

let ensurePromise: Promise<void> | null = null;

function normalizeLibraryLookupKey(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_/]+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fff-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function ensureLibrary(label: string, description = ''): Promise<DocumentLibrary> {
  const libraries = await loadDocumentLibraries();
  const lookupKey = normalizeLibraryLookupKey(label);
  const existing = libraries.find((item) => (
    String(item.label || '').trim() === label
    || normalizeLibraryLookupKey(item.label || '') === lookupKey
    || normalizeLibraryLookupKey(item.key || '') === lookupKey
  ));
  if (existing) return existing;
  await createDocumentLibrary({ name: label, description });
  const nextLibraries = await loadDocumentLibraries();
  const created = nextLibraries.find((item) => (
    String(item.label || '').trim() === label
    || normalizeLibraryLookupKey(item.label || '') === lookupKey
    || normalizeLibraryLookupKey(item.key || '') === lookupKey
  ));
  if (!created) throw new Error(`failed to create library: ${label}`);
  return created;
}

async function ensureSampleFile(definition: SampleDocDefinition, existingPath?: string) {
  if (existingPath) return existingPath;
  await fs.mkdir(DEFAULT_SAMPLE_UPLOAD_DIR, { recursive: true });
  const targetPath = path.join(DEFAULT_SAMPLE_UPLOAD_DIR, definition.storedFileName);
  try {
    await fs.access(targetPath);
    return targetPath;
  } catch {
    const sourcePath = path.join(DEFAULT_SAMPLE_SOURCE_DIR, definition.sourceFileName);
    await fs.copyFile(sourcePath, targetPath);
    return targetPath;
  }
}

async function ensureSampleDocuments(libraryMap: Record<string, DocumentLibrary>) {
  const config = await loadDocumentCategoryConfig(STORAGE_FILES_DIR);
  const existingDocuments = await loadParsedDocuments(400, false, config.scanRoots);
  const parsedItems = [];

  for (const definition of DEFAULT_SAMPLE_DOCUMENTS) {
    const knownNames = new Set([definition.storedFileName, ...(definition.legacyFileNames || [])]);
    const existing = (existingDocuments.items || []).find((item) =>
      [...knownNames].some((name) => String(item.name || '').endsWith(name)),
    );
    const targetPath = await ensureSampleFile(definition, existing?.path);
    const parsed = await parseDocument(targetPath, config, { stage: 'quick' });
    parsedItems.push(parsed);
    await saveDocumentOverride(targetPath, { groups: [libraryMap[definition.groupLabel].key] });
  }

  await upsertDocumentsIntoKnowledgeBase({
    items: parsedItems,
    scanRoot: config.scanRoots,
    queueDetailedParse: true,
    memorySyncMode: 'scheduled',
    memorySyncReason: 'default-project-samples',
  });
  await runDetailedParseBatch(4, config.scanRoots);
  await runDetailedParseBatch(4, config.scanRoots);
}

async function ensureSampleOutputs(libraryMap: Record<string, DocumentLibrary>) {
  const state = await loadReportCenterState();
  const titlesToRefresh = new Set([
    ...DEFAULT_SAMPLE_OUTPUTS.map((item) => item.title),
    DEFAULT_SAMPLE_ORDER_INVENTORY_OUTPUT.title,
  ]);

  for (const record of state.outputs || []) {
    if (!titlesToRefresh.has(String(record.title || '').trim())) continue;
    await deleteReportOutput(record.id);
  }

  for (const output of DEFAULT_SAMPLE_OUTPUTS) {
    const library = libraryMap[output.groupLabel];
    await createReportOutput({
      groupKey: library.key,
      title: output.title,
      triggerSource: 'chat',
      kind: output.kind,
      format: output.kind === 'table' ? 'csv' : 'html',
      content: output.content,
      table: output.table || null,
      page: output.page || null,
      libraries: [{ key: library.key, label: library.label }],
    });
  }
}

async function runEnsureDefaultProjectSamples() {
  const libraryMap = {
    [LABEL_ORDER]: await ensureLibrary(LABEL_ORDER),
    [LABEL_RESUME]: await ensureLibrary(LABEL_RESUME),
    [LABEL_BIDS]: await ensureLibrary(LABEL_BIDS, 'Public bid and tender documents'),
    [LABEL_IOT]: await ensureLibrary(LABEL_IOT, '系统默认 IOT 解决方案样例'),
  };

  await ensureSampleOutputs(libraryMap);
  await ensureSampleDocuments(libraryMap);
  await loadParsedDocuments(200, false);
}

export async function ensureDefaultProjectSamples() {
  if (ensurePromise) return ensurePromise;
  ensurePromise = runEnsureDefaultProjectSamples().finally(() => {
    ensurePromise = null;
  });
  return ensurePromise;
}

export function getDefaultProjectSampleOutputs() {
  return DEFAULT_SAMPLE_OUTPUTS;
}
