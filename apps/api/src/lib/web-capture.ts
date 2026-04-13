import { promises as fs } from 'node:fs';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';
import { DEFAULT_SCAN_DIR } from './document-store.js';
import { getDatasourceCredentialSecret } from './datasource-credentials.js';
import { STORAGE_ROOT } from './paths.js';
import { buildAugmentedEnv, getPythonCommandCandidates } from './runtime-executables.js';
import { readRuntimeStateJson, writeRuntimeStateJson } from './runtime-state-file.js';
import {
  clearWebCaptureSession,
  isWebCaptureSessionFresh,
  loadWebCaptureCredential,
  saveWebCaptureSession,
} from './web-capture-credentials.js';

const WEB_CAPTURE_DIR = path.join(STORAGE_ROOT, 'web-captures');
const TASKS_FILE = path.join(WEB_CAPTURE_DIR, 'tasks.json');
const OUTPUT_DIR = path.join(DEFAULT_SCAN_DIR, 'web-captures');
const DEFAULT_MAX_ITEMS = 5;
const MAX_FETCH_ATTEMPTS_FACTOR = 3;
const DEFAULT_RAW_DELETE_AFTER_HOURS = 48;
const execFileAsync = promisify(execFile);

export type WebCaptureFrequency = 'manual' | 'daily' | 'weekly';
export type WebCaptureCrawlMode = 'single-page' | 'listing-detail';

type CaptureEntry = {
  title: string;
  url: string;
  summary: string;
  score: number;
};

export type WebCaptureTask = {
  id: string;
  url: string;
  focus: string;
  frequency: WebCaptureFrequency;
  keywords?: string[];
  siteHints?: string[];
  seedUrls?: string[];
  crawlMode?: WebCaptureCrawlMode;
  maxItems?: number;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  lastStatus?: 'success' | 'error';
  lastSummary?: string;
  documentPath?: string;
  markdownPath?: string;
  rawDocumentPath?: string;
  rawDeleteAfterAt?: string;
  keepOriginalFiles?: boolean;
  title?: string;
  note?: string;
  nextRunAt?: string;
  lastCollectedCount?: number;
  lastCollectedItems?: CaptureEntry[];
  loginMode?: 'none' | 'credential';
  credentialRef?: string;
  credentialLabel?: string;
  captureStatus?: 'active' | 'paused';
  pausedAt?: string;
};

type TaskPayload = {
  items: WebCaptureTask[];
};

type PageResult = {
  kind: 'page';
  url: string;
  html: string;
  title: string;
  text: string;
  extractionMethod?: 'trafilatura' | 'fallback';
};

type DownloadResult = {
  kind: 'download';
  url: string;
  title: string;
  text: string;
  contentType: string;
  fileName: string;
  extension: string;
  data: Buffer;
};

type CandidateLink = {
  url: string;
  title: string;
  score: number;
};

type RuntimeAuth = {
  username: string;
  password: string;
};

type CookieJar = Map<string, Map<string, string>>;

type RuntimeAccess = {
  auth?: RuntimeAuth;
  headerOverrides?: Record<string, string>;
  storedCredential?: Awaited<ReturnType<typeof loadWebCaptureCredential>>;
  sessionCookieHeader?: string;
};

type LoginForm = {
  actionUrl: string;
  method: 'GET' | 'POST';
  fields: Array<{
    name: string;
    value: string;
    type: string;
  }>;
};

type MainContentResult = {
  text: string;
  title: string;
  method: 'trafilatura' | 'fallback';
};

const SUPPORTED_DOWNLOAD_EXTENSIONS = new Set([
  '.pdf',
  '.txt',
  '.md',
  '.docx',
  '.csv',
  '.html',
  '.htm',
  '.xml',
  '.json',
  '.xlsx',
  '.xls',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.bmp',
]);

const STRUCTURED_DOWNLOAD_EXTENSIONS = new Set([
  '.xlsx',
  '.xls',
  '.csv',
]);

const DOWNLOAD_MIME_EXTENSION_MAP: Record<string, string> = {
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'text/markdown': '.md',
  'application/json': '.json',
  'text/csv': '.csv',
  'application/csv': '.csv',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/bmp': '.bmp',
};

const DISCOVERY_SIGNAL_TERMS = [
  '\u516c\u544a',
  '\u62db\u6807',
  '\u6295\u6807',
  '\u91c7\u8d2d',
  '\u4e2d\u6807',
  '\u6210\u4ea4',
  '\u7ed3\u679c',
  '\u9879\u76ee',
  '\u4ea4\u6613',
  '\u8be6\u60c5',
  '\u901a\u77e5',
  '\u53d8\u66f4',
  '\u8865\u5145',
  '\u66f4\u6b63',
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
];

const DISCOVERY_BAD_TERMS = [
  '\u9996\u9875',
  '\u767b\u5f55',
  '\u6ce8\u518c',
  '\u9690\u79c1',
  '\u5173\u4e8e',
  '\u8054\u7cfb',
  '\u5e2e\u52a9',
  '\u670d\u52a1\u6307\u5357',
  '\u653f\u7b56\u6cd5\u89c4',
  '\u65b0\u95fb',
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
];

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
];

function buildTaskId(url: string) {
  return `web-${createHash('sha1').update(normalizeUrl(url)).digest('hex').slice(0, 16)}`;
}

function normalizeMaxItems(value?: number) {
  const parsed = Number(value || DEFAULT_MAX_ITEMS);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_ITEMS;
  return Math.min(20, Math.max(1, Math.round(parsed)));
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

function normalizeCrawlMode(value: unknown): WebCaptureCrawlMode {
  return String(value || '').trim().toLowerCase() === 'listing-detail' ? 'listing-detail' : 'single-page';
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim();
}

function normalizeUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach((key) => {
      url.searchParams.delete(key);
    });
    return url.toString();
  } catch {
    return value;
  }
}

function resolveSeedUrls(value: unknown, baseUrl: string) {
  const resolved: string[] = [];
  const dedup = new Set<string>();
  for (const rawValue of [baseUrl, ...normalizeStringList(value)]) {
    const raw = String(rawValue || '').trim();
    if (!raw) continue;
    try {
      const normalized = normalizeUrl(new URL(raw, baseUrl).toString());
      if (dedup.has(normalized)) continue;
      dedup.add(normalized);
      resolved.push(normalized);
    } catch {
      continue;
    }
  }
  return resolved;
}

function getCookieScope(url: string) {
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.host}`.toLowerCase();
}

function resolveTaskCrawlMode(task: Pick<WebCaptureTask, 'crawlMode' | 'siteHints'>): WebCaptureCrawlMode {
  const explicit = normalizeCrawlMode(task.crawlMode);
  if (explicit === 'listing-detail') return explicit;
  const hintText = normalizeStringList(task.siteHints).join(' ').toLowerCase();
  return /(listing|detail|discover|crawl)/.test(hintText) ? 'listing-detail' : 'single-page';
}

function ensureCookieBucket(jar: CookieJar, url: string) {
  const key = getCookieScope(url);
  let bucket = jar.get(key);
  if (!bucket) {
    bucket = new Map<string, string>();
    jar.set(key, bucket);
  }
  return bucket;
}

function getCookieHeader(jar: CookieJar, url: string) {
  const bucket = jar.get(getCookieScope(url));
  if (!bucket || !bucket.size) return '';
  return Array.from(bucket.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

function readSetCookieHeaders(response: Response) {
  const headerBag = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headerBag.getSetCookie === 'function') {
    return headerBag.getSetCookie();
  }

  const combined = response.headers.get('set-cookie');
  if (!combined) return [];
  return combined.split(/,(?=[^;,]+=)/g).map((item) => item.trim()).filter(Boolean);
}

function storeResponseCookies(jar: CookieJar, url: string, response: Response) {
  const bucket = ensureCookieBucket(jar, url);
  for (const rawCookie of readSetCookieHeaders(response)) {
    const firstPart = rawCookie.split(';')[0]?.trim();
    if (!firstPart) continue;
    const separatorIndex = firstPart.indexOf('=');
    if (separatorIndex <= 0) continue;
    const name = firstPart.slice(0, separatorIndex).trim();
    const value = firstPart.slice(separatorIndex + 1).trim();
    if (!name) continue;
    bucket.set(name, value);
  }
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .trim();
}

function decodeTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return decodeHtmlEntities(match?.[1]?.replace(/\s+/g, ' ').trim() || '');
}

async function extractMainContentWithTrafilatura(html: string, url: string) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-web-'));
  const htmlPath = path.join(tempDir, 'page.html');
  const pythonScript = [
    'import json, sys',
    'if hasattr(sys.stdout, "reconfigure"): sys.stdout.reconfigure(encoding="utf-8")',
    'from pathlib import Path',
    'try:',
    '    import trafilatura',
    'except Exception as exc:',
    '    print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))',
    '    sys.exit(0)',
    'html = Path(sys.argv[2]).read_text(encoding="utf-8")',
    'downloaded = html',
    'text = trafilatura.extract(downloaded, url=sys.argv[1], include_comments=False, include_tables=True) or ""',
    'metadata = trafilatura.extract_metadata(downloaded)',
    'title = ""',
    'if metadata is not None:',
    '    title = getattr(metadata, "title", "") or ""',
    'print(json.dumps({"ok": True, "text": text, "title": title}, ensure_ascii=False))',
  ].join('\n');

  try {
    await fs.writeFile(htmlPath, html, 'utf8');

    const candidates = getPythonCommandCandidates().map((command) => ({
      command,
      args: ['-c', pythonScript, url, htmlPath],
    }));

    for (const candidate of candidates) {
      try {
        const { stdout } = await execFileAsync(candidate.command, candidate.args, {
          maxBuffer: 32 * 1024 * 1024,
          env: buildAugmentedEnv(),
        });
        const parsed = JSON.parse(String(stdout || '{}')) as { ok?: boolean; text?: string; title?: string };
        if (parsed.ok) {
          return {
            text: String(parsed.text || ''),
            title: String(parsed.title || ''),
          };
        }
      } catch {
        // try next interpreter
      }
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }

  return {
    text: '',
    title: '',
  };
}

async function extractMainContent(html: string, url: string): Promise<MainContentResult> {
  const extracted = await extractMainContentWithTrafilatura(html, url);
  const normalized = stripHtml(extracted.text || '');
  if (normalized.length >= 180) {
    return {
      text: normalized,
      title: extracted.title || decodeTitle(html),
      method: 'trafilatura',
    };
  }

  return {
    text: stripHtml(html),
    title: decodeTitle(html),
    method: 'fallback',
  };
}

function decodeAttribute(value: string) {
  return decodeHtmlEntities(String(value || '').replace(/^['"]|['"]$/g, '').trim());
}

function parseHtmlAttributes(input: string) {
  const attributes: Record<string, string> = {};
  const attributeRegex = /([^\s=/>]+)(?:\s*=\s*(".*?"|'.*?'|[^\s>]+))?/g;
  let match: RegExpExecArray | null = null;

  while ((match = attributeRegex.exec(input))) {
    const name = match[1]?.toLowerCase();
    if (!name) continue;
    attributes[name] = decodeAttribute(match[2] || '');
  }

  return attributes;
}

function isLikelyLoginPage(page: PageResult) {
  return /type=["']password["']/i.test(page.html)
    || /(登录|login|sign in|signin)/i.test(page.title)
    || /(登录|login|sign in|signin)/i.test(page.url);
}

function extractLoginForm(page: PageResult): LoginForm | null {
  const formRegex = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let match: RegExpExecArray | null = null;

  while ((match = formRegex.exec(page.html))) {
    const formAttrs = parseHtmlAttributes(match[1] || '');
    const body = match[2] || '';
    if (!/type=["']password["']/i.test(body)) continue;

    const fields: LoginForm['fields'] = [];
    const inputRegex = /<input\b([^>]*)>/gi;
    let inputMatch: RegExpExecArray | null = null;
    while ((inputMatch = inputRegex.exec(body))) {
      const attrs = parseHtmlAttributes(inputMatch[1] || '');
      const name = attrs.name || '';
      if (!name) continue;
      fields.push({
        name,
        value: attrs.value || '',
        type: (attrs.type || 'text').toLowerCase(),
      });
    }

    const actionUrl = new URL(formAttrs.action || page.url, page.url).toString();
    const method = String(formAttrs.method || 'POST').toUpperCase() === 'GET' ? 'GET' : 'POST';

    return {
      actionUrl,
      method,
      fields,
    };
  }

  return null;
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

function getTaskFocusTerms(task: Pick<WebCaptureTask, 'focus' | 'keywords' | 'siteHints' | 'crawlMode'>) {
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

function parseCookieHeaderValue(value: string) {
  return String(value || '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((entry) => {
      const separatorIndex = entry.indexOf('=');
      if (separatorIndex <= 0) return ['', ''] as const;
      return [entry.slice(0, separatorIndex).trim(), entry.slice(separatorIndex + 1).trim()] as const;
    })
    .filter(([name, cookieValue]) => Boolean(name && cookieValue));
}

function applyCookieHeaderToJar(jar: CookieJar, url: string, cookieHeader: string) {
  const bucket = ensureCookieBucket(jar, url);
  for (const [name, cookieValue] of parseCookieHeaderValue(cookieHeader)) {
    bucket.set(name, cookieValue);
  }
}

function applySerializedSessionCookies(
  jar: CookieJar,
  sessionCookies: Record<string, Record<string, string>>,
) {
  for (const [scope, bucket] of Object.entries(sessionCookies || {})) {
    const jarBucket = ensureCookieBucket(jar, scope);
    for (const [name, cookieValue] of Object.entries(bucket || {})) {
      if (!name || !cookieValue) continue;
      jarBucket.set(name, cookieValue);
    }
  }
}

function serializeCookieJar(jar: CookieJar) {
  const next: Record<string, Record<string, string>> = {};
  for (const [scope, bucket] of jar.entries()) {
    if (!scope || !bucket?.size) continue;
    next[scope] = Object.fromEntries(
      Array.from(bucket.entries()).filter(([name, cookieValue]) => Boolean(name && cookieValue)),
    );
  }
  return next;
}

function hasCookiesInJar(jar: CookieJar) {
  for (const bucket of jar.values()) {
    if (bucket.size) return true;
  }
  return false;
}

function summarizeText(text: string, focus: string) {
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

function getFrequencyIntervalMs(frequency: WebCaptureFrequency) {
  if (frequency === 'daily') return 24 * 60 * 60 * 1000;
  if (frequency === 'weekly') return 7 * 24 * 60 * 60 * 1000;
  return 0;
}

function computeNextRunAt(task: Pick<WebCaptureTask, 'frequency' | 'lastRunAt' | 'createdAt'>) {
  const intervalMs = getFrequencyIntervalMs(task.frequency);
  if (!intervalMs) return '';

  const base = task.lastRunAt || task.createdAt;
  const baseMs = Date.parse(base);
  if (Number.isNaN(baseMs)) return '';
  return new Date(baseMs + intervalMs).toISOString();
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
    '\u9996\u9875',
    '\u5173\u4e8e',
    '\u8054\u7cfb',
    '\u5e2e\u52a9',
    '\u670d\u52a1\u6307\u5357',
    '\u653f\u7b56\u6cd5\u89c4',
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

function isTaskDue(task: WebCaptureTask, now = Date.now()) {
  if (task.captureStatus === 'paused') return false;
  if (task.frequency === 'manual') return false;
  const nextRunAt = computeNextRunAt(task);
  if (!nextRunAt) return true;
  return Date.parse(nextRunAt) <= now;
}

function shouldKeepOriginalDownload(task: Pick<WebCaptureTask, 'keepOriginalFiles'>, extension: string) {
  const normalizedExtension = String(extension || '').toLowerCase();
  if (task.keepOriginalFiles) return true;
  return STRUCTURED_DOWNLOAD_EXTENSIONS.has(normalizedExtension);
}

function buildRawDeleteAfterAt(nowIso: string) {
  const baseMs = Date.parse(nowIso);
  if (Number.isNaN(baseMs)) return '';
  return new Date(baseMs + DEFAULT_RAW_DELETE_AFTER_HOURS * 60 * 60 * 1000).toISOString();
}

async function ensureDirs() {
  await fs.mkdir(WEB_CAPTURE_DIR, { recursive: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

async function readTasks(): Promise<WebCaptureTask[]> {
  const { data } = await readRuntimeStateJson<TaskPayload>({
    filePath: TASKS_FILE,
    fallback: { items: [] },
    normalize: (parsed) => ({
      items: Array.isArray((parsed as { items?: unknown[] } | null)?.items)
        ? (parsed as TaskPayload).items
        : [],
    }),
  });
  return dedupeTasks(Array.isArray(data.items) ? data.items : []);
}

async function writeTasks(items: WebCaptureTask[]) {
  await ensureDirs();
  await writeRuntimeStateJson({
    filePath: TASKS_FILE,
    payload: { items: dedupeTasks(items) },
  });
}

function dedupeTasks(items: WebCaptureTask[]) {
  const byUrl = new Map<string, WebCaptureTask>();
  for (const item of items) {
    const key = normalizeUrl(item.url);
    const current = byUrl.get(key);
    if (!current) {
      byUrl.set(key, item);
      continue;
    }

    const currentTs = Date.parse(current.updatedAt || current.lastRunAt || current.createdAt || '') || 0;
    const nextTs = Date.parse(item.updatedAt || item.lastRunAt || item.createdAt || '') || 0;
    if (nextTs >= currentTs) {
      byUrl.set(key, {
        ...current,
        ...item,
        id: current.id || item.id || buildTaskId(item.url),
        createdAt: current.createdAt || item.createdAt,
      });
    }
  }

  return Array.from(byUrl.values())
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
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
  task: Pick<WebCaptureTask, 'focus' | 'keywords' | 'siteHints' | 'crawlMode'>,
  maxItems: number,
) {
  const focusTerms = getTaskFocusTerms(task);
  const crawlMode = resolveTaskCrawlMode(task);
  const linkRegex = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const dedup = new Map<string, CandidateLink>();
  let match: RegExpExecArray | null = null;

  while ((match = linkRegex.exec(html))) {
    try {
      const url = normalizeUrl(new URL(match[1], baseUrl).toString());
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

function buildLoginPayload(form: LoginForm, auth: RuntimeAuth) {
  const params = new URLSearchParams();
  const usernameField = form.fields.find((field) => /(user|email|login|account|name|phone)/i.test(field.name) && field.type !== 'hidden')
    || form.fields.find((field) => field.type === 'text' || field.type === 'email')
    || form.fields[0];
  const passwordField = form.fields.find((field) => field.type === 'password');

  for (const field of form.fields) {
    if (!field.name) continue;
    if (usernameField?.name === field.name) {
      params.set(field.name, auth.username);
    } else if (passwordField?.name === field.name) {
      params.set(field.name, auth.password);
    } else if (field.type === 'checkbox' || field.type === 'radio') {
      if (field.value) params.set(field.name, field.value);
    } else {
      params.set(field.name, field.value || '');
    }
  }

  if (usernameField && !params.has(usernameField.name)) {
    params.set(usernameField.name, auth.username);
  }
  if (passwordField && !params.has(passwordField.name)) {
    params.set(passwordField.name, auth.password);
  }

  return params;
}

function inferDownloadExtension(url: string, contentType: string, contentDisposition: string) {
  const headerName = contentDisposition.match(/filename\*?=(?:UTF-8''|"?)([^\";]+)/i)?.[1]?.trim();
  const decodedHeaderName = headerName ? decodeURIComponent(headerName.replace(/^["']|["']$/g, '')) : '';
  const headerExt = path.extname(decodedHeaderName).toLowerCase();
  if (SUPPORTED_DOWNLOAD_EXTENSIONS.has(headerExt)) return headerExt;

  const contentTypeKey = String(contentType || '').split(';')[0].trim().toLowerCase();
  const mimeExt = DOWNLOAD_MIME_EXTENSION_MAP[contentTypeKey];
  if (mimeExt && SUPPORTED_DOWNLOAD_EXTENSIONS.has(mimeExt)) return mimeExt;

  try {
    const urlExt = path.extname(new URL(url).pathname).toLowerCase();
    if (SUPPORTED_DOWNLOAD_EXTENSIONS.has(urlExt)) return urlExt;
  } catch {
    return '';
  }

  return '';
}

function inferDownloadFileName(url: string, contentDisposition: string, extension: string) {
  const headerName = contentDisposition.match(/filename\*?=(?:UTF-8''|"?)([^\";]+)/i)?.[1]?.trim();
  const decodedHeaderName = headerName ? decodeURIComponent(headerName.replace(/^["']|["']$/g, '')) : '';
  if (decodedHeaderName) return decodedHeaderName;

  try {
    const pathname = new URL(url).pathname;
    const candidate = decodeURIComponent(path.basename(pathname));
    if (candidate && path.extname(candidate)) return candidate;
    if (candidate) return `${candidate}${extension || ''}`;
  } catch {
    return `capture${extension || ''}`;
  }

  return `capture${extension || ''}`;
}

function isDownloadResponse(url: string, response: Response) {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const contentDisposition = String(response.headers.get('content-disposition') || '').toLowerCase();
  if (/attachment|filename=/i.test(contentDisposition)) {
    return Boolean(inferDownloadExtension(url, contentType, contentDisposition));
  }
  if (/text\/html|application\/xhtml\+xml/i.test(contentType)) return false;
  if (/application\/octet-stream|application\/pdf|application\/vnd\.ms-excel|spreadsheetml|text\/csv|application\/csv|image\//i.test(contentType)) {
    return Boolean(inferDownloadExtension(url, contentType, contentDisposition));
  }
  return false;
}

async function fetchWebPage(
  url: string,
  auth?: RuntimeAuth,
  jar?: CookieJar,
  headerOverrides?: Record<string, string>,
): Promise<PageResult | DownloadResult> {
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (compatible; ai-data-platform/0.1; +https://example.local)',
    Accept: 'text/html,application/xhtml+xml,application/pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream',
    ...(headerOverrides || {}),
  };

  if (auth?.username && auth?.password) {
    headers.Authorization = `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`;
  }

  const cookieHeader = jar ? getCookieHeader(jar, url) : '';
  if (cookieHeader) headers.Cookie = cookieHeader;

  const response = await fetch(url, {
    redirect: 'follow',
    headers,
  });

  if (!response.ok) {
    throw new Error(`fetch failed: ${response.status}`);
  }

  if (jar) storeResponseCookies(jar, url, response);
  if (isDownloadResponse(url, response)) {
    const contentType = String(response.headers.get('content-type') || '');
    const contentDisposition = String(response.headers.get('content-disposition') || '');
    const extension = inferDownloadExtension(response.url || url, contentType, contentDisposition) || '.bin';
    const fileName = inferDownloadFileName(response.url || url, contentDisposition, extension);
    const data = Buffer.from(await response.arrayBuffer());
    const title = path.basename(fileName, path.extname(fileName)) || fileName || (response.url || url);
    return {
      kind: 'download',
      url: response.url || url,
      title,
      text: `${title}\n${fileName}\n${contentType}`.trim(),
      contentType,
      fileName,
      extension,
      data,
    };
  }

  const html = await response.text();
  const main = await extractMainContent(html, response.url || url);
  const title = main.title || decodeTitle(html);
  const text = main.text;
  return { kind: 'page', url: response.url || url, html, title, text, extractionMethod: main.method };
}

async function submitLoginForm(
  page: PageResult,
  auth: RuntimeAuth,
  jar: CookieJar,
  headerOverrides?: Record<string, string>,
) {
  const form = extractLoginForm(page);
  if (!form) {
    throw new Error('login form not detected');
  }

  const payload = buildLoginPayload(form, auth);
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (compatible; ai-data-platform/0.1; +https://example.local)',
    Accept: 'text/html,application/xhtml+xml',
    Referer: page.url,
    ...(headerOverrides || {}),
  };

  const cookieHeader = getCookieHeader(jar, form.actionUrl);
  if (cookieHeader) headers.Cookie = cookieHeader;

  let response: Response;
  if (form.method === 'GET') {
    const target = new URL(form.actionUrl);
    payload.forEach((value, key) => target.searchParams.set(key, value));
    response = await fetch(target.toString(), {
      method: 'GET',
      redirect: 'follow',
      headers,
    });
  } else {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    response = await fetch(form.actionUrl, {
      method: 'POST',
      redirect: 'follow',
      headers,
      body: payload.toString(),
    });
  }

  if (jar) storeResponseCookies(jar, form.actionUrl, response);
  if (isDownloadResponse(form.actionUrl, response)) {
    const contentType = String(response.headers.get('content-type') || '');
    const contentDisposition = String(response.headers.get('content-disposition') || '');
    const extension = inferDownloadExtension(response.url || form.actionUrl, contentType, contentDisposition) || '.bin';
    const fileName = inferDownloadFileName(response.url || form.actionUrl, contentDisposition, extension);
    const data = Buffer.from(await response.arrayBuffer());
    const title = path.basename(fileName, path.extname(fileName)) || fileName || (response.url || form.actionUrl);
    return {
      kind: 'download' as const,
      url: response.url || form.actionUrl,
      title,
      text: `${title}\n${fileName}\n${contentType}`.trim(),
      contentType,
      fileName,
      extension,
      data,
    };
  }

  const html = await response.text();
  const main = await extractMainContent(html, response.url || form.actionUrl);
  const title = main.title || decodeTitle(html);
  const text = main.text;
  return { kind: 'page' as const, url: response.url || form.actionUrl, html, title, text, extractionMethod: main.method };
}

function formatExtractionMethod(method?: PageResult['extractionMethod']) {
  return method === 'trafilatura' ? 'Trafilatura 正文提取' : '基础清洗 fallback';
}

function normalizeCaptureNoiseKey(value: string) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanCapturedText(text: string, maxChars = 8000) {
  const rawLines = String(text || '')
    .replace(/\u0000/g, ' ')
    .replace(/(?:^|\s)(?:第\s*\d+\s*页(?:\s*共\s*\d+\s*页)?|page\s*\d+(?:\s*of\s*\d+)?)(?=\s|$)/gi, ' ')
    .replace(/\r/g, '')
    .split('\n');
  const lineFrequencies = new Map<string, number>();

  for (const line of rawLines) {
    const normalized = normalizeCaptureNoiseKey(line);
    if (!normalized || normalized.length > 60) continue;
    lineFrequencies.set(normalized, (lineFrequencies.get(normalized) || 0) + 1);
  }

  const cleanedLines: string[] = [];
  let previousBlank = true;
  for (const line of rawLines) {
    const normalized = String(line || '').replace(/\s+/g, ' ').trim();
    const noiseKey = normalizeCaptureNoiseKey(normalized);

    if (!normalized) {
      if (!previousBlank) cleanedLines.push('');
      previousBlank = true;
      continue;
    }

    if (
      /^(?:page\s*\d+(?:\s*of\s*\d+)?|第\s*\d+\s*页(?:\s*\/\s*共?\s*\d+\s*页)?|页眉|页脚|header|footer)$/i.test(normalized)
      || /^[#=*_~\-|·•]{3,}$/.test(normalized)
      || /^\|?\s*:?-{2,}:?(?:\s*\|\s*:?-{2,}:?)*\s*\|?$/.test(normalized)
      || (/^(?:copyright|版权所有)$/i.test(normalized) && normalized.length <= 20)
      || (noiseKey && (lineFrequencies.get(noiseKey) || 0) >= 3 && normalized.length <= 60)
    ) {
      continue;
    }

    cleanedLines.push(normalized);
    previousBlank = false;
  }

  return cleanedLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxChars);
}

function decodeDownloadTextBuffer(data: Buffer) {
  const utf8 = data.toString('utf8').replace(/\u0000/g, '').trim();
  const utf16 = data.toString('utf16le').replace(/\u0000/g, '').trim();

  if (!utf8) return utf16;
  if (!utf16) return utf8;

  const utf8ReplacementCount = (utf8.match(/�/g) || []).length;
  const utf16ReplacementCount = (utf16.match(/�/g) || []).length;
  if (utf16ReplacementCount < utf8ReplacementCount) return utf16;
  return utf8;
}

function renderMarkdownTable(rows: string[][]) {
  if (!rows.length) return '';
  const width = Math.max(...rows.map((row) => row.length), 1);
  const normalizedRows = rows
    .map((row) => Array.from({ length: width }, (_, index) => String(row[index] || '').replace(/\|/g, '/').trim()))
    .filter((row) => row.some(Boolean));
  if (!normalizedRows.length) return '';

  const header = normalizedRows[0].map((cell, index) => cell || `列${index + 1}`);
  const body = normalizedRows.slice(1).map((row) => row.map((cell) => cell || '-'));
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...body.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

async function extractDownloadMarkdownBody(file: DownloadResult) {
  const extension = String(file.extension || '').toLowerCase();

  if (extension === '.xlsx' || extension === '.xls' || extension === '.csv') {
    const xlsx = await import('xlsx');
    const workbook = xlsx.default?.read
      ? xlsx.default.read(file.data, { type: 'buffer', raw: false })
      : xlsx.read(file.data, { type: 'buffer', raw: false });
    const { utils } = xlsx;
    return workbook.SheetNames
      .slice(0, 4)
      .flatMap((sheetName) => {
        const rows = utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false }) as unknown[][];
        const normalizedRows = rows
          .slice(0, 20)
          .map((row) => row.map((cell) => String(cell ?? '').trim()));
        const table = renderMarkdownTable(normalizedRows);
        if (!table) return [] as string[];
        return [`### 工作表：${sheetName}`, '', table, ''];
      })
      .join('\n')
      .trim();
  }

  if (extension === '.json') {
    const rawText = decodeDownloadTextBuffer(file.data);
    try {
      return `\`\`\`json\n${JSON.stringify(JSON.parse(rawText), null, 2)}\n\`\`\``;
    } catch {
      return cleanCapturedText(rawText);
    }
  }

  if (extension === '.html' || extension === '.htm' || extension === '.xml') {
    return cleanCapturedText(stripHtml(decodeDownloadTextBuffer(file.data)));
  }

  if (extension === '.txt' || extension === '.md') {
    return cleanCapturedText(decodeDownloadTextBuffer(file.data));
  }

  return cleanCapturedText(file.text || '');
}

function toMarkdown(
  task: WebCaptureTask,
  title: string,
  summary: string,
  entries: CaptureEntry[],
  landingText: string,
  extractionMethod?: PageResult['extractionMethod'],
) {
  const landingSnippet = cleanCapturedText(landingText, 6000);
  const normalizedSummary = cleanCapturedText(summary, 2000);
  return [
    `# ${title || '网页采集结果'}`,
    '',
    '## 采集元数据',
    `- 来源链接：${task.url}`,
    `- 采集焦点：${task.focus || '网页正文与关键信息'}`,
    `- 采集频率：${task.frequency}`,
    `- 最大条数：${normalizeMaxItems(task.maxItems)} 条`,
    `- 正文提取：${formatExtractionMethod(extractionMethod)}`,
    '- 输出说明：当前文件为网页采集后的标准 Markdown 镜像。',
    `- 采集时间：${new Date().toISOString()}`,
    '',
    '## 采集摘要',
    normalizedSummary || summary,
    '',
    '## 候选条目',
    ...(entries.length
      ? entries.flatMap((entry, index) => [
        `### ${index + 1}. ${entry.title}`,
        `- 链接：${entry.url}`,
        `- 评分：${entry.score}`,
        `- 摘要：${entry.summary}`,
        '',
      ])
      : ['当前未命中更多候选条目，已保留落地页正文。', '']),
    '## 页面正文',
    landingSnippet || '当前页面正文较少，未提取到稳定文本。',
    '',
  ].join('\n');
}

async function writeCaptureDocument(
  task: WebCaptureTask,
  title: string,
  summary: string,
  entries: CaptureEntry[],
  landingText: string,
  extractionMethod?: PageResult['extractionMethod'],
) {
  await ensureDirs();
  const safeName = (title || task.url)
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80);
  const filePath = path.join(OUTPUT_DIR, `${task.id}-${safeName || 'capture'}.md`);
  await fs.writeFile(filePath, toMarkdown(task, title, summary, entries, landingText, extractionMethod), 'utf8');
  return filePath;
}

async function writeDownloadedCapture(task: WebCaptureTask, file: DownloadResult) {
  await ensureDirs();
  const baseName = path.basename(file.fileName, file.extension)
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80);
  const safeBase = baseName || 'capture';
  const filePath = path.join(OUTPUT_DIR, `${task.id}-${safeBase}${file.extension}`);
  await fs.writeFile(filePath, file.data);
  const markdownPath = path.join(OUTPUT_DIR, `${task.id}-${safeBase}-normalized.md`);
  const markdownBody = await extractDownloadMarkdownBody(file);
  const markdownContent = [
    `# ${file.title || safeBase || '网页下载内容'}`,
    '',
    '## 采集元数据',
    `- 来源链接：${file.url || task.url}`,
    `- 原始文件：${path.basename(filePath)}`,
    `- 内容类型：${file.contentType || 'unknown'}`,
    `- 采集焦点：${task.focus || '网页采集内容'}`,
    `- 采集时间：${new Date().toISOString()}`,
    '',
    '## 提取摘要',
    markdownBody || '当前原始文件已保存，暂未生成更详细的 Markdown 摘要。',
    '',
  ].join('\n');
  await fs.writeFile(markdownPath, markdownContent, 'utf8');
  const keepOriginal = shouldKeepOriginalDownload(task, file.extension);
  return {
    documentPath: keepOriginal ? filePath : markdownPath,
    markdownPath,
    rawDocumentPath: keepOriginal ? '' : filePath,
    rawDeleteAfterAt: keepOriginal ? '' : buildRawDeleteAfterAt(new Date().toISOString()),
  };
}

async function cleanupExpiredWebCaptureRawFiles(items: WebCaptureTask[], now = new Date()) {
  const nowMs = now.getTime();
  let changed = false;
  let cleanedCount = 0;
  const nextItems: WebCaptureTask[] = [];

  for (const item of items) {
    const rawDocumentPath = String(item.rawDocumentPath || '').trim();
    const rawDeleteAfterAt = String(item.rawDeleteAfterAt || '').trim();
    if (
      rawDocumentPath
      && rawDeleteAfterAt
      && Date.parse(rawDeleteAfterAt) <= nowMs
      && !item.keepOriginalFiles
    ) {
      try {
        await fs.rm(rawDocumentPath, { force: true });
      } catch {
        // best effort cleanup
      }
      nextItems.push({
        ...item,
        rawDocumentPath: '',
        rawDeleteAfterAt: '',
      });
      changed = true;
      cleanedCount += 1;
      continue;
    }
    nextItems.push(item);
  }

  if (changed) {
    await writeTasks(nextItems);
  }

  return {
    items: nextItems,
    cleanedCount,
  };
}

async function collectRankedEntries(task: WebCaptureTask, landing: PageResult, auth?: RuntimeAuth, jar?: CookieJar) {
  const maxItems = normalizeMaxItems(task.maxItems);
  const crawlMode = resolveTaskCrawlMode(task);
  const candidatePool = new Map<string, CandidateLink>();
  const seedPages: PageResult[] = [landing];
  const landingUrl = normalizeUrl(landing.url || task.url);

  if (crawlMode === 'listing-detail') {
    for (const seedUrl of resolveSeedUrls(task.seedUrls, task.url)) {
      if (normalizeUrl(seedUrl) === landingUrl) continue;
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
  const selected: CaptureEntry[] = [];
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();

  if (crawlMode !== 'listing-detail' && isStrongContentPage(landing, task.url)) {
    const title = landing.title || task.url;
    const titleKey = normalizeText(title);
    seenUrls.add(normalizeUrl(landing.url || task.url));
    if (titleKey) seenTitles.add(titleKey);
    selected.push({
      title,
      url: normalizeUrl(landing.url || task.url),
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

async function resolveRuntimeAccess(task: WebCaptureTask, auth?: RuntimeAuth): Promise<RuntimeAccess> {
  if (auth?.username && auth?.password) {
    return {
      auth,
      headerOverrides: undefined,
      storedCredential: task.credentialRef ? await loadWebCaptureCredential(task.url) : null,
      sessionCookieHeader: '',
    };
  }

  let storedCredential = null;
  let datasourceSecret = null;
  if (task.credentialRef) {
    storedCredential = await loadWebCaptureCredential(task.url);
    datasourceSecret = await getDatasourceCredentialSecret(task.credentialRef);
  }

  const resolvedAuth = storedCredential?.username && storedCredential?.password
    ? { username: storedCredential.username, password: storedCredential.password }
    : datasourceSecret?.username && datasourceSecret?.password
      ? { username: datasourceSecret.username, password: datasourceSecret.password }
      : undefined;

  return {
    auth: resolvedAuth,
    storedCredential,
    sessionCookieHeader: String(datasourceSecret?.cookies || '').trim(),
    headerOverrides: datasourceSecret?.headers && Object.keys(datasourceSecret.headers).length
      ? datasourceSecret.headers
      : undefined,
  };
}

async function runCapture(task: WebCaptureTask, now: string, auth?: RuntimeAuth) {
  try {
    const normalizedTask = {
      ...task,
      maxItems: normalizeMaxItems(task.maxItems),
      keywords: normalizeStringList(task.keywords),
      siteHints: normalizeStringList(task.siteHints),
      seedUrls: resolveSeedUrls(task.seedUrls, task.url),
      crawlMode: resolveTaskCrawlMode(task),
    };
    const runtime = await resolveRuntimeAccess(normalizedTask, auth);
    const runtimeAuth = runtime.auth;
    const jar: CookieJar = new Map();
    if (runtime.sessionCookieHeader) {
      applyCookieHeaderToJar(jar, normalizedTask.url, runtime.sessionCookieHeader);
    }
    if (runtime.storedCredential?.sessionCookies && isWebCaptureSessionFresh(runtime.storedCredential.sessionUpdatedAt)) {
      applySerializedSessionCookies(jar, runtime.storedCredential.sessionCookies);
    }
    let landing = await fetchWebPage(normalizedTask.url, runtimeAuth, jar, runtime.headerOverrides);

    if (landing.kind === 'download') {
      if (normalizedTask.credentialRef && hasCookiesInJar(jar)) {
        await saveWebCaptureSession({
          url: normalizedTask.url,
          sessionCookies: serializeCookieJar(jar),
          updatedAt: now,
        }).catch(() => undefined);
      }
      const storedDownload = await writeDownloadedCapture(normalizedTask, landing);
      const summary = shouldKeepOriginalDownload(normalizedTask, landing.extension)
        ? `本次采集识别为可下载文件，已保留原始 ${landing.extension.replace(/^\./, '').toUpperCase()} 并进入文档解析。`
        : `本次采集识别为可下载文件，已清洗为 Markdown 入库，原始 ${landing.extension.replace(/^\./, '').toUpperCase()} 将按策略自动回收。`;
      return {
        ...normalizedTask,
        title: landing.title || normalizedTask.url,
        documentPath: storedDownload.documentPath,
        markdownPath: storedDownload.markdownPath,
        rawDocumentPath: storedDownload.rawDocumentPath,
        rawDeleteAfterAt: storedDownload.rawDeleteAfterAt,
        lastSummary: summary,
        lastStatus: 'success' as const,
        lastRunAt: now,
        updatedAt: now,
        nextRunAt: computeNextRunAt({ ...normalizedTask, lastRunAt: now }),
        lastCollectedCount: 1,
        lastCollectedItems: [{
          title: landing.title || landing.fileName,
          url: landing.url,
          summary,
          score: 100,
        }],
      };
    }

    if (runtimeAuth && isLikelyLoginPage(landing)) {
      if (runtime.storedCredential?.sessionCookies && isWebCaptureSessionFresh(runtime.storedCredential.sessionUpdatedAt)) {
        await clearWebCaptureSession(normalizedTask.url).catch(() => undefined);
      }
      const loginResult = await submitLoginForm(landing, runtimeAuth, jar, runtime.headerOverrides);
      if (normalizedTask.credentialRef && hasCookiesInJar(jar)) {
        await saveWebCaptureSession({
          url: normalizedTask.url,
          sessionCookies: serializeCookieJar(jar),
          updatedAt: now,
        }).catch(() => undefined);
      }
      if (loginResult.kind === 'download') {
        const storedDownload = await writeDownloadedCapture(normalizedTask, loginResult);
        const summary = shouldKeepOriginalDownload(normalizedTask, loginResult.extension)
          ? `登录后返回可下载文件，已保留原始 ${loginResult.extension.replace(/^\./, '').toUpperCase()} 并进入文档解析。`
          : `登录后返回可下载文件，已清洗为 Markdown 入库，原始 ${loginResult.extension.replace(/^\./, '').toUpperCase()} 将按策略自动回收。`;
        return {
          ...normalizedTask,
          title: loginResult.title || normalizedTask.url,
          documentPath: storedDownload.documentPath,
          markdownPath: storedDownload.markdownPath,
          rawDocumentPath: storedDownload.rawDocumentPath,
          rawDeleteAfterAt: storedDownload.rawDeleteAfterAt,
          lastSummary: summary,
          lastStatus: 'success' as const,
          lastRunAt: now,
          updatedAt: now,
          nextRunAt: computeNextRunAt({ ...normalizedTask, lastRunAt: now }),
          lastCollectedCount: 1,
          lastCollectedItems: [{
            title: loginResult.title || loginResult.fileName,
            url: loginResult.url,
            summary,
            score: 100,
          }],
        };
      }
      landing = isLikelyLoginPage(loginResult)
        ? await fetchWebPage(normalizedTask.url, runtimeAuth, jar, runtime.headerOverrides)
        : loginResult;
      if (landing.kind === 'download') {
        const storedDownload = await writeDownloadedCapture(normalizedTask, landing);
        const summary = shouldKeepOriginalDownload(normalizedTask, landing.extension)
          ? `本次采集识别为可下载文件，已保留原始 ${landing.extension.replace(/^\./, '').toUpperCase()} 并进入文档解析。`
          : `本次采集识别为可下载文件，已清洗为 Markdown 入库，原始 ${landing.extension.replace(/^\./, '').toUpperCase()} 将按策略自动回收。`;
        return {
          ...normalizedTask,
          title: landing.title || normalizedTask.url,
          documentPath: storedDownload.documentPath,
          markdownPath: storedDownload.markdownPath,
          rawDocumentPath: storedDownload.rawDocumentPath,
          rawDeleteAfterAt: storedDownload.rawDeleteAfterAt,
          lastSummary: summary,
          lastStatus: 'success' as const,
          lastRunAt: now,
          updatedAt: now,
          nextRunAt: computeNextRunAt({ ...normalizedTask, lastRunAt: now }),
          lastCollectedCount: 1,
          lastCollectedItems: [{
            title: landing.title || landing.fileName,
            url: landing.url,
            summary,
            score: 100,
          }],
        };
      }
    }

    if (isLikelyLoginPage(landing)) {
      if (runtime.storedCredential?.sessionCookies && isWebCaptureSessionFresh(runtime.storedCredential.sessionUpdatedAt)) {
        await clearWebCaptureSession(normalizedTask.url).catch(() => undefined);
      }
      throw new Error('login required or login form not supported');
    }

    if (normalizedTask.credentialRef && hasCookiesInJar(jar)) {
      await saveWebCaptureSession({
        url: normalizedTask.url,
        sessionCookies: serializeCookieJar(jar),
        updatedAt: now,
      }).catch(() => undefined);
    }

    const title = landing.title || normalizedTask.url;
    const entries = await collectRankedEntries(normalizedTask, landing, runtimeAuth, jar);
    const summary = entries.length
      ? `本次按“优先高评价、不求抓全”的策略筛出 ${entries.length} 篇候选内容，已去重后写入数据集。`
      : normalizedTask.crawlMode === 'listing-detail'
        ? 'Discovery mode did not find listing/detail candidates; kept the landing page overview only. Check seed URLs or use browser/API capture for shell pages.'
        : summarizeText(landing.text, normalizedTask.focus);
    const documentPath = await writeCaptureDocument(
      normalizedTask,
      title,
      summary,
      entries,
      landing.text,
      landing.extractionMethod,
    );

    return {
      ...normalizedTask,
      title,
      documentPath,
      markdownPath: '',
      rawDocumentPath: '',
      rawDeleteAfterAt: '',
      lastSummary: summary,
      lastStatus: 'success' as const,
      lastRunAt: now,
      updatedAt: now,
      nextRunAt: computeNextRunAt({ ...normalizedTask, lastRunAt: now }),
      lastCollectedCount: entries.length,
      lastCollectedItems: entries,
    };
  } catch (error) {
    return {
      ...task,
      maxItems: normalizeMaxItems(task.maxItems),
      markdownPath: '',
      rawDocumentPath: '',
      rawDeleteAfterAt: '',
      lastRunAt: now,
      updatedAt: now,
      lastStatus: 'error' as const,
      lastSummary: error instanceof Error ? error.message : 'capture failed',
      nextRunAt: computeNextRunAt({ ...task, lastRunAt: now }),
      lastCollectedCount: 0,
      lastCollectedItems: [],
    };
  }
}

export async function listWebCaptureTasks() {
  const items = await readTasks();
  return items
    .map((item) => ({
      ...item,
      captureStatus: item.captureStatus || 'active',
      maxItems: normalizeMaxItems(item.maxItems),
      keywords: normalizeStringList(item.keywords),
      siteHints: normalizeStringList(item.siteHints),
      seedUrls: resolveSeedUrls(item.seedUrls, item.url),
      crawlMode: resolveTaskCrawlMode(item),
      nextRunAt: item.captureStatus === 'paused' ? '' : (item.nextRunAt || computeNextRunAt(item)),
      lastCollectedCount: item.lastCollectedCount ?? item.lastCollectedItems?.length ?? 0,
      lastCollectedItems: Array.isArray(item.lastCollectedItems) ? item.lastCollectedItems : [],
      rawDocumentPath: item.rawDocumentPath || '',
      rawDeleteAfterAt: item.rawDeleteAfterAt || '',
      keepOriginalFiles: Boolean(item.keepOriginalFiles),
    }))
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export async function createAndRunWebCaptureTask(input: {
  url: string;
  focus?: string;
  keywords?: string[];
  siteHints?: string[];
  seedUrls?: string[];
  crawlMode?: WebCaptureCrawlMode;
  frequency?: WebCaptureFrequency;
  note?: string;
  maxItems?: number;
  auth?: RuntimeAuth;
  credentialRef?: string;
  credentialLabel?: string;
  loginMode?: 'none' | 'credential';
  keepOriginalFiles?: boolean;
}) {
  const now = new Date().toISOString();
  const existingItems = await readTasks();
  const normalizedUrl = normalizeUrl(input.url);
  const existing = existingItems.find((item) => normalizeUrl(item.url) === normalizedUrl);
  const task: WebCaptureTask = {
    id: existing?.id || buildTaskId(input.url),
    url: input.url,
    focus: input.focus?.trim() || '正文、关键信息、技术要点',
    frequency: input.frequency || 'daily',
    keywords: normalizeStringList(input.keywords ?? existing?.keywords),
    siteHints: normalizeStringList(input.siteHints ?? existing?.siteHints),
    seedUrls: resolveSeedUrls(input.seedUrls ?? existing?.seedUrls, input.url),
    crawlMode: normalizeCrawlMode(input.crawlMode ?? existing?.crawlMode),
    note: input.note?.trim() || '',
    maxItems: normalizeMaxItems(input.maxItems),
    keepOriginalFiles: Boolean(input.keepOriginalFiles ?? existing?.keepOriginalFiles),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    captureStatus: 'active',
    loginMode: input.loginMode || (input.auth || input.credentialRef ? 'credential' : 'none'),
    credentialRef: input.credentialRef || '',
    credentialLabel: input.credentialLabel || '',
  };
  const executedTask = await runCapture(task, now, input.auth);
  const nextItems = [executedTask, ...existingItems.filter((item) => item.id !== executedTask.id)];
  await writeTasks(nextItems);
  return executedTask;
}

export async function upsertWebCaptureTask(input: {
  id?: string;
  url: string;
  focus?: string;
  keywords?: string[];
  siteHints?: string[];
  seedUrls?: string[];
  crawlMode?: WebCaptureCrawlMode;
  frequency?: WebCaptureFrequency;
  note?: string;
  maxItems?: number;
  credentialRef?: string;
  credentialLabel?: string;
  captureStatus?: 'active' | 'paused';
  loginMode?: 'none' | 'credential';
  keepOriginalFiles?: boolean;
}) {
  const now = new Date().toISOString();
  const existingItems = await readTasks();
  const normalizedUrl = normalizeUrl(input.url);
  const existing = existingItems.find((item) => item.id === input.id || normalizeUrl(item.url) === normalizedUrl);
  const task: WebCaptureTask = {
    ...existing,
    id: existing?.id || input.id || buildTaskId(input.url),
    url: input.url,
    focus: input.focus?.trim() || existing?.focus || '正文、关键信息、技术要点',
    frequency: input.frequency || existing?.frequency || 'daily',
    keywords: normalizeStringList(input.keywords ?? existing?.keywords),
    siteHints: normalizeStringList(input.siteHints ?? existing?.siteHints),
    seedUrls: resolveSeedUrls(input.seedUrls ?? existing?.seedUrls, input.url),
    crawlMode: normalizeCrawlMode(input.crawlMode ?? existing?.crawlMode),
    note: input.note?.trim() || existing?.note || '',
    maxItems: normalizeMaxItems(input.maxItems ?? existing?.maxItems),
    keepOriginalFiles: Boolean(input.keepOriginalFiles ?? existing?.keepOriginalFiles),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    captureStatus: input.captureStatus || existing?.captureStatus || 'active',
    loginMode: input.loginMode || existing?.loginMode || (input.credentialRef || existing?.credentialRef ? 'credential' : 'none'),
    credentialRef: input.credentialRef ?? existing?.credentialRef ?? '',
    credentialLabel: input.credentialLabel ?? existing?.credentialLabel ?? '',
    nextRunAt: (input.captureStatus || existing?.captureStatus || 'active') === 'paused'
      ? ''
      : computeNextRunAt({
          frequency: input.frequency || existing?.frequency || 'daily',
          lastRunAt: existing?.lastRunAt,
          createdAt: existing?.createdAt || now,
        }),
  };

  const nextItems = [task, ...existingItems.filter((item) => item.id !== task.id)];
  await writeTasks(nextItems);
  return task;
}

export async function runDueWebCaptureTasks(now = new Date()) {
  const nowIso = now.toISOString();
  const cleanupResult = await cleanupExpiredWebCaptureRawFiles(await readTasks(), now);
  const items = cleanupResult.items;
  const nextItems: WebCaptureTask[] = [];
  const executed: WebCaptureTask[] = [];

  for (const item of items) {
    if (isTaskDue(item, now.getTime())) {
      const updated = await runCapture(item, nowIso);
      nextItems.push(updated);
      executed.push(updated);
    } else {
      nextItems.push({
        ...item,
        captureStatus: item.captureStatus || 'active',
        maxItems: normalizeMaxItems(item.maxItems),
        nextRunAt: item.captureStatus === 'paused' ? '' : (item.nextRunAt || computeNextRunAt(item)),
        lastCollectedCount: item.lastCollectedCount ?? item.lastCollectedItems?.length ?? 0,
        lastCollectedItems: Array.isArray(item.lastCollectedItems) ? item.lastCollectedItems : [],
      });
    }
  }

  await writeTasks(nextItems);

  return {
    total: items.length,
    executedCount: executed.length,
    successCount: executed.filter((item) => item.lastStatus === 'success').length,
    errorCount: executed.filter((item) => item.lastStatus === 'error').length,
    cleanedRawCount: cleanupResult.cleanedCount,
    items: executed,
  };
}

export async function updateWebCaptureTaskStatus(taskId: string, status: 'active' | 'paused') {
  const items = await readTasks();
  const index = items.findIndex((item) => item.id === taskId);
  if (index < 0) throw new Error('capture task not found');

  const now = new Date().toISOString();
  const current = items[index];
  const updated: WebCaptureTask = {
    ...current,
    captureStatus: status,
    updatedAt: now,
    pausedAt: status === 'paused' ? (current.pausedAt || now) : '',
    nextRunAt: status === 'paused' ? '' : computeNextRunAt({ ...current, lastRunAt: current.lastRunAt, createdAt: current.createdAt, frequency: current.frequency }),
  };
  items[index] = updated;
  await writeTasks(items);
  return updated;
}

export async function updateWebCaptureTask(taskId: string, patch: Partial<WebCaptureTask>) {
  const items = await readTasks();
  const index = items.findIndex((item) => item.id === taskId);
  if (index < 0) throw new Error('capture task not found');

  const updated: WebCaptureTask = {
    ...items[index],
    ...patch,
    id: items[index].id,
    updatedAt: new Date().toISOString(),
  };

  items[index] = updated;
  await writeTasks(items);
  return updated;
}

export async function deleteWebCaptureTask(taskId: string) {
  const items = await readTasks();
  const index = items.findIndex((item) => item.id === taskId);
  if (index < 0) throw new Error('capture task not found');
  const [removed] = items.splice(index, 1);
  await writeTasks(items);
  return removed;
}
