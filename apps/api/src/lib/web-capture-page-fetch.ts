import path from 'node:path';
import {
  applyCookieHeaderToJar,
  applySerializedSessionCookies,
  getCookieHeader,
  hasCookiesInJar,
  serializeCookieJar,
  storeResponseCookies,
} from './web-capture-page-fetch-cookies.js';
import {
  decodeTitle,
  extractLoginForm,
  extractWebCaptureMainContent,
  isLikelyLoginPage,
  stripHtml,
} from './web-capture-page-fetch-content.js';
import type {
  CookieJar,
  DownloadResult,
  LoginForm,
  PageResult,
  RuntimeAuth,
} from './web-capture-page-fetch-types.js';

export type {
  CookieJar,
  DownloadResult,
  LoginForm,
  PageResult,
  RuntimeAuth,
} from './web-capture-page-fetch-types.js';
export {
  applyCookieHeaderToJar,
  applySerializedSessionCookies,
  hasCookiesInJar,
  serializeCookieJar,
} from './web-capture-page-fetch-cookies.js';
export {
  decodeTitle,
  isLikelyLoginPage,
  stripHtml,
} from './web-capture-page-fetch-content.js';

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

function buildDownloadResult(url: string, response: Response, contentType: string, contentDisposition: string, data: Buffer): DownloadResult {
  const extension = inferDownloadExtension(response.url || url, contentType, contentDisposition) || '.bin';
  const fileName = inferDownloadFileName(response.url || url, contentDisposition, extension);
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
    const data = Buffer.from(await response.arrayBuffer());
    return buildDownloadResult(url, response, contentType, contentDisposition, data);
  }

  const html = await response.text();
  const main = await extractWebCaptureMainContent(html, response.url || url);
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
    const data = Buffer.from(await response.arrayBuffer());
    return buildDownloadResult(form.actionUrl, response, contentType, contentDisposition, data);
  }

  const html = await response.text();
  const main = await extractWebCaptureMainContent(html, response.url || form.actionUrl);
  const title = main.title || decodeTitle(html);
  const text = main.text;
  return { kind: 'page' as const, url: response.url || form.actionUrl, html, title, text, extractionMethod: main.method };
}
