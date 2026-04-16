import type { DocumentVectorRecord } from './document-vector-records.js';
import { normalizeVectorDocumentPath } from './document-vector-index-eligibility.js';
import type { DocumentVectorRecallHit, DocumentVectorSearchOptions } from './document-vector-index-types.js';

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

function scoreAliasFitForRecord(record: DocumentVectorRecord, promptTokens: string[]) {
  if (record.kind !== 'profile-field' || !promptTokens.length) return 0;

  const aliasNames = Array.isArray(record.metadata?.profileAliases)
    ? (record.metadata.profileAliases as unknown[]).map((entry) => String(entry || '').toLowerCase()).filter(Boolean)
    : [];
  const aliasValues = Array.isArray(record.metadata?.profileAliasValues)
    ? (record.metadata.profileAliasValues as unknown[]).map((entry) => String(entry || '').toLowerCase()).filter(Boolean)
    : [];
  if (!aliasNames.length && !aliasValues.length) return 0;

  const aliasNameText = aliasNames.join(' ');
  const aliasValueText = aliasValues.join(' ');
  let score = 0;

  for (const token of promptTokens) {
    if (aliasNameText.includes(token)) score += token.length >= 4 ? 10 : 5;
    if (aliasValueText.includes(token)) score += token.length >= 4 ? 6 : 3;
  }

  return score;
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
  if (normalizedIntent === 'footfall' && !metadataText.includes('footfall') && !metadataText.includes('客流')) score -= 8;

  return score;
}

export function searchDocumentVectorRecords(
  records: DocumentVectorRecord[],
  prompt: string,
  limit = 18,
  options?: DocumentVectorSearchOptions,
): DocumentVectorRecallHit[] {
  const promptTokens = collectVectorTokens(prompt);
  if (!promptTokens.length) return [];

  const byPath = new Map<string, DocumentVectorRecallHit>();

  for (const record of records) {
    const score = scoreRecordByTokens(record, promptTokens)
      + scoreAliasFitForRecord(record, promptTokens)
      + scoreIntentFitForRecord(record, options?.intent)
      + scoreTemplateTaskFit(record, options?.templateTask);
    if (score <= 0) continue;

    const key = normalizeVectorDocumentPath(record.documentPath);
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
