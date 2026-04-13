'use client';

import { buildApiUrl } from './lib/config';

async function parseApiResponse(response, fallbackError) {
  const raw = await response.text();
  let json = {};
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    json = {};
  }

  if (!response.ok) {
    throw new Error(json?.error || raw || fallbackError);
  }

  return json;
}

export async function fetchDatasources() {
  const response = await fetch(buildApiUrl('/api/datasources'));
  return parseApiResponse(response, 'load datasources failed');
}

export async function fetchCaptureTasks() {
  const response = await fetch(buildApiUrl('/api/web-captures'));
  return parseApiResponse(response, 'load web captures failed');
}

export async function fetchDocumentsSnapshot() {
  const response = await fetch(buildApiUrl('/api/documents-overview'), { cache: 'no-store' });
  return parseApiResponse(response, 'load documents overview failed');
}

export async function fetchReportsSnapshot() {
  const response = await fetch(buildApiUrl('/api/reports/snapshot'), { cache: 'no-store' });
  return parseApiResponse(response, 'load reports failed');
}

export async function fetchReportBenchmark(groupKeys = []) {
  const query = new URLSearchParams();
  for (const groupKey of Array.isArray(groupKeys) ? groupKeys : []) {
    const normalized = String(groupKey || '').trim();
    if (normalized) query.append('groupKey', normalized);
  }
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const response = await fetch(buildApiUrl(`/api/reports/benchmark${suffix}`), { cache: 'no-store' });
  return parseApiResponse(response, 'load report benchmark failed');
}

export async function fetchReportOutput(reportId) {
  const response = await fetch(buildApiUrl(`/api/reports/output/${encodeURIComponent(reportId)}`), {
    cache: 'no-store',
  });
  return parseApiResponse(response, 'load report output failed');
}

export async function fetchOperationsOverview() {
  const response = await fetch(buildApiUrl('/api/operations-overview'), { cache: 'no-store' });
  return parseApiResponse(response, 'load operations overview failed');
}

export async function fetchBots() {
  const response = await fetch(buildApiUrl('/api/bots'), { cache: 'no-store' });
  return parseApiResponse(response, 'load bots failed');
}

export async function fetchModelConfig() {
  const response = await fetch(buildApiUrl('/api/model-config'), { cache: 'no-store' });
  return parseApiResponse(response, 'load model config failed');
}

export async function updateModelConfig(payload) {
  const response = await fetch(buildApiUrl('/api/model-config'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseApiResponse(response, 'update model config failed');
}

export async function createBot(payload) {
  const response = await fetch(buildApiUrl('/api/bots'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseApiResponse(response, 'create bot failed');
}

export async function updateBot(botId, payload) {
  const response = await fetch(buildApiUrl(`/api/bots/${encodeURIComponent(botId)}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseApiResponse(response, 'update bot failed');
}

export async function fetchChannelDirectorySources(botId) {
  const response = await fetch(buildApiUrl(`/api/bots/${encodeURIComponent(botId)}/channel-directory-sources`), {
    cache: 'no-store',
  });
  return parseApiResponse(response, 'load channel directory sources failed');
}

export async function createChannelDirectorySource(botId, payload) {
  const response = await fetch(buildApiUrl(`/api/bots/${encodeURIComponent(botId)}/channel-directory-sources`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseApiResponse(response, 'create channel directory source failed');
}

export async function updateChannelDirectorySource(botId, sourceId, payload) {
  const response = await fetch(buildApiUrl(`/api/bots/${encodeURIComponent(botId)}/channel-directory-sources/${encodeURIComponent(sourceId)}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseApiResponse(response, 'update channel directory source failed');
}

export async function syncChannelDirectorySource(botId, sourceId) {
  const response = await fetch(buildApiUrl(`/api/bots/${encodeURIComponent(botId)}/channel-directory-sources/${encodeURIComponent(sourceId)}/sync`), {
    method: 'POST',
  });
  return parseApiResponse(response, 'sync channel directory source failed');
}

export async function searchChannelDirectorySubjects(botId, sourceId, options = {}) {
  const query = new URLSearchParams();
  if (options.query) query.set('q', options.query);
  if (options.type) query.set('type', options.type);
  const response = await fetch(
    buildApiUrl(`/api/bots/${encodeURIComponent(botId)}/channel-directory-sources/${encodeURIComponent(sourceId)}/subjects${query.toString() ? `?${query}` : ''}`),
    { cache: 'no-store' },
  );
  return parseApiResponse(response, 'search channel directory subjects failed');
}

export async function fetchChannelDirectorySubjectDetail(botId, sourceId, subjectType, subjectId) {
  const response = await fetch(
    buildApiUrl(`/api/bots/${encodeURIComponent(botId)}/channel-directory-sources/${encodeURIComponent(sourceId)}/subjects/${encodeURIComponent(subjectType)}/${encodeURIComponent(subjectId)}`),
    { cache: 'no-store' },
  );
  return parseApiResponse(response, 'load channel directory subject failed');
}

export async function fetchChannelDirectoryPolicies(botId, sourceId) {
  const response = await fetch(
    buildApiUrl(`/api/bots/${encodeURIComponent(botId)}/channel-directory-sources/${encodeURIComponent(sourceId)}/access-policies`),
    { cache: 'no-store' },
  );
  return parseApiResponse(response, 'load channel directory policies failed');
}

export async function patchChannelDirectoryPolicies(botId, sourceId, payload) {
  const response = await fetch(
    buildApiUrl(`/api/bots/${encodeURIComponent(botId)}/channel-directory-sources/${encodeURIComponent(sourceId)}/access-policies`),
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  return parseApiResponse(response, 'patch channel directory policies failed');
}

export async function previewChannelDirectoryAccess(botId, sourceId, payload) {
  const response = await fetch(
    buildApiUrl(`/api/bots/${encodeURIComponent(botId)}/channel-directory-sources/${encodeURIComponent(sourceId)}/access-preview`),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  return parseApiResponse(response, 'preview channel directory access failed');
}

export async function uploadDocuments(formData) {
  const response = await fetch(buildApiUrl('/api/documents/upload'), {
    method: 'POST',
    body: formData,
  });
  return parseApiResponse(response, 'document upload failed');
}

export async function sendChatPrompt(prompt, chatHistory = [], options = {}) {
  const promptBase64 = typeof window === 'undefined'
    ? ''
    : window.btoa(String.fromCharCode(...new TextEncoder().encode(prompt)));
  const response = await fetch(buildApiUrl('/api/chat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      promptBase64,
      chatHistory,
      mode: options.mode || 'general',
      confirmedRequest: options.confirmedRequest || '',
      confirmedAction: options.confirmedAction || '',
      preferredLibraries: Array.isArray(options.preferredLibraries) ? options.preferredLibraries : [],
      conversationState: options.conversationState || null,
      systemConstraints: options.systemConstraints || '',
      botId: options.botId || '',
    }),
  });
  return parseApiResponse(response, 'chat api failed');
}

export async function saveDocumentGroups(items) {
  const response = await fetch(buildApiUrl('/api/documents/groups'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  return parseApiResponse(response, 'save groups failed');
}

export async function saveChatGeneratedReport(payload) {
  const response = await fetch(buildApiUrl('/api/reports/chat-output'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseApiResponse(response, 'save generated report failed');
}

export async function deleteReportOutput(reportId) {
  const response = await fetch(buildApiUrl(`/api/reports/output/${encodeURIComponent(reportId)}`), {
    method: 'DELETE',
  });
  return parseApiResponse(response, 'delete report failed');
}
