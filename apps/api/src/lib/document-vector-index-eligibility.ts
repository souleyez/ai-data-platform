import { createHash } from 'node:crypto';
import path from 'node:path';
import type { ParsedDocument } from './document-parser.js';
import type { DocumentVectorRecord } from './document-vector-records.js';
import { isFootfallDocumentSignal, isOrderDocumentSignal } from './document-domain-signals.js';
import { REPO_ROOT, STORAGE_CONFIG_DIR, STORAGE_FILES_DIR } from './paths.js';
import type { DocumentVectorIndexEntry } from './document-vector-index-types.js';

const WORKSPACE_ROOT = path.resolve(REPO_ROOT, '..');

export function normalizeVectorDocumentPath(filePath: string) {
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
  const normalizedFile = normalizeVectorDocumentPath(filePath).toLowerCase();
  const normalizedRoot = normalizeVectorDocumentPath(rootPath).toLowerCase();
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
  const normalized = normalizeVectorDocumentPath(filePath).toLowerCase();
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
  const normalized = normalizeVectorDocumentPath(filePath).toLowerCase();
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
  if ((item.schemaType || 'generic') === 'report' && !isOrderDocumentSignal(item) && !isFootfallDocumentSignal(item)) return false;
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

export function buildDocumentVectorIndexEntry(item: ParsedDocument, records: DocumentVectorRecord[]): DocumentVectorIndexEntry {
  return {
    path: normalizeVectorDocumentPath(item.path),
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
