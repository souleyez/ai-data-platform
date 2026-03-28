import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ParsedDocument } from './document-parser.js';
import { REPO_ROOT, STORAGE_CACHE_DIR, STORAGE_CONFIG_DIR, STORAGE_FILES_DIR } from './paths.js';
import { buildVectorRecordsForDocument, type DocumentVectorRecord } from './document-vector-records.js';

const VECTOR_INDEX_FILE = path.join(STORAGE_CACHE_DIR, 'document-vector-index.jsonl');
const VECTOR_META_FILE = path.join(STORAGE_CACHE_DIR, 'document-vector-meta.json');
const WORKSPACE_ROOT = path.resolve(REPO_ROOT, '..');

export type DocumentVectorIndexEntry = {
  path: string;
  name: string;
  schemaType: string;
  parseStage: string;
  recordCount: number;
  priority: number;
  contentHash: string;
  indexedAt: string;
  groups: string[];
};

export type DocumentVectorIndexMeta = {
  updatedAt: string;
  documentCount: number;
  recordCount: number;
  entries: DocumentVectorIndexEntry[];
};

export type DocumentVectorRecallHit = {
  documentPath: string;
  score: number;
  matchedKinds: string[];
  recordCount: number;
};

function normalizePath(filePath: string) {
  return path.resolve(String(filePath || ''));
}

function stableHash(value: string) {
  return createHash('sha1').update(value).digest('hex').slice(0, 24);
}

function extractPathTimestamp(filePath: string) {
  const baseName = path.basename(String(filePath || ''));
  const match = baseName.match(/^(\d{13})(?:[-_.]|$)/);
  return match ? Number(match[1]) : 0;
}

function startsWithPath(filePath: string, rootPath: string) {
  const normalizedFile = normalizePath(filePath).toLowerCase();
  const normalizedRoot = normalizePath(rootPath).toLowerCase();
  return normalizedFile === normalizedRoot || normalizedFile.startsWith(`${normalizedRoot}${path.sep}`.toLowerCase());
}

function isStoredKnowledgeFile(filePath: string) {
  return startsWithPath(filePath, STORAGE_FILES_DIR);
}

function isSystemGeneratedKnowledgePath(filePath: string) {
  return (
    startsWithPath(filePath, path.join(STORAGE_FILES_DIR, 'report-references'))
    || startsWithPath(filePath, path.join(STORAGE_FILES_DIR, 'generated'))
    || startsWithPath(filePath, path.join(STORAGE_FILES_DIR, 'exports'))
  );
}

function isPlatformInternalPath(filePath: string) {
  return startsWithPath(filePath, REPO_ROOT) && !startsWithPath(filePath, STORAGE_FILES_DIR);
}

function isDevelopmentWorkspacePath(filePath: string) {
  return startsWithPath(filePath, WORKSPACE_ROOT) && !startsWithPath(filePath, STORAGE_FILES_DIR);
}

function isConfigLikePath(filePath: string) {
  if (startsWithPath(filePath, STORAGE_CONFIG_DIR)) return true;
  const normalized = normalizePath(filePath).toLowerCase();
  const baseName = path.basename(normalized);
  if (
    normalized.includes(`${path.sep}.git${path.sep}`)
    || normalized.includes(`${path.sep}node_modules${path.sep}`)
    || normalized.includes(`${path.sep}.next${path.sep}`)
    || normalized.includes(`${path.sep}dist${path.sep}`)
    || normalized.includes(`${path.sep}build${path.sep}`)
    || normalized.includes(`${path.sep}coverage${path.sep}`)
    || normalized.includes(`${path.sep}tmp${path.sep}`)
    || normalized.includes(`${path.sep}temp${path.sep}`)
    || normalized.includes(`${path.sep}cache${path.sep}`)
  ) {
    return true;
  }

  return [
    'package.json',
    'package-lock.json',
    'pnpm-lock.yaml',
    'tsconfig.json',
    '.env',
    '.env.example',
    'document-libraries.json',
    'documents-cache.json',
    'document-vector-meta.json',
    'document-vector-index.jsonl',
    'styles.xml',
    'launch_background.xml',
  ].includes(baseName);
}

function isClearlyNoiseArtifact(filePath: string) {
  const normalized = normalizePath(filePath).toLowerCase();
  const baseName = path.basename(normalized);
  if (
    normalized.includes(`${path.sep}starcraft ii${path.sep}`)
    || normalized.includes(`${path.sep}gamelogs${path.sep}`)
    || normalized.includes(`${path.sep}emoji-related${path.sep}`)
    || normalized.includes(`${path.sep}tencent files${path.sep}`)
    || normalized.includes(`${path.sep}captures${path.sep}`)
    || normalized.includes(`${path.sep}web-captures${path.sep}`)
    || baseName.startsWith('web-')
  ) {
    return true;
  }

  return [
    'words.json',
    'tasks.json',
    'variables.txt',
    'executeinfo.txt',
    'graphic.txt',
    'graphics.txt',
    'ngdptrace.txt',
  ].includes(baseName);
}

function hasAssignedLibrary(item: ParsedDocument) {
  return Boolean((item.confirmedGroups?.length || 0) > 0 || (item.groups?.length || 0) > 0);
}

function hasStrongBusinessSchema(item: ParsedDocument) {
  return ['formula', 'contract', 'technical', 'paper', 'report', 'resume'].includes(item.schemaType || '');
}

function hasHighQualitySignals(item: ParsedDocument) {
  return Boolean(
    item.cloudStructuredAt
    || (item.evidenceChunks?.length || 0) >= 3
    || (item.claims?.length || 0) >= 2
    || (item.entities?.length || 0) >= 6
    || Number(item.extractedChars || 0) >= 1800
  );
}

function hasDeepKnowledgeSignals(item: ParsedDocument) {
  return Boolean(
    item.cloudStructuredAt
    && (item.evidenceChunks?.length || 0) >= 5
    && Number(item.extractedChars || 0) >= 2500
  );
}

function isLowValueGeneric(item: ParsedDocument) {
  if ((item.schemaType || 'generic') !== 'generic') return false;
  if (hasAssignedLibrary(item)) return false;
  if (!isStoredKnowledgeFile(item.path)) return false;
  return !hasHighQualitySignals(item);
}

function isEligibleVectorCandidate(item: ParsedDocument) {
  if (item.parseStatus !== 'parsed') return false;
  if (item.parseStage !== 'detailed') return false;
  if (item.ignored) return false;
  if (!item.summary && !(item.evidenceChunks?.length) && !(item.claims?.length)) return false;
  if (!isStoredKnowledgeFile(item.path)) return false;
  if (isSystemGeneratedKnowledgePath(item.path)) return false;
  if (isPlatformInternalPath(item.path)) return false;
  if (isDevelopmentWorkspacePath(item.path)) return false;
  if (isConfigLikePath(item.path)) return false;
  if (isClearlyNoiseArtifact(item.path)) return false;

  if ((item.schemaType || 'generic') === 'generic') {
    return !isLowValueGeneric(item) && (hasAssignedLibrary(item) || hasDeepKnowledgeSignals(item));
  }

  if (hasAssignedLibrary(item)) return true;
  if ((item.schemaType || 'generic') === 'report' && item.bizCategory !== 'order') return false;
  if (hasStrongBusinessSchema(item) && hasHighQualitySignals(item)) return true;
  return false;
}

function buildDocumentContentHash(item: ParsedDocument, records: DocumentVectorRecord[]) {
  return stableHash(JSON.stringify({
    path: item.path,
    schemaType: item.schemaType,
    parseStage: item.parseStage,
    cloudStructuredAt: item.cloudStructuredAt,
    summary: item.summary,
    topicTags: item.topicTags || [],
    recordIds: records.map((record) => record.id),
  }));
}

export function scoreVectorizationPriority(item: ParsedDocument) {
  if (!isEligibleVectorCandidate(item)) return 0;

  let score = 0;
  const schemaBoost: Record<string, number> = {
    formula: 32,
    contract: 28,
    technical: 24,
    paper: 22,
    report: 18,
    resume: 14,
    generic: 6,
  };

  score += schemaBoost[item.schemaType || 'generic'] || 0;
  score += Math.min(item.evidenceChunks?.length || 0, 16) * 3;
  score += Math.min(item.claims?.length || 0, 16) * 2;
  score += Math.min(item.entities?.length || 0, 24);
  score += Math.min(item.topicTags?.length || 0, 10);
  score += item.cloudStructuredAt ? 10 : 0;
  score += (item.confirmedGroups?.length || 0) * 5;
  score += (item.groups?.length || 0) * 3;

  const chars = Number(item.extractedChars || 0);
  if (chars >= 1000) score += 4;
  if (chars >= 3000) score += 6;
  if (chars >= 8000) score += 6;

  if (startsWithPath(item.path, path.join(STORAGE_FILES_DIR, 'uploads'))) {
    score += 40;
  } else if (isStoredKnowledgeFile(item.path)) {
    score += 20;
  }

  if ((item.schemaType || 'generic') === 'generic' && !hasAssignedLibrary(item)) {
    score -= 18;
  }

  const uploadedAt = extractPathTimestamp(item.path);
  if (uploadedAt > 0) {
    score += Math.min(Math.floor((uploadedAt - 1700000000000) / 86400000), 365);
  }

  return Math.max(score, 0);
}

export function shouldVectorizeDocument(item: ParsedDocument) {
  return isEligibleVectorCandidate(item);
}

function buildIndexEntry(item: ParsedDocument, records: DocumentVectorRecord[]): DocumentVectorIndexEntry {
  return {
    path: normalizePath(item.path),
    name: item.name,
    schemaType: item.schemaType || 'generic',
    parseStage: item.parseStage || 'quick',
    recordCount: records.length,
    priority: scoreVectorizationPriority(item),
    contentHash: buildDocumentContentHash(item, records),
    indexedAt: new Date().toISOString(),
    groups: item.confirmedGroups || item.groups || [],
  };
}

async function ensureDir() {
  await fs.mkdir(STORAGE_CACHE_DIR, { recursive: true });
}

async function readMeta(): Promise<DocumentVectorIndexMeta> {
  try {
    const raw = await fs.readFile(VECTOR_META_FILE, 'utf8');
    const parsed = JSON.parse(raw) as DocumentVectorIndexMeta;
    return {
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      documentCount: Number(parsed.documentCount || 0),
      recordCount: Number(parsed.recordCount || 0),
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
    };
  } catch {
    return {
      updatedAt: new Date().toISOString(),
      documentCount: 0,
      recordCount: 0,
      entries: [],
    };
  }
}

async function writeIndex(records: DocumentVectorRecord[], entries: DocumentVectorIndexEntry[]) {
  await ensureDir();
  const normalizedRecords = records
    .sort((left, right) =>
      left.documentPath.localeCompare(right.documentPath)
      || left.kind.localeCompare(right.kind)
      || left.id.localeCompare(right.id));
  const jsonl = normalizedRecords.map((record) => JSON.stringify(record)).join('\n');
  await fs.writeFile(VECTOR_INDEX_FILE, jsonl ? `${jsonl}\n` : '', 'utf8');
  await fs.writeFile(VECTOR_META_FILE, JSON.stringify({
    updatedAt: new Date().toISOString(),
    documentCount: entries.length,
    recordCount: normalizedRecords.length,
    entries: entries.sort((left, right) => right.priority - left.priority || left.path.localeCompare(right.path)),
  }, null, 2), 'utf8');
}

function buildEntryMap(records: DocumentVectorRecord[]) {
  const byPath = new Map<string, DocumentVectorRecord[]>();
  for (const record of records) {
    const key = normalizePath(record.documentPath);
    const group = byPath.get(key) || [];
    group.push(record);
    byPath.set(key, group);
  }
  return byPath;
}

export async function rebuildDocumentVectorIndex(items: ParsedDocument[]) {
  const candidates = items.filter(shouldVectorizeDocument);
  const records = candidates.flatMap((item) => buildVectorRecordsForDocument(item));
  const recordsByPath = buildEntryMap(records);
  const entries = candidates
    .map((item) => buildIndexEntry(item, recordsByPath.get(normalizePath(item.path)) || []))
    .filter((entry) => entry.recordCount > 0 && entry.priority > 0);

  await writeIndex(records, entries);
  return {
    documentCount: entries.length,
    recordCount: records.length,
    topEntries: entries.slice(0, 10),
  };
}

export async function upsertDocumentVectorIndex(items: ParsedDocument[]) {
  const meta = await readMeta();
  const indexRaw = await fs.readFile(VECTOR_INDEX_FILE, 'utf8').catch(() => '');
  const existingRecords = indexRaw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as DocumentVectorRecord);

  const targetPaths = new Set(items.map((item) => normalizePath(item.path)));
  const nextRecords = existingRecords.filter((record) => !targetPaths.has(normalizePath(record.documentPath)));
  const nextEntries = meta.entries.filter((entry) => !targetPaths.has(normalizePath(entry.path)));

  for (const item of items.filter(shouldVectorizeDocument)) {
    const records = buildVectorRecordsForDocument(item);
    if (!records.length) continue;
    nextRecords.push(...records);
    nextEntries.push(buildIndexEntry(item, records));
  }

  await writeIndex(
    nextRecords.filter((record) => record.text.trim()),
    nextEntries.filter((entry) => entry.recordCount > 0 && entry.priority > 0),
  );
  return {
    documentCount: nextEntries.length,
    recordCount: nextRecords.length,
    updatedPaths: [...targetPaths],
  };
}

export async function loadDocumentVectorIndexMeta() {
  return readMeta();
}

function collectVectorTokens(text: string) {
  const normalized = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const asciiTokens = normalized.match(/[a-z0-9][a-z0-9-]{1,}/g) || [];
  const cjkRuns = normalized.match(/[\u4e00-\u9fff]{2,}/g) || [];
  const cjkTokens: string[] = [];
  for (const run of cjkRuns) {
    for (let index = 0; index < run.length - 1; index += 1) {
      cjkTokens.push(run.slice(index, index + 2));
    }
    for (let index = 0; index < run.length - 2; index += 1) {
      cjkTokens.push(run.slice(index, index + 3));
    }
  }

  return [...new Set([...asciiTokens, ...cjkTokens])].slice(0, 48);
}

function scoreRecordByTokens(record: DocumentVectorRecord, promptTokens: string[]) {
  const haystack = `${record.text} ${JSON.stringify(record.metadata || {})}`.toLowerCase();
  if (!haystack || !promptTokens.length) return 0;

  let score = 0;
  for (const token of promptTokens) {
    if (!haystack.includes(token)) continue;
    if (token.length >= 8) score += 12;
    else if (token.length >= 5) score += 8;
    else if (token.length >= 3) score += 4;
    else score += 2;
  }

  const kindWeight: Record<DocumentVectorRecord['kind'], number> = {
    summary: 1.4,
    profile: 1.8,
    'profile-field': 2.2,
    evidence: 1.2,
    claim: 1.5,
  };

  return score * (kindWeight[record.kind] || 1);
}

function scoreTemplateTaskFit(record: DocumentVectorRecord, templateTask?: string) {
  const task = String(templateTask || '').trim().toLowerCase();
  if (!task) return 0;

  const tags = Array.isArray(record.metadata?.templateTasks)
    ? (record.metadata.templateTasks as unknown[]).map((item) => String(item).toLowerCase())
    : [];
  if (!tags.length) return 0;

  if (tags.includes(task)) return 14;
  if (tags.some((item) => item.includes(task) || task.includes(item))) return 8;
  return -2;
}

async function loadVectorRecords() {
  const raw = await fs.readFile(VECTOR_INDEX_FILE, 'utf8').catch(() => '');
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as DocumentVectorRecord];
      } catch {
        return [];
      }
    });
}

function scoreIntentFitForRecord(record: DocumentVectorRecord, intent?: string) {
  const normalizedIntent = String(intent || '').trim().toLowerCase();
  if (!normalizedIntent || normalizedIntent === 'generic') return 0;

  let score = 0;
  if (record.schemaType === normalizedIntent) score += 12;

  const metadataText = JSON.stringify(record.metadata || {}).toLowerCase();
  if (metadataText.includes(`"${normalizedIntent}"`) || metadataText.includes(normalizedIntent)) {
    score += 4;
  }

  if (normalizedIntent === 'paper' && record.schemaType === 'formula') score -= 12;
  if (normalizedIntent === 'technical' && record.schemaType === 'formula') score -= 10;
  if (normalizedIntent === 'formula' && (record.schemaType === 'paper' || record.schemaType === 'technical')) score -= 6;
  if (normalizedIntent === 'contract' && record.schemaType !== 'contract') score -= 8;
  if (normalizedIntent === 'resume' && record.schemaType !== 'resume') score -= 8;

  return score;
}

export async function searchDocumentVectorIndex(
  prompt: string,
  limit = 18,
  options?: { intent?: string; templateTask?: string },
): Promise<DocumentVectorRecallHit[]> {
  const promptTokens = collectVectorTokens(prompt);
  if (!promptTokens.length) return [];

  const records = await loadVectorRecords();
  const byPath = new Map<string, DocumentVectorRecallHit>();

  for (const record of records) {
    const score = scoreRecordByTokens(record, promptTokens)
      + scoreIntentFitForRecord(record, options?.intent)
      + scoreTemplateTaskFit(record, options?.templateTask);
    if (score <= 0) continue;

    const key = normalizePath(record.documentPath);
    const existing = byPath.get(key);
    if (!existing) {
      byPath.set(key, {
        documentPath: key,
        score,
        matchedKinds: [record.kind],
        recordCount: 1,
      });
      continue;
    }

    existing.score += score;
    existing.recordCount += 1;
    if (!existing.matchedKinds.includes(record.kind)) {
      existing.matchedKinds.push(record.kind);
    }
  }

  return [...byPath.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, limit));
}
