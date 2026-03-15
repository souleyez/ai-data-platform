import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DEFAULT_SCAN_DIR } from './document-store.js';

const STORAGE_ROOT = path.resolve(process.cwd(), '../../storage');
const WEB_CAPTURE_DIR = path.join(STORAGE_ROOT, 'web-captures');
const TASKS_FILE = path.join(WEB_CAPTURE_DIR, 'tasks.json');
const OUTPUT_DIR = path.join(DEFAULT_SCAN_DIR, 'web-captures');

export type WebCaptureFrequency = 'manual' | 'daily' | 'weekly';

export type WebCaptureTask = {
  id: string;
  url: string;
  focus: string;
  frequency: WebCaptureFrequency;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  lastStatus?: 'success' | 'error';
  lastSummary?: string;
  documentPath?: string;
  title?: string;
  note?: string;
};

type TaskPayload = {
  items: WebCaptureTask[];
};

function buildTaskId(url: string) {
  return `web-${Buffer.from(`${url}:${Date.now()}`).toString('base64url').slice(0, 18)}`;
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

function decodeTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1]?.replace(/\s+/g, ' ').trim() || '';
}

function splitSentences(text: string) {
  return text
    .split(/(?<=[。！？.!?])\s+|\n+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 24);
}

function summarizeText(text: string, focus: string) {
  const sentences = splitSentences(text).slice(0, 40);
  if (!sentences.length) return '网页已抓取，但暂未提取到足够正文，建议检查目标站点是否需要登录或为强脚本渲染页面。';

  const focusTerms = focus
    .split(/[，,；;、\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  const scored = sentences
    .map((sentence, index) => {
      const lowered = sentence.toLowerCase();
      const focusHits = focusTerms.reduce((acc, term) => acc + (lowered.includes(term) ? 2 : 0), 0);
      const positional = Math.max(0, 3 - Math.floor(index / 3));
      return { sentence, score: focusHits + positional };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => item.sentence);

  return scored.join(' ');
}

function toMarkdown(task: WebCaptureTask, title: string, summary: string, text: string) {
  const snippet = text.slice(0, 6000);
  return [
    `# ${title || '网页采集结果'}`,
    '',
    '## 采集信息',
    `- 来源地址：${task.url}`,
    `- 关注内容：${task.focus || '未指定'}`,
    `- 采集频次：${task.frequency}`,
    `- 采集时间：${new Date().toISOString()}`,
    '',
    '## 自动总结',
    summary,
    '',
    '## 正文摘录',
    snippet || '未成功提取正文。',
    '',
  ].join('\n');
}

async function fetchWebPage(url: string) {
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
  return { title, text };
}

async function writeCaptureDocument(task: WebCaptureTask, title: string, summary: string, text: string) {
  await ensureDirs();
  const safeName = (title || task.url)
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80);
  const filePath = path.join(OUTPUT_DIR, `${task.id}-${safeName || 'capture'}.md`);
  await fs.writeFile(filePath, toMarkdown(task, title, summary, text), 'utf8');
  return filePath;
}

export async function listWebCaptureTasks() {
  const items = await readTasks();
  return items.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export async function createAndRunWebCaptureTask(input: { url: string; focus?: string; frequency?: WebCaptureFrequency; note?: string }) {
  const now = new Date().toISOString();
  const task: WebCaptureTask = {
    id: buildTaskId(input.url),
    url: input.url,
    focus: input.focus?.trim() || '正文、关键信息、技术要点',
    frequency: input.frequency || 'daily',
    note: input.note?.trim() || '',
    createdAt: now,
    updatedAt: now,
  };

  let title = '';
  let summary = '';
  let documentPath = '';

  try {
    const result = await fetchWebPage(task.url);
    title = result.title || task.url;
    summary = summarizeText(result.text, task.focus);
    documentPath = await writeCaptureDocument(task, title, summary, result.text);
    task.lastRunAt = now;
    task.lastStatus = 'success';
    task.lastSummary = summary;
    task.documentPath = documentPath;
    task.title = title;
  } catch (error) {
    task.lastRunAt = now;
    task.lastStatus = 'error';
    task.lastSummary = error instanceof Error ? error.message : 'capture failed';
  }

  const items = await readTasks();
  items.unshift(task);
  await writeTasks(items);
  return task;
}
