import {
  fetchWebPage,
  stripHtml,
  type CookieJar,
  type PageResult,
  type RuntimeAuth,
} from './web-capture-page-fetch.js';

export type WebCaptureCrawlMode = 'single-page' | 'listing-detail';

type CandidateLink = {
  url: string;
  title: string;
  score: number;
};

type CaptureEntryLike = {
  title: string;
  url: string;
  summary: string;
  score: number;
};

type DiscoveryTaskLike = {
  url: string;
  focus: string;
  keywords?: string[];
  siteHints?: string[];
  seedUrls?: string[];
  crawlMode?: WebCaptureCrawlMode;
  maxItems?: number;
};

const MAX_FETCH_ATTEMPTS_FACTOR = 3;

const DISCOVERY_SIGNAL_TERMS = [
  '公告',
  '招标',
  '投标',
  '采购',
  '中标',
  '成交',
  '结果',
  '项目',
  '交易',
  '详情',
  '通知',
  '变更',
  '补充',
  '更正',
  'notice',
  'announcement',
  'bid',
  'bidding',
  'tender',
  'purchase',
  'procurement',
  'result',
  'detail',
  'project',
] as const;

const DISCOVERY_BAD_TERMS = [
  '首页',
  '登录',
  '注册',
  '隐私',
  '关于',
  '联系',
  '帮助',
  '服务指南',
  '政策法规',
  '新闻',
  'index',
  'home',
  'login',
  'signup',
  'privacy',
  'cookie',
  'contact',
  'help',
  'about',
  'terms',
  'guide',
] as const;

const DISCOVERY_URL_HINTS = [
  '/detail',
  '/notice',
  '/content',
  '/article',
  '/view',
  '/bulletin',
  '/bid',
  '/tender',
  '/purchase',
  '/project',
  '/result',
  'infoid=',
  'articleid=',
  'noticeid=',
  'contentid=',
] as const;

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim();
}

function normalizeStringList(value: unknown) {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,\n;]/)
      : [];
  const dedup = new Set<string>();
  for (const item of values) {
    const normalized = String(item || '').trim();
    if (!normalized) continue;
    dedup.add(normalized);
  }
  return Array.from(dedup);
}

function normalizeMaxItems(value?: number) {
  const parsed = Number(value || 5);
  if (!Number.isFinite(parsed)) return 5;
  return Math.min(20, Math.max(1, Math.round(parsed)));
}

function normalizeCrawlMode(value: unknown): WebCaptureCrawlMode {
  return String(value || '').trim().toLowerCase() === 'listing-detail' ? 'listing-detail' : 'single-page';
}

export function resolveTaskCrawlMode(task: Pick<DiscoveryTaskLike, 'crawlMode' | 'siteHints'>): WebCaptureCrawlMode {
  const explicit = normalizeCrawlMode(task.crawlMode);
  if (explicit === 'listing-detail') return explicit;
  const hintText = normalizeStringList(task.siteHints).join(' ').toLowerCase();
  return /(listing|detail|discover|crawl)/.test(hintText) ? 'listing-detail' : 'single-page';
}

function splitSentences(text: string) {
  return text
    .split(/(?<=[。！？?!])\s+|\n+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 24);
}

function getFocusTerms(focus: string) {
  return focus
    .split(/[；;，,\s/]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function getTaskFocusTerms(task: Pick<DiscoveryTaskLike, 'focus' | 'keywords' | 'siteHints' | 'crawlMode'>) {
  const dedup = new Set<string>();
  const collect = (value: string) => {
    for (const term of getFocusTerms(value)) {
      if (term) dedup.add(term);
    }
  };

  collect(task.focus || '');
  for (const keyword of normalizeStringList(task.keywords)) collect(keyword);
  for (const hint of normalizeStringList(task.siteHints)) collect(hint);

  if (resolveTaskCrawlMode(task) === 'listing-detail') {
    for (const term of DISCOVERY_SIGNAL_TERMS) dedup.add(term.toLowerCase());
  }

  return Array.from(dedup);
}

export function summarizeText(text: string, focus: string) {
  const sentences = splitSentences(text).slice(0, 50);
  if (!sentences.length) return '已抓取页面，但正文较少，当前只保留来源和页面概览。';

  const focusTerms = getFocusTerms(focus);
  const scored = sentences
    .map((sentence, index) => {
      const lowered = sentence.toLowerCase();
      const focusHits = focusTerms.reduce((acc, term) => acc + (lowered.includes(term) ? 2 : 0), 0);
      const positional = Math.max(0, 4 - Math.floor(index / 3));
      return { sentence, score: focusHits + positional };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => item.sentence);

  return scored.join(' ');
}

function getHostname(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isSameHost(url: string, baseUrl: string) {
  const host = getHostname(url);
  const baseHost = getHostname(baseUrl);
  return !!host && host === baseHost;
}

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

function isStrongContentPage(page: PageResult, baseUrl: string) {
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

function extractCandidateLinks(
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
    if (selected.length >= maxItems * MAX_FETCH_ATTEMPTS_FACTOR) break;
  }

  return selected;
}

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
