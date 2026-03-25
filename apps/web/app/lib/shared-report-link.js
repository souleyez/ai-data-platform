'use client';

function encodeBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4;
  const padded = normalized + (padding ? '='.repeat(4 - padding) : '');
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function createSharedReportPayload(item) {
  if (!item || item.kind !== 'page') return '';

  return encodeBase64Url(JSON.stringify({
    title: item.title || '静态分析页',
    createdAt: item.createdAt || '',
    content: item.content || '',
    page: item.page || null,
  }));
}

export function parseSharedReportPayload(payload) {
  if (!payload) return null;

  try {
    const text = new TextDecoder().decode(decodeBase64Url(payload));
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      title: parsed.title || '静态分析页',
      createdAt: parsed.createdAt || '',
      content: parsed.content || '',
      page: parsed.page || null,
    };
  } catch {
    return null;
  }
}
