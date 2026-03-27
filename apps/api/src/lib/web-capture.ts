import { promises as fs } from 'node:fs';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';
import { DEFAULT_SCAN_DIR } from './document-store.js';
import { STORAGE_ROOT } from './paths.js';
import { buildAugmentedEnv, getPythonCommandCandidates } from './runtime-executables.js';
import { loadWebCaptureCredential } from './web-capture-credentials.js';

const WEB_CAPTURE_DIR = path.join(STORAGE_ROOT, 'web-captures');
const TASKS_FILE = path.join(WEB_CAPTURE_DIR, 'tasks.json');
const OUTPUT_DIR = path.join(DEFAULT_SCAN_DIR, 'web-captures');
const DEFAULT_MAX_ITEMS = 5;
const MAX_FETCH_ATTEMPTS_FACTOR = 3;
const execFileAsync = promisify(execFile);

export type WebCaptureFrequency = 'manual' | 'daily' | 'weekly';

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
  maxItems?: number;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  lastStatus?: 'success' | 'error';
  lastSummary?: string;
  documentPath?: string;
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
  url: string;
  html: string;
  title: string;
  text: string;
  extractionMethod?: 'trafilatura' | 'fallback';
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

function buildTaskId(url: string) {
  return `web-${createHash('sha1').update(normalizeUrl(url)).digest('hex').slice(0, 16)}`;
}

function normalizeMaxItems(value?: number) {
  const parsed = Number(value || DEFAULT_MAX_ITEMS);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_ITEMS;
  return Math.min(20, Math.max(1, Math.round(parsed)));
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

function getCookieScope(url: string) {
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.host}`.toLowerCase();
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

async function ensureDirs() {
  await fs.mkdir(WEB_CAPTURE_DIR, { recursive: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

async function readTasks(): Promise<WebCaptureTask[]> {
  try {
    const raw = await fs.readFile(TASKS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as TaskPayload;
    return dedupeTasks(Array.isArray(parsed.items) ? parsed.items : []);
  } catch {
    return [];
  }
}

async function writeTasks(items: WebCaptureTask[]) {
  await ensureDirs();
  await fs.writeFile(TASKS_FILE, JSON.stringify({ items: dedupeTasks(items) }, null, 2), 'utf8');
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

function scoreCandidate(url: string, title: string, focusTerms: string[]) {
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

  if (isLikelyContentUrl(url, title)) score += 6;
  if (title.length >= 20 && title.length <= 180) score += 2;
  return score;
}

function extractCandidateLinks(html: string, baseUrl: string, focus: string, maxItems: number) {
  const focusTerms = getFocusTerms(focus);
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
        score: scoreCandidate(url, title, focusTerms),
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

async function fetchWebPage(url: string, auth?: RuntimeAuth, jar?: CookieJar): Promise<PageResult> {
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (compatible; ai-data-platform/0.1; +https://example.local)',
    Accept: 'text/html,application/xhtml+xml',
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

  const html = await response.text();
  if (jar) storeResponseCookies(jar, url, response);
  const main = await extractMainContent(html, response.url || url);
  const title = main.title || decodeTitle(html);
  const text = main.text;
  return { url: response.url || url, html, title, text, extractionMethod: main.method };
}

async function submitLoginForm(page: PageResult, auth: RuntimeAuth, jar: CookieJar) {
  const form = extractLoginForm(page);
  if (!form) {
    throw new Error('login form not detected');
  }

  const payload = buildLoginPayload(form, auth);
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (compatible; ai-data-platform/0.1; +https://example.local)',
    Accept: 'text/html,application/xhtml+xml',
    Referer: page.url,
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
  const html = await response.text();
  const main = await extractMainContent(html, response.url || form.actionUrl);
  const title = main.title || decodeTitle(html);
  const text = main.text;
  return { url: response.url || form.actionUrl, html, title, text, extractionMethod: main.method };
}

function formatExtractionMethod(method?: PageResult['extractionMethod']) {
  return method === 'trafilatura' ? 'Trafilatura 正文提取' : '基础清洗 fallback';
}

function toMarkdown(
  task: WebCaptureTask,
  title: string,
  summary: string,
  entries: CaptureEntry[],
  landingText: string,
  extractionMethod?: PageResult['extractionMethod'],
) {
  const landingSnippet = landingText.slice(0, 3000);
  return [
    `# ${title || '??????'}`,
    '',
    '## ????',
    `- ?????${task.url}`,
    `- ?????${task.focus || '???'}`,
    `- ?????${task.frequency}`,
    `- ?????${normalizeMaxItems(task.maxItems)} ?`,
    `- ???????${formatExtractionMethod(extractionMethod)}`,
    '- ???????????????????????????',
    `- ?????${new Date().toISOString()}`,
    '',
    '## ????',
    summary,
    '',
    '## ??????',
    ...(entries.length
      ? entries.flatMap((entry, index) => [
        `### ${index + 1}. ${entry.title}`,
        `- ???${entry.url}`,
        `- ???${entry.score}`,
        `- ???${entry.summary}`,
        '',
      ])
      : ['?????????????????????', '']),
    '## ?????',
    landingSnippet || '????????',
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

async function collectRankedEntries(task: WebCaptureTask, landing: PageResult, auth?: RuntimeAuth, jar?: CookieJar) {
  const maxItems = normalizeMaxItems(task.maxItems);
  const candidates = extractCandidateLinks(landing.html, task.url, task.focus, maxItems);
  const selected: CaptureEntry[] = [];
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();

  if (isStrongContentPage(landing, task.url)) {
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

async function resolveRuntimeAuth(task: WebCaptureTask, auth?: RuntimeAuth) {
  if (auth?.username && auth?.password) return auth;
  if (task.credentialRef) {
    const stored = await loadWebCaptureCredential(task.url);
    if (stored?.username && stored?.password) {
      return { username: stored.username, password: stored.password };
    }
  }
  return undefined;
}

async function runCapture(task: WebCaptureTask, now: string, auth?: RuntimeAuth) {
  try {
    const normalizedTask = {
      ...task,
      maxItems: normalizeMaxItems(task.maxItems),
    };
    const runtimeAuth = await resolveRuntimeAuth(normalizedTask, auth);
    const jar: CookieJar = new Map();
    let landing = await fetchWebPage(normalizedTask.url, runtimeAuth, jar);

    if (runtimeAuth && isLikelyLoginPage(landing)) {
      const loginResult = await submitLoginForm(landing, runtimeAuth, jar);
      landing = isLikelyLoginPage(loginResult)
        ? await fetchWebPage(normalizedTask.url, runtimeAuth, jar)
        : loginResult;
    }

    if (isLikelyLoginPage(landing)) {
      throw new Error('login required or login form not supported');
    }

    const title = landing.title || normalizedTask.url;
    const entries = await collectRankedEntries(normalizedTask, landing, runtimeAuth, jar);
    const summary = entries.length
      ? `本次按“优先高评价、不求抓全”的策略筛出 ${entries.length} 篇候选内容，已去重后写入文档中心。`
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
      nextRunAt: item.captureStatus === 'paused' ? '' : (item.nextRunAt || computeNextRunAt(item)),
      lastCollectedCount: item.lastCollectedCount ?? item.lastCollectedItems?.length ?? 0,
      lastCollectedItems: Array.isArray(item.lastCollectedItems) ? item.lastCollectedItems : [],
    }))
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export async function createAndRunWebCaptureTask(input: {
  url: string;
  focus?: string;
  frequency?: WebCaptureFrequency;
  note?: string;
  maxItems?: number;
  auth?: RuntimeAuth;
  credentialRef?: string;
  credentialLabel?: string;
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
    note: input.note?.trim() || '',
    maxItems: normalizeMaxItems(input.maxItems),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    captureStatus: 'active',
    loginMode: input.auth || input.credentialRef ? 'credential' : 'none',
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
  frequency?: WebCaptureFrequency;
  note?: string;
  maxItems?: number;
  credentialRef?: string;
  credentialLabel?: string;
  captureStatus?: 'active' | 'paused';
  loginMode?: 'none' | 'credential';
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
    note: input.note?.trim() || existing?.note || '',
    maxItems: normalizeMaxItems(input.maxItems ?? existing?.maxItems),
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
  const items = await readTasks();
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
