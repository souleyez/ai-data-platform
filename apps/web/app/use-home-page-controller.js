'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchCaptureTasks, fetchDatasources, fetchDocumentsSnapshot, fetchReportsSnapshot, deleteReportOutput } from './home-api';
import { DEFAULT_UPLOAD_NOTE } from './home-message-helpers';
import {
  acceptIngestGroupSuggestion,
  assignIngestToSelectedLibrary,
  runDocumentUpload,
  submitCredentialForMessage,
  submitQuestion,
} from './home-controller-actions';
import { normalizeDatasourceResponse } from './lib/types';
import { normalizeGeneratedReportRecord } from './lib/generated-reports';
import { initialMessages, scenarios, sourceItems } from './lib/mock-data';

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
      .slice(-40)
      .map((item, index) => ({
        id: String(item?.id || `history-${index}`),
        role: item?.role === 'user' ? 'user' : 'assistant',
        title: typeof item?.title === 'string' ? item.title : '',
        content: typeof item?.content === 'string' ? item.content : '',
        meta: typeof item?.meta === 'string' ? item.meta : '',
        table: item?.table && typeof item.table === 'object' ? item.table : null,
      }))
      .filter((item) => item.content.trim());
    window.localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(serialized));
  } catch {
    // ignore storage failures
  }
}

function clearStoredMessages() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CHAT_HISTORY_STORAGE_KEY);
  } catch {
    // ignore storage failures
  }
}

export function useHomePageController() {
  const [messages, setMessages] = useState(() => loadStoredMessages());
  const uploadInputRef = useRef(null);
  const [input, setInput] = useState('');
  const [activeScenario, setActiveScenario] = useState('technical');
  const [panel, setPanel] = useState(scenarios.technical || scenarios.default);
  const [reportCollapsed, setReportCollapsed] = useState(false);
  const [reportItems, setReportItems] = useState([]);
  const [selectedReportId, setSelectedReportId] = useState('');
  const [sidebarSources, setSidebarSources] = useState(sourceItems);
  const [isLoading, setIsLoading] = useState(false);
  const [captureTasks, setCaptureTasks] = useState([]);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [groupSaving, setGroupSaving] = useState(false);
  const [documentLibraries, setDocumentLibraries] = useState([]);
  const [documentTotal, setDocumentTotal] = useState(0);
  const [selectedManualLibraries, setSelectedManualLibraries] = useState({});

  async function loadDatasources() {
    try {
      const json = await fetchDatasources();
      const normalized = normalizeDatasourceResponse(json);
      if (normalized.items.length) setSidebarSources(normalized.items);
    } catch {
      // keep local fallback
    }
  }

  async function loadCaptureTasks() {
    try {
      const json = await fetchCaptureTasks();
      setCaptureTasks(Array.isArray(json?.items) ? json.items : []);
    } catch {
      setCaptureTasks([]);
    }
  }

  async function loadDocumentSnapshot() {
    try {
      const json = await fetchDocumentsSnapshot();
      const libraries = Array.isArray(json?.libraries) ? json.libraries : [];
      const libraryDocumentTotal = libraries.reduce((sum, library) => sum + Number(library?.documentCount || 0), 0);
      setDocumentLibraries(libraries);
      setDocumentTotal(libraryDocumentTotal || Number(json?.totalFiles || 0));
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
    await Promise.all([loadCaptureTasks(), loadDatasources(), loadDocumentSnapshot(), loadReports()]);
  }

  useEffect(() => {
    loadDatasources();
    loadCaptureTasks();
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
    setActiveScenario('technical');
    setPanel(scenarios.technical || scenarios.default);
    setReportCollapsed(false);
    setInput('');
    loadReports();
  }

  async function deleteReport(reportId) {
    if (!reportId) return;
    try {
      await deleteReportOutput(reportId);
      setReportItems((prev) => prev.filter((item) => item.id !== reportId));
    } catch {
      // keep existing list on failure
    }
  }

  const baseActionContext = {
    refreshHomeData,
    loadReports,
    setActiveScenario,
    setGroupSaving,
    setInput,
    setIsLoading,
    setMessages,
    setPanel,
    setReportItems,
    setSelectedReportId,
    setSelectedManualLibraries,
    setUploadLoading,
    uploadInputRef,
  };

  return {
    captureTasks,
    documentLibraries,
    documentTotal,
    groupSaving,
    input,
    isLoading,
    messages,
    panel,
    reportCollapsed,
    reportItems,
    selectedReportId,
    selectedManualLibraries,
    sidebarSources,
    uploadInputRef,
    uploadLoading,
    setInput,
    setReportCollapsed,
    setSelectedReportId,
    setSelectedManualLibraries,
    deleteReport,
    submitQuestion: (value) => submitQuestion(value, {
      ...baseActionContext,
      inputState: { isLoading, uploadLoading },
    }),
    resetConversation,
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
