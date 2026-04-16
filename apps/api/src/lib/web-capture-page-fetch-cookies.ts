import type { CookieJar } from './web-capture-page-fetch-types.js';

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

export function getCookieHeader(jar: CookieJar, url: string) {
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

export function storeResponseCookies(jar: CookieJar, url: string, response: Response) {
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
