import { listDatasourceDefinitions } from './datasource-definitions.js';
import { loadDocumentLibraries } from './document-libraries.js';
import { loadModelConfigState } from './model-config.js';
import type {
  ChatActionInvalidateDomain,
  ChatActionResult,
  ExecutedPlatformChatAction,
} from './platform-chat-actions-types.js';

export function normalizeText(value: string) {
  return String(value || '')
    .normalize('NFKC')
    .trim();
}

export function normalizeForMatch(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sanitizeReference(value: string) {
  return normalizeText(value)
    .replace(/^[“"'`]+|[”"'`]+$/gu, '')
    .trim();
}

export function sanitizeLibraryName(value: string) {
  return sanitizeReference(value)
    .replace(/^(?:一个|个|一组|一套|一个新的|新的)\s*/u, '')
    .replace(/\s*(?:数据集分组|数据集|知识库分组|知识库|文档库|分组)\s*$/u, '')
    .trim();
}

export function sanitizeDatasourceReference(value: string) {
  return sanitizeReference(value)
    .replace(/\s*(?:数据源|采集源|采集任务|采集)\s*$/u, '')
    .trim();
}

export function extractQuotedNames(prompt: string) {
  return Array.from(normalizeText(prompt).matchAll(/[“"']([^“"'\n]{1,80})[”"']/gu))
    .map((match) => sanitizeReference(match[1] || ''))
    .filter(Boolean);
}

export function scoreMatch(reference: string, haystacks: string[]) {
  const normalizedReference = normalizeForMatch(reference);
  if (!normalizedReference) return 0;
  let best = 0;
  for (const haystack of haystacks) {
    const normalizedHaystack = normalizeForMatch(haystack);
    if (!normalizedHaystack) continue;
    if (normalizedReference === normalizedHaystack) {
      best = Math.max(best, 200);
      continue;
    }
    if (normalizedHaystack.includes(normalizedReference)) {
      best = Math.max(best, 120 + Math.min(60, normalizedReference.length * 3));
      continue;
    }
    if (normalizedReference.includes(normalizedHaystack)) {
      best = Math.max(best, 90 + Math.min(40, normalizedHaystack.length * 2));
    }
  }
  return best;
}

function isCnModelVariant(input: { id?: string; provider?: string }) {
  return /(^|[-/\s])cn($|[-/\s])|中国/u.test(`${input.id || ''} ${input.provider || ''}`);
}

export async function resolveLibraryReference(reference: string) {
  const target = sanitizeLibraryName(reference);
  if (!target) throw new Error('缺少要操作的数据集分组名称。');
  const libraries = await loadDocumentLibraries();
  const matches = libraries
    .map((library) => ({
      library,
      score: scoreMatch(target, [library.key, library.label, library.description || '']),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  if (!matches.length) {
    throw new Error(`没有找到数据集分组“${target}”。`);
  }

  if (matches.length > 1 && matches[1].score >= matches[0].score - 10) {
    const choices = matches.slice(0, 3).map((item) => item.library.label).join('、');
    throw new Error(`数据集分组匹配不明确：${choices}`);
  }

  return matches[0].library;
}

export async function resolveDatasourceReference(reference: string) {
  const target = sanitizeDatasourceReference(reference);
  if (!target) throw new Error('缺少要操作的数据源名称。');
  const definitions = await listDatasourceDefinitions();
  const matches = definitions
    .map((item) => ({
      item,
      score: scoreMatch(target, [
        item.id,
        item.name,
        ...item.targetLibraries.flatMap((library) => [library.key, library.label]),
      ]),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  if (!matches.length) {
    throw new Error(`没有找到数据源“${target}”。`);
  }

  if (matches.length > 1 && matches[1].score >= matches[0].score - 10) {
    const choices = matches.slice(0, 3).map((entry) => entry.item.name).join('、');
    throw new Error(`数据源匹配不明确：${choices}`);
  }

  return matches[0].item;
}

export async function resolveModelReference(prompt: string) {
  const state = await loadModelConfigState();
  const candidates = state.availableModels || [];
  if (!candidates.length) {
    throw new Error('当前没有可切换的模型。');
  }
  const normalizedPrompt = normalizeForMatch(prompt);
  const preferCn = /\bcn\b|中国|国内|中文版/u.test(prompt);
  const matches = candidates
    .map((item) => ({
      item,
      score: scoreMatch(normalizedPrompt, [
        item.id,
        item.label,
        `${item.provider} ${item.label}`,
      ]),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const leftIsCn = isCnModelVariant(left.item);
      const rightIsCn = isCnModelVariant(right.item);
      if (leftIsCn !== rightIsCn) {
        return preferCn
          ? (rightIsCn ? 1 : -1)
          : (leftIsCn ? 1 : -1);
      }
      return String(left.item.id || '').localeCompare(String(right.item.id || ''));
    });

  if (!matches.length) {
    throw new Error('没有识别到要切换的模型。');
  }

  const leadingMatches = matches.filter((entry) => entry.score >= matches[0].score - 8);
  if (leadingMatches.length > 1) {
    const labelKeys = new Set(leadingMatches.map((entry) => normalizeForMatch(entry.item.label)));
    const familyKeys = new Set(leadingMatches.map((entry) => String(entry.item.familyId || '')));
    const hasCnVariant = leadingMatches.some((entry) => isCnModelVariant(entry.item));
    const hasGlobalVariant = leadingMatches.some((entry) => !isCnModelVariant(entry.item));
    if (labelKeys.size === 1 && familyKeys.size === 1 && hasCnVariant && hasGlobalVariant) {
      return matches[0].item;
    }
    const choices = leadingMatches.slice(0, 4).map((entry) => `${entry.item.provider} / ${entry.item.label}`).join('、');
    throw new Error(`模型匹配不明确：${choices}`);
  }

  return matches[0].item;
}

function mapPlatformActionToInvalidate(action: string): ChatActionInvalidateDomain[] {
  if (action.startsWith('documents.')) return ['documents'];
  if (action.startsWith('datasources.')) return ['datasources'];
  if (action.startsWith('reports.')) return ['reports'];
  if (action.startsWith('models.')) return ['models'];
  return [];
}

function mapPlatformActionDomain(action: string): ChatActionInvalidateDomain {
  const [domain = 'documents'] = String(action || '').split('.');
  if (domain === 'documents' || domain === 'datasources' || domain === 'reports' || domain === 'models') {
    return domain;
  }
  return 'documents';
}

export function buildActionResult(input: {
  action: string;
  status?: 'completed' | 'failed';
  summary: string;
  entity?: Record<string, unknown> | null;
  invalidate?: ChatActionInvalidateDomain[];
}): ChatActionResult {
  const status = input.status || 'completed';
  return {
    domain: mapPlatformActionDomain(input.action),
    action: input.action,
    status,
    summary: input.summary,
    invalidate: input.invalidate || (status === 'completed' ? mapPlatformActionToInvalidate(input.action) : []),
    entity: input.entity || null,
  };
}

export function buildFailedAction(input: {
  action: string;
  content: string;
  summary: string;
  entity?: Record<string, unknown> | null;
}): ExecutedPlatformChatAction {
  return {
    content: input.content,
    libraries: [],
    actionResult: buildActionResult({
      action: input.action,
      status: 'failed',
      summary: input.summary,
      entity: input.entity,
      invalidate: [],
    }),
  };
}
