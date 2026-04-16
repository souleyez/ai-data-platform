import { stripHtml, type PageResult } from './web-capture-page-fetch.js';
import {
  DISCOVERY_BAD_TERMS,
  DISCOVERY_SIGNAL_TERMS,
  DISCOVERY_URL_HINTS,
  getTaskFocusTerms,
  isSameHost,
  normalizeText,
  resolveTaskCrawlMode,
  type CandidateLink,
  type DiscoveryTaskLike,
  type WebCaptureCrawlMode,
} from './web-capture-discovery-support.js';

function isLikelyNoiseCandidate(url: string, title: string) {
  const loweredUrl = url.toLowerCase();
  const loweredTitle = title.toLowerCase();
  const badSignals = [
    'login',
    'signup',
    'account',
    'privacy',
    'cookie',
    'contact',
    'help',
    'about',
    'terms',
    'scholar.google',
    'google.com/scholar',
    'cite',
    'citation',
    'journal list',
    'journals/',
    'developer',
    'developers',
    'tools/',
    'pubinfo',
    'metrics',
    'dashboard',
    'share',
    'figure/',
    '/figures/',
    'figure -',
    'table/',
    '/tables/',
    '首页',
    '关于',
    '联系',
    '帮助',
    '服务指南',
    '政策法规',
  ];
  return badSignals.some((signal) => loweredUrl.includes(signal) || loweredTitle.includes(signal));
}

function isLikelyContentUrl(url: string, title: string) {
  const loweredUrl = url.toLowerCase();
  const loweredTitle = title.toLowerCase();
  const contentSignals = [
    '/article',
    '/articles/',
    '/full',
    '/abstract',
    '/paper',
    '/study',
    '/review',
    'pmc/articles/',
    'doi.org/10.',
    'journal.pone.',
  ];
  return contentSignals.some((signal) => loweredUrl.includes(signal) || loweredTitle.includes(signal));
}

export function isStrongContentPage(page: PageResult, baseUrl: string) {
  const normalized = normalizeText(page.text || '');
  if (normalized.length < 1200) return false;
  if (!isSameHost(page.url, baseUrl)) return false;
  if (isLikelyNoiseCandidate(page.url, page.title)) return false;
  return isLikelyContentUrl(page.url, page.title) || normalized.length >= 3000;
}

function scoreCandidate(url: string, title: string, focusTerms: string[], crawlMode: WebCaptureCrawlMode) {
  const loweredUrl = url.toLowerCase();
  const loweredTitle = title.toLowerCase();
  let score = 0;

  for (const term of focusTerms) {
    if (loweredTitle.includes(term)) score += 6;
    if (loweredUrl.includes(term)) score += 4;
  }

  const qualitySignals = ['article', 'paper', 'study', 'review', 'trial', 'abstract', 'full', 'methods', 'results'];
  const sourceSignals = ['.gov', '.edu', '.org', 'pubmed', 'pmc', 'arxiv', 'doi.org'];
  const badSignals = ['login', 'signup', 'account', 'privacy', 'cookie', 'contact', 'help', 'about', 'terms', 'scholar', 'citation', 'cite', 'developer', 'tools', 'journal list', 'dashboard'];

  qualitySignals.forEach((signal) => {
    if (loweredUrl.includes(signal) || loweredTitle.includes(signal)) score += 3;
  });

  sourceSignals.forEach((signal) => {
    if (loweredUrl.includes(signal)) score += 2;
  });

  badSignals.forEach((signal) => {
    if (loweredUrl.includes(signal) || loweredTitle.includes(signal)) score -= 12;
  });

  if (crawlMode === 'listing-detail') {
    DISCOVERY_SIGNAL_TERMS.forEach((signal) => {
      const loweredSignal = signal.toLowerCase();
      if (loweredUrl.includes(loweredSignal)) score += 5;
      if (loweredTitle.includes(loweredSignal)) score += 7;
    });

    DISCOVERY_URL_HINTS.forEach((signal) => {
      if (loweredUrl.includes(signal)) score += 4;
    });

    DISCOVERY_BAD_TERMS.forEach((signal) => {
      const loweredSignal = signal.toLowerCase();
      if (loweredUrl.includes(loweredSignal) || loweredTitle.includes(loweredSignal)) score -= 8;
    });
  }

  if (isLikelyContentUrl(url, title)) score += 6;
  if (title.length >= 20 && title.length <= 180) score += 2;
  return score;
}

export function extractCandidateLinks(
  html: string,
  baseUrl: string,
  task: Pick<DiscoveryTaskLike, 'focus' | 'keywords' | 'siteHints' | 'crawlMode'>,
  maxItems: number,
) {
  const focusTerms = getTaskFocusTerms(task);
  const crawlMode = resolveTaskCrawlMode(task);
  const linkRegex = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const dedup = new Map<string, CandidateLink>();
  let match: RegExpExecArray | null = null;

  while ((match = linkRegex.exec(html))) {
    try {
      const url = new URL(match[1], baseUrl).toString();
      const title = stripHtml(match[2]).slice(0, 220).trim();
      if (!/^https?:\/\//i.test(url) || !title) continue;
      if (!isSameHost(url, baseUrl)) continue;
      if (isLikelyNoiseCandidate(url, title)) continue;

      const dedupKey = `${url}|${normalizeText(title)}`;
      const candidate = {
        url,
        title,
        score: scoreCandidate(url, title, focusTerms, crawlMode),
      };

      const existing = dedup.get(dedupKey);
      if (!existing || candidate.score > existing.score) {
        dedup.set(dedupKey, candidate);
      }
    } catch {
      continue;
    }
  }

  const unique = Array.from(dedup.values())
    .filter((item) => item.score > -2)
    .sort((a, b) => b.score - a.score);

  const titleDedup = new Set<string>();
  const selected: CandidateLink[] = [];
  for (const item of unique) {
    const titleKey = normalizeText(item.title);
    if (!titleKey || titleDedup.has(titleKey)) continue;
    titleDedup.add(titleKey);
    selected.push(item);
    if (selected.length >= maxItems * 3) break;
  }

  return selected;
}
