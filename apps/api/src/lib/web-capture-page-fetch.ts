import { promises as fs } from 'node:fs';
import os from 'node:os';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { buildAugmentedEnv, getPythonCommandCandidates } from './runtime-executables.js';

const execFileAsync = promisify(execFile);

export type PageResult = {
  kind: 'page';
  url: string;
  html: string;
  title: string;
  text: string;
  extractionMethod?: 'trafilatura' | 'fallback';
};

export type DownloadResult = {
  kind: 'download';
  url: string;
  title: string;
  text: string;
  contentType: string;
  fileName: string;
  extension: string;
  data: Buffer;
};

export type RuntimeAuth = {
  username: string;
  password: string;
};

export type CookieJar = Map<string, Map<string, string>>;

export type LoginForm = {
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

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim();
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

export function stripHtml(html: string) {
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

export function decodeTitle(html: string) {
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

export function isLikelyLoginPage(page: PageResult) {
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
    const method = String(formAttrs.method || 'POST').trim().toUpperCase() === 'GET' ? 'GET' : 'POST';
    return { actionUrl, method, fields };
  }

  return null;
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

function parseCookieHeaderValue(value: string) {
  return String(value || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const index = part.indexOf('=');
      if (index <= 0) return null;
      return [part.slice(0, index).trim(), part.slice(index + 1).trim()] as const;
    })
    .filter((entry): entry is readonly [string, string] => Boolean(entry && entry[0]));
}

export function applyCookieHeaderToJar(jar: CookieJar, url: string, cookieHeader: string) {
  const bucket = ensureCookieBucket(jar, url);
  for (const [name, value] of parseCookieHeaderValue(cookieHeader)) {
    bucket.set(name, value);
  }
}

export function applySerializedSessionCookies(
  jar: CookieJar,
  sessionCookies: Record<string, Record<string, string>> | undefined,
) {
  for (const [scope, bucket] of Object.entries(sessionCookies || {})) {
    const jarBucket = ensureCookieBucket(jar, scope);
    for (const [name, cookieValue] of Object.entries(bucket || {})) {
      if (!name || !cookieValue) continue;
      jarBucket.set(name, cookieValue);
    }
  }
}

export function serializeCookieJar(jar: CookieJar) {
  const serialized: Record<string, Record<string, string>> = {};
  for (const [scope, bucket] of jar.entries()) {
    if (!bucket.size) continue;
    serialized[scope] = Object.fromEntries(
      Array.from(bucket.entries()).filter(([name, cookieValue]) => Boolean(name && cookieValue)),
    );
  }
  return serialized;
}

export function hasCookiesInJar(jar: CookieJar) {
  return Array.from(jar.values()).some((bucket) => bucket.size > 0);
}

function inferDownloadExtension(url: string, contentType: string, contentDisposition: string) {
  const headerName = contentDisposition.match(/filename\*?=(?:UTF-8''|\"?)([^\";]+)/i)?.[1]?.trim();
  const decodedHeaderName = headerName ? decodeURIComponent(headerName.replace(/^[\"']|[\"']$/g, '')) : '';
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
  const headerName = contentDisposition.match(/filename\*?=(?:UTF-8''|\"?)([^\";]+)/i)?.[1]?.trim();
  const decodedHeaderName = headerName ? decodeURIComponent(headerName.replace(/^[\"']|[\"']$/g, '')) : '';
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

export async function fetchWebPage(
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

export async function submitLoginForm(
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
