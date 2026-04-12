'use client';

import { useEffect, useRef, useState } from 'react';
import {
  deleteReportOutput,
  fetchDatasources,
  fetchDocumentsSnapshot,
  fetchReportsSnapshot,
} from './home-api';
import { DEFAULT_UPLOAD_NOTE } from './home-message-helpers';
import {
  clearStoredChatMessages,
  loadStoredChatMessages,
  persistChatMessages,
} from './lib/chat-memory';
import {
  acceptIngestGroupSuggestion,
  assignIngestToSelectedLibrary,
  confirmTemplateOption,
  runDocumentUpload,
  submitCredentialForMessage,
  submitQuestion,
} from './home-controller-actions';
import { normalizeDatasourceResponse } from './lib/types';
import { normalizeGeneratedReportRecord } from './lib/generated-reports';
import { initialMessages, sourceItems } from './lib/mock-data';

const CHAT_CONSTRAINTS_STORAGE_KEY = 'aidp_home_chat_constraints_v1';
const CHAT_CONVERSATION_STATE_STORAGE_KEY = 'aidp_home_chat_conversation_state_v1';
const HOME_PREFERRED_LIBRARIES_STORAGE_KEY = 'aidp_home_preferred_libraries_v1';

function loadStoredSystemConstraints() {
  if (typeof window === 'undefined') return '';
  try {
    return String(window.localStorage.getItem(CHAT_CONSTRAINTS_STORAGE_KEY) || '').trim();
  } catch {
    return '';
  }
}

function loadStoredConversationState() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CHAT_CONVERSATION_STATE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function loadStoredPreferredLibraries() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HOME_PREFERRED_LIBRARIES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => typeof entry === 'string' && entry.trim());
  } catch {
    return [];
  }
}

export function useHomePageController() {
  const [messages, setMessages] = useState(() => loadStoredChatMessages(initialMessages));
  const uploadInputRef = useRef(null);
  const [input, setInput] = useState('');
  const [reportCollapsed, setReportCollapsed] = useState(true);
  const [reportItems, setReportItems] = useState([]);
  const [selectedReportId, setSelectedReportId] = useState('');
  const hasAutoSelectedReportRef = useRef(false);
  const [sidebarSources, setSidebarSources] = useState(sourceItems);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [groupSaving, setGroupSaving] = useState(false);
  const [documentLibraries, setDocumentLibraries] = useState([]);
  const [documentTotal, setDocumentTotal] = useState(0);
  const [selectedManualLibraries, setSelectedManualLibraries] = useState({});
  const [preferredLibraries, setPreferredLibraries] = useState(() => loadStoredPreferredLibraries());
  const preferredLibrariesInitializedRef = useRef(false);
  const [systemConstraints, setSystemConstraints] = useState(() => loadStoredSystemConstraints());
  const [conversationState, setConversationState] = useState(() => loadStoredConversationState());

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
      if (!preferredLibrariesInitializedRef.current && libraries.length) {
        preferredLibrariesInitializedRef.current = true;
        setPreferredLibraries((current) => (
          current.length
            ? current.filter((key) => libraries.some((item) => item.key === key))
            : []
        ));
      }
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
    if (!reportItems.some((item) => item?.status === 'processing')) return undefined;
    const timer = setInterval(() => {
      void loadReports();
    }, 6000);
    return () => clearInterval(timer);
  }, [reportItems]);

  useEffect(() => {
    persistChatMessages(messages);
  }, [messages]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(CHAT_CONSTRAINTS_STORAGE_KEY, String(systemConstraints || ''));
    } catch {
      // Ignore local persistence failures.
    }
  }, [systemConstraints]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (conversationState) {
        window.localStorage.setItem(CHAT_CONVERSATION_STATE_STORAGE_KEY, JSON.stringify(conversationState));
      } else {
        window.localStorage.removeItem(CHAT_CONVERSATION_STATE_STORAGE_KEY);
      }
    } catch {
      // Ignore local persistence failures.
    }
  }, [conversationState]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (preferredLibraries.length) {
        window.localStorage.setItem(HOME_PREFERRED_LIBRARIES_STORAGE_KEY, JSON.stringify(preferredLibraries));
      } else {
        window.localStorage.removeItem(HOME_PREFERRED_LIBRARIES_STORAGE_KEY);
      }
    } catch {
      // Ignore local persistence failures.
    }
  }, [preferredLibraries]);

  useEffect(() => {
    if (!reportItems.length) {
      hasAutoSelectedReportRef.current = false;
      setSelectedReportId('');
      return;
    }

    if (selectedReportId) {
      if (!reportItems.some((item) => item.id === selectedReportId)) {
        setSelectedReportId(reportItems[0].id);
      }
      hasAutoSelectedReportRef.current = true;
      return;
    }

    if (!hasAutoSelectedReportRef.current) {
      setSelectedReportId(reportItems[0].id);
      hasAutoSelectedReportRef.current = true;
    }
  }, [reportItems, selectedReportId]);

  function resetConversation() {
    setMessages(initialMessages);
    clearStoredChatMessages();
    setInput('');
    setReportCollapsed(true);
    setConversationState(null);
  }

  async function deleteReport(reportId) {
    if (!reportId) return;
    try {
      await deleteReportOutput(reportId);
      setReportItems((prev) => prev.filter((item) => item.id !== reportId));
    } catch {
      // Keep current list when deletion fails.
    }
  }

  const baseActionContext = {
    refreshHomeData,
    selectedBotId: '',
    loadDocumentSnapshot,
    loadReports,
    setGroupSaving,
    setInput,
    setIsLoading,
    setMessages,
    setReportItems,
    setSelectedReportId,
    setSelectedManualLibraries,
    preferredLibraries,
    setConversationState,
    systemConstraints,
    conversationState,
    setUploadLoading,
    uploadInputRef,
  };

  return {
    documentLibraries,
    documentTotal,
    groupSaving,
    input,
    isLoading,
    messages,
    reportCollapsed,
    reportItems,
    selectedReportId,
    selectedManualLibraries,
    preferredLibraries,
    conversationState,
    systemConstraints,
    sidebarSources,
    uploadInputRef,
    uploadLoading,
    setInput,
    setReportCollapsed,
    setSelectedManualLibraries,
    setPreferredLibraries,
    setSelectedReportId,
    setConversationState,
    setSystemConstraints,
    deleteReport,
    resetConversation,
    refreshHomeData,
    submitQuestion: (value) => submitQuestion(value, {
      ...baseActionContext,
      inputState: { isLoading, uploadLoading },
      messages,
    }),
    confirmTemplateOption: (option) => confirmTemplateOption(option, {
      ...baseActionContext,
      inputState: { isLoading, uploadLoading },
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
