import {
  fetchWebPage,
  type CookieJar,
  type PageResult,
  type RuntimeAuth,
} from './web-capture-page-fetch.js';
import { extractCandidateLinks, isStrongContentPage } from './web-capture-discovery-candidates.js';
import {
  MAX_FETCH_ATTEMPTS_FACTOR,
  isSameHost,
  normalizeMaxItems,
  normalizeText,
  resolveTaskCrawlMode,
  summarizeText,
  type CandidateLink,
  type CaptureEntryLike,
  type DiscoveryTaskLike,
  type WebCaptureCrawlMode,
} from './web-capture-discovery-support.js';

export { resolveTaskCrawlMode, summarizeText } from './web-capture-discovery-support.js';
export type { WebCaptureCrawlMode } from './web-capture-discovery-support.js';

export async function collectRankedEntries(task: DiscoveryTaskLike, landing: PageResult, auth?: RuntimeAuth, jar?: CookieJar) {
  const maxItems = normalizeMaxItems(task.maxItems);
  const crawlMode = resolveTaskCrawlMode(task);
  const candidatePool = new Map<string, CandidateLink>();
  const seedPages: PageResult[] = [landing];
  const landingUrl = landing.url || task.url;

  if (crawlMode === 'listing-detail') {
    for (const seedUrl of task.seedUrls || []) {
      if (seedUrl === landingUrl) continue;
      try {
        const page = await fetchWebPage(seedUrl, auth, jar);
        if (page.kind !== 'page') continue;
        if (!isSameHost(page.url, task.url)) continue;
        seedPages.push(page);
      } catch {
        continue;
      }
    }
  }

  for (const page of seedPages) {
    const pageCandidates = extractCandidateLinks(page.html, page.url || task.url, task, maxItems);
    for (const candidate of pageCandidates) {
      const dedupKey = `${candidate.url}|${normalizeText(candidate.title)}`;
      const existing = candidatePool.get(dedupKey);
      if (!existing || candidate.score > existing.score) {
        candidatePool.set(dedupKey, candidate);
      }
    }
  }

  const candidates = Array.from(candidatePool.values()).sort((a, b) => b.score - a.score);
  const selected: CaptureEntryLike[] = [];
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();

  if (crawlMode !== 'listing-detail' && isStrongContentPage(landing, task.url)) {
    const title = landing.title || task.url;
    const titleKey = normalizeText(title);
    seenUrls.add(landing.url || task.url);
    if (titleKey) seenTitles.add(titleKey);
    selected.push({
      title,
      url: landing.url || task.url,
      summary: summarizeText(landing.text, task.focus),
      score: 100,
    });

    return selected;
  }

  for (const candidate of candidates) {
    if (selected.length >= maxItems) break;
    if (seenUrls.has(candidate.url)) continue;

    try {
      const page = await fetchWebPage(candidate.url, auth, jar);
      if (page.kind !== 'page') continue;
      const title = page.title || candidate.title;
      const titleKey = normalizeText(title);
      if (!titleKey || seenTitles.has(titleKey)) continue;

      seenUrls.add(candidate.url);
      seenTitles.add(titleKey);
      selected.push({
        title,
        url: candidate.url,
        summary: summarizeText(page.text, task.focus),
        score: candidate.score,
      });
    } catch {
      continue;
    }
  }

  return selected;
}
