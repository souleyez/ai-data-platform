import type { ChannelDirectorySource } from './channel-directory-sources.js';

export type ChannelDirectoryHttpResponse = {
  status: number;
  body: unknown;
  headers: Record<string, string>;
  request: {
    url: string;
    method: 'GET' | 'POST';
    headers: Array<{ key: string; value: string; secret: boolean }>;
  };
};

function normalizeText(value: unknown) {
  return String(value || '').trim();
}

function buildHeaders(
  source: ChannelDirectorySource,
  options?: {
    redactSecrets?: boolean;
  },
) {
  const redactSecrets = options?.redactSecrets === true;
  const headers = new Headers();

  for (const item of source.request.headers || []) {
    const key = normalizeText(item.key);
    if (!key) continue;
    const value = redactSecrets && item.secret ? '[redacted]' : String(item.value || '');
    headers.set(key, value);
  }

  if (source.request.method === 'POST' && source.request.bodyTemplate && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json; charset=utf-8');
  }

  return headers;
}

function buildReadableHeaders(headers: Headers) {
  const items: Record<string, string> = {};
  headers.forEach((value, key) => {
    items[key] = value;
  });
  return items;
}

export function buildChannelDirectoryRequestHeaders(
  source: ChannelDirectorySource,
  options?: {
    redactSecrets?: boolean;
  },
) {
  const headers = buildHeaders(source, options);
  const items: Array<{ key: string; value: string; secret: boolean }> = [];
  for (const item of source.request.headers || []) {
    const key = normalizeText(item.key);
    if (!key) continue;
    items.push({
      key,
      value: headers.get(key) || '',
      secret: item.secret === true,
    });
  }
  return items;
}

export async function fetchChannelDirectoryPayload(source: ChannelDirectorySource): Promise<ChannelDirectoryHttpResponse> {
  const timeoutMs = Math.max(1000, Number(source.request.timeoutMs || 0) || 8000);
  const response = await fetch(source.request.url, {
    method: source.request.method,
    headers: buildHeaders(source),
    body: source.request.method === 'POST' ? (source.request.bodyTemplate || undefined) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`directory request failed (${response.status})`);
  }

  const raw = await response.text();
  if (!raw.trim()) {
    throw new Error('directory response is empty');
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error('directory response is not valid json');
  }

  return {
    status: response.status,
    body,
    headers: buildReadableHeaders(response.headers),
    request: {
      url: source.request.url,
      method: source.request.method,
      headers: buildChannelDirectoryRequestHeaders(source, { redactSecrets: true }),
    },
  };
}
