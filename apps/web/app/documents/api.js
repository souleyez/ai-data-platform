'use client';

import { buildApiUrl } from '../lib/config';
import { normalizeDatasourceResponse, normalizeDocumentsResponse } from '../lib/types';

async function requestJson(path, options) {
  const response = await fetch(buildApiUrl(path), {
    cache: 'no-store',
    ...(options || {}),
  });
  if (!response.ok) {
    let message = `request failed: ${path}`;
    try {
      const payload = await response.json();
      message = payload?.message || payload?.error || message;
    } catch {
      try {
        const text = await response.text();
        if (text) message = text;
      } catch {
        // ignore
      }
    }
    throw new Error(message);
  }
  return response.json();
}

export async function fetchDocuments() {
  const payload = await requestJson('/api/documents');
  return normalizeDocumentsResponse(payload);
}

export async function fetchDatasources() {
  const payload = await requestJson('/api/datasources');
  return normalizeDatasourceResponse(payload);
}

export async function createDocumentLibrary(name, description = '') {
  return requestJson('/api/documents/libraries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description }),
  });
}

export async function reclusterUngroupedDocuments() {
  return requestJson('/api/documents/recluster-ungrouped', { method: 'POST' });
}

export async function ignoreDocuments(items) {
  return requestJson('/api/documents/ignore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
}

export async function saveDocumentGroups(items) {
  return requestJson('/api/documents/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
}

export async function acceptDocumentGroupSuggestions(items) {
  return requestJson('/api/documents/groups/accept-suggestions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
}
