'use client';

import { useEffect, useRef, useState } from 'react';
import { deleteReportOutput, fetchDatasources, fetchDocumentsSnapshot, fetchReportsSnapshot } from './home-api';
import { DEFAULT_UPLOAD_NOTE } from './home-message-helpers';
import {
  acceptIngestGroupSuggestion,
  assignIngestToSelectedLibrary,
  runDocumentUpload,
  submitKnowledgeOutputConfirm,
  submitKnowledgeOutputPlan,
  submitCredentialForMessage,
  submitQuestion,
} from './home-controller-actions';
import { normalizeDatasourceResponse } from './lib/types';
import { normalizeGeneratedReportRecord } from './lib/generated-reports';
import { initialMessages, sourceItems } from './lib/mock-data';

const CHAT_HISTORY_STORAGE_KEY = 'aidp_home_chat_history_v1';

function normalizeStoredMessages(raw) {
  if (!Array.isArray(raw) || !raw.length) return initialMessages;

  const items = raw
    .map((item, index) => ({
      id: String(item?.id || `history-${index}`),
      role: item?.role === 'user' ? 'user' : 'assistant',
      title: typeof item?.title === 'string' ? item.title : '',
      content: typeof item?.content === 'string' ? item.content : '',
      meta: typeof item?.meta === 'string' ? item.meta : '',
      table: item?.table && typeof item.table === 'object' ? item.table : null,
    }))
    .filter((item) => {
      const content = item.content.trim();
      if (!content) return false;
      if (item.role === 'assistant' && content.length < 2) return false;
      return true;
    });

  return items.length ? items : initialMessages;
}

function loadStoredMessages() {
  if (typeof window === 'undefined') return initialMessages;
  try {
    const raw = window.localStorage.getItem(CHAT_HISTORY_STORAGE_KEY);
    if (!raw) return initialMessages;
    return normalizeStoredMessages(JSON.parse(raw));
  } catch {
    return initialMessages;
  }
}

function persistMessages(messages) {
  if (typeof window === 'undefined') return;

  try {
    const serialized = (Array.isArray(messages) ? messages : [])
      .filter((item) => {
        if (!(item?.role === 'user' || item?.role === 'assistant')) return false;
        if (item?.ingestFeedback || item?.credentialRequest) return false;
        const content = String(item?.content || '').trim();
        if (!content) return false;
        if (item?.role === 'assistant' && content.length < 2) return false;
        return true;
      })
      .slice(-30)
      .map((item, index) => ({
        id: String(item?.id || `history-${index}`),
        role: item?.role === 'user' ? 'user' : 'assistant',
        title: typeof item?.title === 'string' ? item.title : '',
        content: typeof item?.content === 'string' ? item.content : '',
        meta: typeof item?.meta === 'string' ? item.meta : '',
        table: item?.table && typeof item.table === 'object' ? item.table : null,
      }));

    window.localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(serialized));
  } catch {
    // Ignore local persistence failures.
  }
}

function clearStoredMessages() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CHAT_HISTORY_STORAGE_KEY);
  } catch {
    // Ignore local persistence failures.
  }
}

export function useHomePageController() {
  const [messages, setMessages] = useState(() => loadStoredMessages());
  const uploadInputRef = useRef(null);
  const [input, setInput] = useState('');
  const [reportCollapsed, setReportCollapsed] = useState(false);
  const [reportItems, setReportItems] = useState([]);
  const [selectedReportId, setSelectedReportId] = useState('');
  const [sidebarSources, setSidebarSources] = useState(sourceItems);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [groupSaving, setGroupSaving] = useState(false);
  const [knowledgeOutputLoading, setKnowledgeOutputLoading] = useState(false);
  const [knowledgeOutputDraft, setKnowledgeOutputDraft] = useState('');
  const [knowledgeOutputPlan, setKnowledgeOutputPlan] = useState(null);
  const [documentLibraries, setDocumentLibraries] = useState([]);
  const [documentTotal, setDocumentTotal] = useState(0);
  const [selectedManualLibraries, setSelectedManualLibraries] = useState({});
  const canPrepareKnowledgeOutput =
    Boolean(String(input || '').trim()) ||
    messages.some((message) => {
      if (message?.role !== 'user' && message?.role !== 'assistant') return false;
      if (message?.ingestFeedback || message?.credentialRequest) return false;
      return Boolean(String(message?.content || '').trim());
    });

  async function loadDatasources() {
    try {
      const json = await fetchDatasources();
      const normalized = normalizeDatasourceResponse(json);
      if (normalized.items.length) setSidebarSources(normalized.items);
    } catch {
      setSidebarSources(sourceItems);
    }
  }

  async function loadDocumentSnapshot() {
    try {
      const json = await fetchDocumentsSnapshot();
      const libraries = Array.isArray(json?.libraries) ? json.libraries : [];
      const total = libraries.reduce((sum, library) => sum + Number(library?.documentCount || 0), 0);
      setDocumentLibraries(libraries);
      setDocumentTotal(total || Number(json?.totalFiles || 0));
    } catch {
      setDocumentLibraries([]);
      setDocumentTotal(0);
    }
  }

  async function loadReports() {
    try {
      const json = await fetchReportsSnapshot();
      const records = Array.isArray(json?.outputRecords) ? json.outputRecords : [];
      setReportItems(records.map(normalizeGeneratedReportRecord));
    } catch {
      setReportItems([]);
    }
  }

  async function refreshHomeData() {
    await Promise.all([loadDatasources(), loadDocumentSnapshot(), loadReports()]);
  }

  useEffect(() => {
    loadDatasources();
    loadDocumentSnapshot();
    loadReports();
  }, []);

  useEffect(() => {
    persistMessages(messages);
  }, [messages]);

  useEffect(() => {
    if (!reportItems.length) {
      setSelectedReportId('');
      return;
    }
    if (!reportItems.some((item) => item.id === selectedReportId)) {
      setSelectedReportId(reportItems[0].id);
    }
  }, [reportItems, selectedReportId]);

  function resetConversation() {
    setMessages(initialMessages);
    clearStoredMessages();
    setInput('');
    setReportCollapsed(false);
    setKnowledgeOutputDraft('');
    setKnowledgeOutputPlan(null);
  }

  async function deleteReport(reportId) {
    if (!reportId) return;
    try {
      await deleteReportOutput(reportId);
      setReportItems((prev) => prev.filter((item) => item.id !== reportId));
    } catch {
      // Keep existing list when deletion fails.
    }
  }

  const baseActionContext = {
    refreshHomeData,
    loadDocumentSnapshot,
    loadReports,
    setGroupSaving,
    setInput,
    setIsLoading,
    setKnowledgeOutputDraft,
    setKnowledgeOutputLoading,
    setKnowledgeOutputPlan,
    setMessages,
    setReportItems,
    setSelectedReportId,
    setSelectedManualLibraries,
    setUploadLoading,
    uploadInputRef,
  };

  return {
    canPrepareKnowledgeOutput,
    documentLibraries,
    documentTotal,
    groupSaving,
    input,
    isLoading,
    knowledgeOutputDraft,
    knowledgeOutputLoading,
    knowledgeOutputPlan,
    messages,
    reportCollapsed,
    reportItems,
    selectedReportId,
    selectedManualLibraries,
    sidebarSources,
    uploadInputRef,
    uploadLoading,
    setInput,
    setKnowledgeOutputDraft,
    setKnowledgeOutputPlan,
    setReportCollapsed,
    setSelectedManualLibraries,
    setSelectedReportId,
    deleteReport,
    resetConversation,
    submitQuestion: (value) => submitQuestion(value, {
      ...baseActionContext,
      inputState: { isLoading, uploadLoading, knowledgeOutputLoading },
      messages,
    }),
    submitKnowledgeOutputPlan: (value) => submitKnowledgeOutputPlan(value, {
      ...baseActionContext,
      inputState: { isLoading, uploadLoading, knowledgeOutputLoading },
      messages,
    }),
    submitKnowledgeOutputConfirm: (value) => submitKnowledgeOutputConfirm(value, {
      ...baseActionContext,
      inputState: { isLoading, uploadLoading, knowledgeOutputLoading },
      messages,
    }),
    runDocumentUpload: (files) => runDocumentUpload(files, {
      ...baseActionContext,
      defaultUploadNote: DEFAULT_UPLOAD_NOTE,
    }),
    acceptIngestGroupSuggestion: (itemId) => acceptIngestGroupSuggestion(itemId, {
      ...baseActionContext,
      groupSaving,
      messages,
    }),
    assignIngestToSelectedLibrary: (itemId) => assignIngestToSelectedLibrary(itemId, {
      ...baseActionContext,
      groupSaving,
      messages,
      selectedManualLibraries,
    }),
    submitCredentialForMessage: (messageId, credentials) => submitCredentialForMessage(messageId, credentials, {
      ...baseActionContext,
      messages,
    }),
  };
}
