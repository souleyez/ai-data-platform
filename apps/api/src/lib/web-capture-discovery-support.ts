export type WebCaptureCrawlMode = 'single-page' | 'listing-detail';

export type CandidateLink = {
  url: string;
  title: string;
  score: number;
};

export type CaptureEntryLike = {
  title: string;
  url: string;
  summary: string;
  score: number;
};

export type DiscoveryTaskLike = {
  url: string;
  focus: string;
  keywords?: string[];
  siteHints?: string[];
  seedUrls?: string[];
  crawlMode?: WebCaptureCrawlMode;
  maxItems?: number;
};

export const MAX_FETCH_ATTEMPTS_FACTOR = 3;

export const DISCOVERY_SIGNAL_TERMS = [
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

export const DISCOVERY_BAD_TERMS = [
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

export const DISCOVERY_URL_HINTS = [
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

export function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim();
}

export function normalizeStringList(value: unknown) {
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

export function normalizeMaxItems(value?: number) {
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

export function getTaskFocusTerms(task: Pick<DiscoveryTaskLike, 'focus' | 'keywords' | 'siteHints' | 'crawlMode'>) {
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

export function isSameHost(url: string, baseUrl: string) {
  const host = getHostname(url);
  const baseHost = getHostname(baseUrl);
  return !!host && host === baseHost;
}
