import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DEFAULT_SCAN_DIR } from './document-store.js';

const STORAGE_ROOT = path.resolve(process.cwd(), '../../storage');
const WEB_CAPTURE_DIR = path.join(STORAGE_ROOT, 'web-captures');
const TASKS_FILE = path.join(WEB_CAPTURE_DIR, 'tasks.json');
const OUTPUT_DIR = path.join(DEFAULT_SCAN_DIR, 'web-captures');
const DEFAULT_MAX_ITEMS = 5;
const MAX_FETCH_ATTEMPTS_FACTOR = 3;

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
};

type TaskPayload = {
  items: WebCaptureTask[];
};

type PageResult = {
  url: string;
  html: string;
  title: string;
  text: string;
};

type CandidateLink = {
  url: string;
  title: string;
  score: number;
};

function buildTaskId(url: string) {
  return `web-${Buffer.from(`${url}:${Date.now()}`).toString('base64url').slice(0, 18)}`;
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

function isTaskDue(task: WebCaptureTask, now = Date.now()) {
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
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

async function writeTasks(items: WebCaptureTask[]) {
  await ensureDirs();
  await fs.writeFile(TASKS_FILE, JSON.stringify({ items }, null, 2), 'utf8');
}

function scoreCandidate(url: string, title: string, focusTerms: string[]) {
  const loweredUrl = url.toLowerCase();
  const loweredTitle = title.toLowerCase();
  let score = 0;

  for (const term of focusTerms) {
    if (loweredTitle.includes(term)) score += 6;
    if (loweredUrl.includes(term)) score += 4;
  }

  const qualitySignals = ['article', 'paper', 'study', 'review', 'trial', 'journal', 'doi', 'pmid', 'abstract', 'full'];
  const sourceSignals = ['.gov', '.edu', '.org', 'pubmed', 'pmc', 'arxiv', 'doi.org'];
  const badSignals = ['login', 'signup', 'account', 'privacy', 'cookie', 'contact', 'help', 'about', 'terms'];

  qualitySignals.forEach((signal) => {
    if (loweredUrl.includes(signal) || loweredTitle.includes(signal)) score += 3;
  });

  sourceSignals.forEach((signal) => {
    if (loweredUrl.includes(signal)) score += 2;
  });

  badSignals.forEach((signal) => {
    if (loweredUrl.includes(signal) || loweredTitle.includes(signal)) score -= 8;
  });

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

async function fetchWebPage(url: string): Promise<PageResult> {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ai-data-platform/0.1; +https://example.local)',
      Accept: 'text/html,application/xhtml+xml',
    },
  });

  if (!response.ok) {
    throw new Error(`fetch failed: ${response.status}`);
  }

  const html = await response.text();
  const title = decodeTitle(html);
  const text = stripHtml(html);
  return { url, html, title, text };
}

function toMarkdown(task: WebCaptureTask, title: string, summary: string, entries: CaptureEntry[], landingText: string) {
  const landingSnippet = landingText.slice(0, 3000);
  return [
    `# ${title || '网页采集结果'}`,
    '',
    '## 采集信息',
    `- 来源地址：${task.url}`,
    `- 关注内容：${task.focus || '未指定'}`,
    `- 采集频次：${task.frequency}`,
    `- 单次上限：${normalizeMaxItems(task.maxItems)} 篇`,
    `- 去重策略：同链接与相近标题去重，优先高相关高质量候选`,
    `- 采集时间：${new Date().toISOString()}`,
    '',
    '## 自动总结',
    summary,
    '',
    '## 本次入库内容',
    ...(entries.length
      ? entries.flatMap((entry, index) => [
        `### ${index + 1}. ${entry.title}`,
        `- 链接：${entry.url}`,
        `- 评分：${entry.score}`,
        `- 摘要：${entry.summary}`,
        '',
      ])
      : ['本次未筛到合适的详情页，暂保留来源页摘要。', '']),
    '## 来源页摘录',
    landingSnippet || '未成功提取正文。',
    '',
  ].join('\n');
}

async function writeCaptureDocument(task: WebCaptureTask, title: string, summary: string, entries: CaptureEntry[], landingText: string) {
  await ensureDirs();
  const safeName = (title || task.url)
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80);
  const filePath = path.join(OUTPUT_DIR, `${task.id}-${safeName || 'capture'}.md`);
  await fs.writeFile(filePath, toMarkdown(task, title, summary, entries, landingText), 'utf8');
  return filePath;
}

async function collectRankedEntries(task: WebCaptureTask, landing: PageResult) {
  const maxItems = normalizeMaxItems(task.maxItems);
  const candidates = extractCandidateLinks(landing.html, task.url, task.focus, maxItems);
  const selected: CaptureEntry[] = [];
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();

  for (const candidate of candidates) {
    if (selected.length >= maxItems) break;
    if (seenUrls.has(candidate.url)) continue;

    try {
      const page = await fetchWebPage(candidate.url);
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

async function runCapture(task: WebCaptureTask, now: string) {
  try {
    const normalizedTask = {
      ...task,
      maxItems: normalizeMaxItems(task.maxItems),
    };
    const landing = await fetchWebPage(normalizedTask.url);
    const title = landing.title || normalizedTask.url;
    const entries = await collectRankedEntries(normalizedTask, landing);
    const summary = entries.length
      ? `本次按“优先高评价、不求抓全”的策略筛出 ${entries.length} 篇候选内容，已去重后写入文档中心。`
      : summarizeText(landing.text, normalizedTask.focus);
    const documentPath = await writeCaptureDocument(normalizedTask, title, summary, entries, landing.text);

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
      maxItems: normalizeMaxItems(item.maxItems),
      nextRunAt: item.nextRunAt || computeNextRunAt(item),
      lastCollectedCount: item.lastCollectedCount ?? item.lastCollectedItems?.length ?? 0,
      lastCollectedItems: Array.isArray(item.lastCollectedItems) ? item.lastCollectedItems : [],
    }))
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export async function createAndRunWebCaptureTask(input: { url: string; focus?: string; frequency?: WebCaptureFrequency; note?: string; maxItems?: number }) {
  const now = new Date().toISOString();
  const task: WebCaptureTask = {
    id: buildTaskId(input.url),
    url: input.url,
    focus: input.focus?.trim() || '正文、关键信息、技术要点',
    frequency: input.frequency || 'daily',
    note: input.note?.trim() || '',
    maxItems: normalizeMaxItems(input.maxItems),
    createdAt: now,
    updatedAt: now,
  };
  const executedTask = await runCapture(task, now);

  const items = await readTasks();
  items.unshift(executedTask);
  await writeTasks(items);
  return executedTask;
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
        maxItems: normalizeMaxItems(item.maxItems),
        nextRunAt: item.nextRunAt || computeNextRunAt(item),
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
