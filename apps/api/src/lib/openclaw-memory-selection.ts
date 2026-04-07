import path from 'node:path';
import { loadBotMemorySelectionState } from './bot-memory-catalog.js';
import { STORAGE_CONFIG_DIR } from './paths.js';
import { readRuntimeStateJson } from './runtime-state-file.js';
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
  const cjkRuns = normalized.match(/[\u4e00-\u9fff]{2,}/g) || [];
  const cjkTokens = cjkRuns.flatMap((run) => {
    const tokens = new Set<string>([run]);
    for (let size = 2; size <= Math.min(4, run.length); size += 1) {
      for (let index = 0; index <= run.length - size; index += 1) {
        tokens.add(run.slice(index, index + size));
      }
    }
    return [...tokens];
  });
  return [...new Set([...asciiTokens, ...cjkTokens])];
}

function hasRecentSignal(requestText: string) {
  const normalized = normalizeText(requestText);
  return /(?:latest|recent|newest|last upload|recent parse|recently parsed|latest parsed|recent scan|latest scan|recent update|latest update|最新|最近|刚上传|新上传|最近解析|最新解析|刚解析|最近扫描|最新扫描|刚扫描|最近更新|最新更新|刚更新)/.test(normalized);
}

function hasFailureSignal(requestText: string) {
  const normalized = normalizeText(requestText);
  return /(?:failed|failure|error|ocr|reparse|retry|失败|报错|重解析|重试|ocr)/.test(normalized);
}

function toTimestamp(value: string) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function isSelectableAvailability(value: string) {
  return value === 'available' || value === 'structured-only' || value === 'parse-error';
}

function scoreKeyword(keyword: string, text: string, weight: number) {
  if (!keyword || !text || !text.includes(keyword)) return 0;
  if (keyword.length >= 8) return weight * 4;
  if (keyword.length >= 4) return weight * 3;
  if (keyword.length >= 2) return weight * 2;
  return weight;
}

function mapLifecycleAliases(document: OpenClawMemoryDocumentState) {
  const aliases: string[] = [];
  const availability = String(document.availability || '').trim().toLowerCase();
  const parseStatus = String(document.parseStatus || '').trim().toLowerCase();
  const parseStage = String(document.parseStage || '').trim().toLowerCase();
  const detailParseStatus = String(document.detailParseStatus || '').trim().toLowerCase();

  if (availability === 'available') aliases.push('available', 'usable', '可用', '已入库');
  if (availability === 'structured-only') aliases.push('structured-only', 'retained', '仅结构化', '仅保留结构化');
  if (availability === 'audit-excluded') aliases.push('audit-excluded', 'ignored', '已忽略', '审核排除');
  if (availability === 'parse-error') aliases.push('parse-error', 'parse failed', '失败', '解析失败', '扫描失败');
  if (availability === 'unsupported') aliases.push('unsupported', 'not supported', '不支持');

  if (parseStatus === 'parsed') aliases.push('parsed', '解析成功', '已解析');
  if (parseStatus === 'error') aliases.push('error', 'failed', '失败', '解析失败');
  if (parseStage === 'quick') aliases.push('quick', 'quick parse', '快速解析');
  if (parseStage === 'detailed') aliases.push('detailed', 'detail parse', '详细解析');
  if (detailParseStatus === 'queued') aliases.push('queued', '排队', '待解析');
  if (detailParseStatus === 'processing') aliases.push('processing', '解析中', '处理中');
  if (detailParseStatus === 'succeeded') aliases.push('succeeded', 'detail succeeded', '详细解析成功', '重解析成功');
  if (detailParseStatus === 'failed') aliases.push('failed', 'detail failed', '详细解析失败', 'ocr failed', 'ocr失败');

  return [...new Set(aliases)];
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
  const lifecycleText = normalizeText(mapLifecycleAliases(input.document).join(' '));
  const failureSignal = hasFailureSignal(input.requestText);
  const libraryMatch = !input.libraryKeySet.size
    || input.document.libraryKeys.some((key) => input.libraryKeySet.has(key));

  if (!libraryMatch) return -1;
  if (!isSelectableAvailability(input.document.availability)) return -1;
  if (input.document.availability === 'parse-error' && !failureSignal) return -1;

  let score = 20;
  if (input.document.availability === 'available') score += 6;
  if (input.document.detailParseStatus === 'succeeded') score += 3;
  if (input.document.detailParseStatus === 'failed') score += 1;

  for (const token of input.tokens) {
    score += scoreKeyword(token, title, 4);
    score += scoreKeyword(token, summary, 2);
    score += scoreKeyword(token, lifecycleText, 2);
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
  effectiveVisibleLibraryKeys?: string[];
}): OpenClawMemorySelection {
  const stateDocuments = Object.values(input.state?.documents || {});
  if (!stateDocuments.length) {
    return { documentIds: [], candidates: [] };
  }

  const limit = Math.max(1, Math.min(Number(input.limit || 8), 24));
  const tokens = tokenizeText(input.requestText);
  const recentSignal = hasRecentSignal(input.requestText);
  const libraryKeySet = new Set((input.libraries || []).map((item) => String(item.key || '').trim()).filter(Boolean));
  const effectiveVisibleLibraryKeySet = Array.isArray(input.effectiveVisibleLibraryKeys)
    ? new Set(input.effectiveVisibleLibraryKeys.map((item) => String(item || '').trim()).filter(Boolean))
    : null;

  const candidates = stateDocuments
    .filter((document) => (
      !effectiveVisibleLibraryKeySet
      || document.libraryKeys.some((key) => effectiveVisibleLibraryKeySet.has(key))
    ))
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

export async function loadOpenClawMemorySelectionState(input?: string | {
  botId?: string;
  forceGlobalState?: boolean;
}) {
  const options = typeof input === 'string'
    ? { botId: input, forceGlobalState: false }
    : {
        botId: input?.botId,
        forceGlobalState: input?.forceGlobalState === true,
      };

  if (options.botId) {
    return loadBotMemorySelectionState(options.botId, {
      forceGlobalState: options.forceGlobalState,
    });
  }
  const { data } = await readRuntimeStateJson<OpenClawMemoryState | null>({
    filePath: STATE_FILE,
    fallback: null,
    normalize: (parsed) => (
      parsed && typeof parsed === 'object'
        ? parsed as OpenClawMemoryState
        : null
    ),
  });
  return data;
}

export async function selectOpenClawMemoryDocumentCandidates(input: {
  requestText: string;
  libraries?: KnowledgeLibrary[];
  limit?: number;
  botId?: string;
  forceGlobalState?: boolean;
  effectiveVisibleLibraryKeys?: string[];
}) {
  const state = await loadOpenClawMemorySelectionState({
    botId: input.botId,
    forceGlobalState: input.forceGlobalState,
  });
  return selectOpenClawMemoryDocumentCandidatesFromState({
    state,
    requestText: input.requestText,
    libraries: input.libraries,
    limit: input.limit,
    effectiveVisibleLibraryKeys: input.effectiveVisibleLibraryKeys,
  });
}

export function buildOpenClawMemorySelectionContextBlock(selection: OpenClawMemorySelection) {
  if (!selection.candidates.length) return '';

  return [
    'Memory-selected documents:',
    ...selection.candidates.map((item, index) => (
      `${index + 1}. ${item.title} | id=${item.id} | libraries=${item.libraryKeys.join(',')} | availability=${item.availability} | parse=${item.parseStatus || '-'} | stage=${item.parseStage || '-'} | detail=${item.detailParseStatus || '-'} | updatedAt=${item.updatedAt || '-'}`
    )),
  ].join('\n');
}
