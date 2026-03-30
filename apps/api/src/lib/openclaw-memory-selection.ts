import { promises as fs } from 'node:fs';
import path from 'node:path';
import { STORAGE_CONFIG_DIR } from './paths.js';
import type { OpenClawMemoryDocumentState, OpenClawMemoryState } from './openclaw-memory-changes.js';

type KnowledgeLibrary = { key: string; label: string };

export type OpenClawMemoryDocumentCandidate = OpenClawMemoryDocumentState & {
  score: number;
};

export type OpenClawMemorySelection = {
  documentIds: string[];
  candidates: OpenClawMemoryDocumentCandidate[];
};

const STATE_FILE = path.join(STORAGE_CONFIG_DIR, 'openclaw-memory-catalog.json');

function normalizeText(value: unknown) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeText(value: unknown) {
  const normalized = normalizeText(value);
  if (!normalized) return [];

  const asciiTokens = normalized.match(/[a-z0-9][a-z0-9-]{1,}/g) || [];
  const cjkTokens = normalized.match(/[\u4e00-\u9fff]{2,}/g) || [];
  return [...new Set([...asciiTokens, ...cjkTokens])];
}

function hasRecentSignal(requestText: string) {
  const normalized = normalizeText(requestText);
  return /(?:latest|recent|newest|last upload|最近|最新|刚上传|新上传)/.test(normalized);
}

function toTimestamp(value: string) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function isSelectableAvailability(value: string) {
  return value === 'available' || value === 'structured-only';
}

function scoreKeyword(keyword: string, text: string, weight: number) {
  if (!keyword || !text || !text.includes(keyword)) return 0;
  if (keyword.length >= 8) return weight * 4;
  if (keyword.length >= 4) return weight * 3;
  if (keyword.length >= 2) return weight * 2;
  return weight;
}

function scoreDocumentCandidate(input: {
  document: OpenClawMemoryDocumentState;
  requestText: string;
  tokens: string[];
  recentSignal: boolean;
  libraryKeySet: Set<string>;
}) {
  const title = normalizeText(input.document.title);
  const summary = normalizeText(input.document.summary);
  const libraryMatch = !input.libraryKeySet.size
    || input.document.libraryKeys.some((key) => input.libraryKeySet.has(key));

  if (!libraryMatch) return -1;
  if (!isSelectableAvailability(input.document.availability)) return -1;

  let score = 20;
  if (input.document.availability === 'available') score += 6;

  for (const token of input.tokens) {
    score += scoreKeyword(token, title, 4);
    score += scoreKeyword(token, summary, 2);
  }

  const updatedAt = toTimestamp(input.document.updatedAt);
  if (updatedAt > 0) {
    const ageDays = Math.max(0, Math.floor((Date.now() - updatedAt) / (24 * 60 * 60 * 1000)));
    const recencyScore = Math.max(0, 12 - Math.min(ageDays, 12));
    score += input.recentSignal ? recencyScore * 2 : recencyScore;
  }

  return score;
}

export function selectOpenClawMemoryDocumentCandidatesFromState(input: {
  state: OpenClawMemoryState | null;
  requestText: string;
  libraries?: KnowledgeLibrary[];
  limit?: number;
}): OpenClawMemorySelection {
  const stateDocuments = Object.values(input.state?.documents || {});
  if (!stateDocuments.length) {
    return { documentIds: [], candidates: [] };
  }

  const limit = Math.max(1, Math.min(Number(input.limit || 8), 24));
  const tokens = tokenizeText(input.requestText);
  const recentSignal = hasRecentSignal(input.requestText);
  const libraryKeySet = new Set((input.libraries || []).map((item) => String(item.key || '').trim()).filter(Boolean));

  const candidates = stateDocuments
    .map((document) => ({
      ...document,
      score: scoreDocumentCandidate({
        document,
        requestText: input.requestText,
        tokens,
        recentSignal,
        libraryKeySet,
      }),
    }))
    .filter((item) => item.score >= 0)
    .sort((left, right) => (
      right.score - left.score
      || toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt)
      || left.title.localeCompare(right.title, 'zh-CN')
    ))
    .slice(0, limit);

  return {
    documentIds: candidates.map((item) => item.id),
    candidates,
  };
}

export async function loadOpenClawMemorySelectionState() {
  try {
    const raw = await fs.readFile(STATE_FILE, 'utf8');
    return JSON.parse(raw) as OpenClawMemoryState;
  } catch {
    return null;
  }
}

export async function selectOpenClawMemoryDocumentCandidates(input: {
  requestText: string;
  libraries?: KnowledgeLibrary[];
  limit?: number;
}) {
  const state = await loadOpenClawMemorySelectionState();
  return selectOpenClawMemoryDocumentCandidatesFromState({
    state,
    requestText: input.requestText,
    libraries: input.libraries,
    limit: input.limit,
  });
}

export function buildOpenClawMemorySelectionContextBlock(selection: OpenClawMemorySelection) {
  if (!selection.candidates.length) return '';

  return [
    'Memory-selected documents:',
    ...selection.candidates.map((item, index) => (
      `${index + 1}. ${item.title} | id=${item.id} | libraries=${item.libraryKeys.join(',')} | availability=${item.availability} | updatedAt=${item.updatedAt || '-'}`
    )),
  ].join('\n');
}
