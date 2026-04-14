import { resolveDocumentSimilarityScopeKey } from './document-domain-signals.js';

function normalizeSimilarityText(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/^\d{10,}-/, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeSimilarityText(value: string) {
  return normalizeSimilarityText(value)
    .split(' ')
    .filter((token) => token.length >= 2)
    .slice(0, 48);
}

function buildDocumentSimilaritySeed(item: {
  name: string;
  title?: string;
  summary?: string;
  excerpt?: string;
  evidenceChunks?: Array<{ text?: string }>;
  schemaType?: string;
  category?: string;
  topicTags?: string[];
  groups?: string[];
  confirmedGroups?: string[];
  structuredProfile?: unknown;
}) {
  const titleKey = normalizeSimilarityText(item.title || item.name);
  const leadChunk = item.evidenceChunks?.[0]?.text || item.excerpt || item.summary || '';
  const contentKey = normalizeSimilarityText(leadChunk).slice(0, 220);
  const fingerprint = `${resolveDocumentSimilarityScopeKey(item)}|${titleKey}|${contentKey}`;
  return {
    titleKey,
    fingerprint,
    tokens: tokenizeSimilarityText(`${item.title || item.name} ${item.summary || ''} ${item.excerpt || ''}`),
  };
}

function computeTokenJaccard(a: string[], b: string[]) {
  if (!a.length || !b.length) return 0;
  const left = new Set(a);
  const right = new Set(b);
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  const union = new Set([...left, ...right]).size || 1;
  return intersection / union;
}

function chooseClusterPrimary(members: Array<{ path: string; createdAt: string; referenceCount: number; storageState: 'live' | 'structured-only' }>) {
  return [...members]
    .sort((a, b) => {
      if (b.referenceCount !== a.referenceCount) {
        return b.referenceCount - a.referenceCount;
      }
      if (Number(b.storageState === 'live') !== Number(a.storageState === 'live')) {
        return Number(b.storageState === 'live') - Number(a.storageState === 'live');
      }
      return Date.parse(b.createdAt || '') - Date.parse(a.createdAt || '');
    })[0];
}

export function buildSimilarityRecommendations(items: Array<{
  path: string;
  name: string;
  title?: string;
  summary?: string;
  excerpt?: string;
  evidenceChunks?: Array<{ text?: string }>;
  schemaType?: string;
  category?: string;
  topicTags?: string[];
  groups?: string[];
  confirmedGroups?: string[];
  structuredProfile?: unknown;
  createdAt: string;
  referenceCount: number;
  storageState: 'live' | 'structured-only';
}>) {
  const recommendations = new Map<string, { groupKey: string; size: number; cleanup: boolean }>();
  const buckets = new Map<string, typeof items>();

  for (const item of items) {
    const seed = buildDocumentSimilaritySeed(item);
    const bucketKey = `${resolveDocumentSimilarityScopeKey(item)}|${seed.titleKey || normalizeSimilarityText(item.name)}`;
    const existing = buckets.get(bucketKey) || [];
    existing.push(item);
    buckets.set(bucketKey, existing);
  }

  for (const [bucketKey, members] of buckets.entries()) {
    if (members.length < 2) continue;
    const clusterMembers: typeof items = [];
    const baseline = buildDocumentSimilaritySeed(members[0]);
    for (const member of members) {
      const seed = buildDocumentSimilaritySeed(member);
      const contentExact = baseline.fingerprint === seed.fingerprint && seed.fingerprint.length > 24;
      const tokenSimilarity = computeTokenJaccard(baseline.tokens, seed.tokens);
      if (contentExact || tokenSimilarity >= 0.82) {
        clusterMembers.push(member);
      }
    }

    if (clusterMembers.length < 2) continue;
    const primary = chooseClusterPrimary(clusterMembers);
    for (const member of clusterMembers) {
      recommendations.set(member.path, {
        groupKey: bucketKey,
        size: clusterMembers.length,
        cleanup: member.path !== primary.path && member.storageState === 'live' && member.referenceCount === 0,
      });
    }
  }

  return recommendations;
}
