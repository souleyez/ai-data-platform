import { createDocumentLibrary, loadDocumentLibraries, UNGROUPED_LIBRARY_KEY } from './document-libraries.js';
import { saveDocumentOverride, saveDocumentSuggestion } from './document-overrides.js';
import { mergeParsedDocumentsForPaths } from './document-store.js';
import { enqueueDetailedParse, runDetailedParseBatch } from './document-deep-parse-queue.js';
import { resolveSuggestedLibraryKeys } from './ingest-feedback.js';
import { loadIndexedDocumentMap } from './document-route-loaders.js';

type IndexedDocumentState = Awaited<ReturnType<typeof loadIndexedDocumentMap>>;
type ParsedDocumentItem = IndexedDocumentState['items'][number];

function normalizeClusterLabel(value: string) {
  return String(value || '')
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, ' ')
    .slice(0, 24);
}

function collectClusterSeeds(item: ParsedDocumentItem) {
  const seeds = new Set<string>();
  if (item.schemaType && item.schemaType !== 'generic') {
    seeds.add(normalizeClusterLabel(item.schemaType));
  }
  for (const tag of item.topicTags || []) {
    const normalized = normalizeClusterLabel(tag);
    if (normalized.length >= 3) seeds.add(normalized);
  }

  const profileTokens = Object.values(item.structuredProfile || {})
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .map((value) => normalizeClusterLabel(String(value || '')))
    .filter((token) => token.length >= 4)
    .slice(0, 4);

  for (const token of profileTokens) seeds.add(token);

  const titleTokens = String(item.title || item.name || '')
    .split(/[\s/\\|,閿涘被鈧偊绱遍敍姘剧礄閿涘鈧劑鈧叡-]+/)
    .map((token) => normalizeClusterLabel(token))
    .filter((token) => token.length >= 4);

  for (const token of titleTokens.slice(0, 3)) seeds.add(token);
  return [...seeds];
}

export async function reclusterUngroupedDocuments() {
  const { documentConfig: config, items } = await loadIndexedDocumentMap();
  const libraries = await loadDocumentLibraries();

  const initialCandidates = items.filter((item) => !item.ignored && item.parseStatus === 'parsed' && !(item.confirmedGroups?.length));
  const detailedCandidatePaths = initialCandidates
    .filter((item) => item.parseStage !== 'detailed')
    .map((item) => item.path)
    .slice(0, 48);

  if (detailedCandidatePaths.length) {
    await enqueueDetailedParse(detailedCandidatePaths);
    await runDetailedParseBatch(detailedCandidatePaths.length, config.scanRoots);
  }

  const refreshedItems = detailedCandidatePaths.length
    ? (await mergeParsedDocumentsForPaths(detailedCandidatePaths, 200, config.scanRoots, {
      parseStage: 'detailed',
      cloudEnhancement: true,
    })).items
    : items;

  const candidates = refreshedItems.filter((item) => !item.ignored && item.parseStatus === 'parsed' && !(item.confirmedGroups?.length));
  const clusterBuckets = new Map<string, typeof candidates>();
  let suggestedCount = 0;
  let createdLibraryCount = 0;

  for (const item of candidates) {
    const matched = resolveSuggestedLibraryKeys(item, libraries).filter((key) => {
      const library = libraries.find((entry) => entry.key === key);
      return Boolean(library && library.key !== UNGROUPED_LIBRARY_KEY);
    });

    if (matched.length) {
      await saveDocumentOverride(item.path, { groups: matched });
      suggestedCount += 1;
      continue;
    }

    await saveDocumentSuggestion(item.path, { suggestedGroups: [] });
    for (const seed of collectClusterSeeds(item)) {
      const bucket = clusterBuckets.get(seed) || [];
      bucket.push(item);
      clusterBuckets.set(seed, bucket);
    }
  }

  const assignedClusterDocPaths = new Set<string>();
  for (const [seed, bucket] of [...clusterBuckets.entries()].sort((a, b) => b[1].length - a[1].length)) {
    if (bucket.length < 10) continue;
    const created = await createDocumentLibrary({ name: seed, description: 'Auto-created from clustered ungrouped documents.' });
    if (!libraries.some((library) => library.key === created.key)) {
      createdLibraryCount += 1;
      libraries.push(created);
    }
    for (const item of bucket) {
      if (item.confirmedGroups?.length || assignedClusterDocPaths.has(item.path)) continue;
      await saveDocumentOverride(item.path, { groups: [created.key] });
      assignedClusterDocPaths.add(item.path);
    }
  }

  return {
    processedCount: candidates.length,
    suggestedCount,
    createdLibraryCount,
  };
}
