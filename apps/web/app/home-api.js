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
  const response = await fetch(buildApiUrl('/api/reports'));
  return parseApiResponse(response, 'load reports failed');
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
      preferredLibraries: Array.isArray(options.preferredLibraries) ? options.preferredLibraries : [],
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

export async function reviseReportOutput(reportId, instruction) {
  const response = await fetch(buildApiUrl(`/api/reports/output/${encodeURIComponent(reportId)}/revise`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instruction }),
  });
  return parseApiResponse(response, 'revise report failed');
}
