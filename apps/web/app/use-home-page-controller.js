'use client';

import { useEffect, useRef, useState } from 'react';
import {
  deleteReportOutput,
  fetchDatasources,
  fetchDocumentsSnapshot,
  fetchReportOutput,
  fetchReportsSnapshot,
} from './home-api';
import { DEFAULT_UPLOAD_NOTE } from './home-message-helpers';
import {
  clearStoredDatasetSecretState,
  loadStoredDatasetSecretState,
  resolveStoredDatasetSecretState,
  setActiveDatasetSecretGrant,
  verifyDatasetSecretText,
} from './lib/dataset-secrets';
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
import {
  normalizeDatasourceResponse,
  normalizeDocumentsResponse,
} from './lib/types';
import { normalizeGeneratedReportRecord } from './lib/generated-reports';
import { initialMessages } from './lib/mock-data';

const CHAT_CONSTRAINTS_STORAGE_KEY = 'aidp_home_chat_constraints_v1';
const CHAT_CONVERSATION_STATE_STORAGE_KEY = 'aidp_home_chat_conversation_state_v1';
const HOME_PREFERRED_LIBRARIES_STORAGE_KEY = 'aidp_home_preferred_libraries_v1';
const CHAT_DEBUG_DETAILS_STORAGE_KEY = 'aidp_home_chat_debug_details_v1';

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
    if (
      parsed
      && typeof parsed === 'object'
      && parsed.kind === 'general'
      && typeof parsed.expiresAt === 'string'
      && Date.parse(parsed.expiresAt) <= Date.now()
    ) {
      window.localStorage.removeItem(CHAT_CONVERSATION_STATE_STORAGE_KEY);
      return null;
    }
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

function resolveChatDebugAvailability() {
  if (typeof window === 'undefined') return process.env.NODE_ENV !== 'production';
  try {
    const params = new URLSearchParams(window.location.search || '');
    return process.env.NODE_ENV !== 'production' || params.get('chatDebug') === '1';
  } catch {
    return process.env.NODE_ENV !== 'production';
  }
}

function loadStoredChatDebugDetailsEnabled() {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(CHAT_DEBUG_DETAILS_STORAGE_KEY);
    return raw === '1' || raw === 'true';
  } catch {
    return false;
  }
}

function normalizeInitialDocumentsSnapshot(snapshot) {
  const libraries = Array.isArray(snapshot?.libraries) ? snapshot.libraries : [];
  const totalFromLibraries = libraries.reduce(
    (sum, library) => sum + Number(library?.documentCount || 0),
    0,
  );

  return {
    libraries,
    totalDocuments: totalFromLibraries || Number(snapshot?.totalDocuments || 0),
  };
}

export function useHomePageController({
  initialDocumentsSnapshot = null,
  initialReportCollapsed = true,
} = {}) {
  const normalizedInitialDocumentsSnapshot = normalizeInitialDocumentsSnapshot(initialDocumentsSnapshot);
  const hasInitialDocumentsSnapshot = (
    normalizedInitialDocumentsSnapshot.totalDocuments > 0
    || normalizedInitialDocumentsSnapshot.libraries.length > 0
  );
  const [messages, setMessages] = useState(() => loadStoredChatMessages(initialMessages));
  const uploadInputRef = useRef(null);
  const [input, setInput] = useState('');
  const [reportCollapsed, setReportCollapsed] = useState(initialReportCollapsed);
  const [reportItems, setReportItems] = useState([]);
  const [selectedReportId, setSelectedReportId] = useState('');
  const [selectedReportItem, setSelectedReportItem] = useState(null);
  const [reportDetailLoading, setReportDetailLoading] = useState(false);
  const hasAutoSelectedReportRef = useRef(false);
  const [sidebarSources, setSidebarSources] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [groupSaving, setGroupSaving] = useState(false);
  const [documentLibraries, setDocumentLibraries] = useState(normalizedInitialDocumentsSnapshot.libraries);
  const [documentTotal, setDocumentTotal] = useState(normalizedInitialDocumentsSnapshot.totalDocuments);
  const [selectedManualLibraries, setSelectedManualLibraries] = useState({});
  const [preferredLibraries, setPreferredLibraries] = useState(() => {
    const stored = loadStoredPreferredLibraries();
    if (!normalizedInitialDocumentsSnapshot.libraries.length) return stored;
    return stored.filter((key) => normalizedInitialDocumentsSnapshot.libraries.some((item) => item.key === key));
  });
  const [systemConstraints, setSystemConstraints] = useState(() => loadStoredSystemConstraints());
  const [conversationState, setConversationState] = useState(() => loadStoredConversationState());
  const [chatDebugAvailable] = useState(() => resolveChatDebugAvailability());
  const [chatDebugDetailsEnabled, setChatDebugDetailsEnabled] = useState(() => (
    resolveChatDebugAvailability() && loadStoredChatDebugDetailsEnabled()
  ));
  const [datasetSecretState, setDatasetSecretState] = useState(() => loadStoredDatasetSecretState());

  async function loadDatasources() {
    try {
      const json = await fetchDatasources();
      const normalized = normalizeDatasourceResponse(json);
      setSidebarSources(Array.isArray(normalized.items) ? normalized.items : []);
    } catch {
      setSidebarSources([]);
    }
  }

  async function loadDocumentSnapshot() {
    try {
      const json = normalizeDocumentsResponse(await fetchDocumentsSnapshot());
      const libraries = Array.isArray(json?.libraries) ? json.libraries : [];
      const total = libraries.reduce((sum, library) => sum + Number(library?.documentCount || 0), 0);
      setDocumentLibraries(libraries);
      setDocumentTotal(total || Number(json?.totalFiles || 0));
      setPreferredLibraries((current) => (
        Array.isArray(current) && current.length
          ? current.filter((key) => libraries.some((item) => item.key === key))
          : []
      ));
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
    let alive = true;
    resolveStoredDatasetSecretState()
      .then((nextState) => {
        if (alive) setDatasetSecretState(nextState);
      })
      .catch(() => {
        if (alive) setDatasetSecretState(loadStoredDatasetSecretState());
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!hasInitialDocumentsSnapshot) {
      void loadDocumentSnapshot();
    }

    const datasourcesTimer = window.setTimeout(() => {
      void loadDatasources();
    }, hasInitialDocumentsSnapshot ? 180 : 260);
    const reportsTimer = window.setTimeout(() => {
      void loadReports();
    }, hasInitialDocumentsSnapshot ? 420 : 520);

    return () => {
      window.clearTimeout(datasourcesTimer);
      window.clearTimeout(reportsTimer);
    };
  }, [hasInitialDocumentsSnapshot]);

  useEffect(() => {
    if (!reportItems.some((item) => item?.status === 'processing')) return undefined;
    const timer = setInterval(() => {
      void loadReports();
    }, 6000);
    return () => clearInterval(timer);
  }, [reportItems]);

  useEffect(() => {
    let alive = true;

    async function loadSelectedReportDetail() {
      if (reportCollapsed) {
        setReportDetailLoading(false);
        return;
      }
      if (!selectedReportId) {
        setSelectedReportItem(null);
        setReportDetailLoading(false);
        return;
      }
      const fromList = reportItems.find((item) => item.id === selectedReportId) || null;
      if (!fromList) {
        setSelectedReportItem(null);
        setReportDetailLoading(false);
        return;
      }
      if (fromList?.draft?.modules?.length || fromList?.page?.sections?.length || fromList?.page?.charts?.length || fromList?.content) {
        setSelectedReportItem(fromList);
        setReportDetailLoading(false);
        return;
      }
      setSelectedReportItem(fromList);
      setReportDetailLoading(true);
      try {
        const json = await fetchReportOutput(selectedReportId);
        if (!alive) return;
        const nextItem = normalizeGeneratedReportRecord(json?.item || null);
        setSelectedReportItem(nextItem);
        setReportItems((prev) => prev.map((item) => (item.id === nextItem.id ? { ...item, ...nextItem } : item)));
      } catch {
        if (!alive) return;
      } finally {
        if (alive) setReportDetailLoading(false);
      }
    }

    void loadSelectedReportDetail();
    return () => {
      alive = false;
    };
  }, [reportCollapsed, reportItems, selectedReportId]);

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
    if (typeof window === 'undefined' || !chatDebugAvailable) return;
    try {
      if (chatDebugDetailsEnabled) {
        window.localStorage.setItem(CHAT_DEBUG_DETAILS_STORAGE_KEY, '1');
      } else {
        window.localStorage.removeItem(CHAT_DEBUG_DETAILS_STORAGE_KEY);
      }
    } catch {
      // Ignore local persistence failures.
    }
  }, [chatDebugAvailable, chatDebugDetailsEnabled]);

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

    if (!reportCollapsed && !hasAutoSelectedReportRef.current) {
      setSelectedReportId(reportItems[0].id);
      hasAutoSelectedReportRef.current = true;
    }
  }, [reportCollapsed, reportItems, selectedReportId]);

  function resetConversation() {
    setMessages(initialMessages);
    clearStoredChatMessages();
    setInput('');
    setReportCollapsed(true);
    setConversationState(null);
  }

  async function verifyDatasetSecret(secret) {
    const nextState = await verifyDatasetSecretText(secret, datasetSecretState);
    setDatasetSecretState(nextState);
    return nextState;
  }

  function activateDatasetSecret(bindingId) {
    const nextState = setActiveDatasetSecretGrant(datasetSecretState, bindingId);
    setDatasetSecretState(nextState);
    return nextState;
  }

  function clearDatasetSecretCache() {
    const nextState = clearStoredDatasetSecretState();
    setDatasetSecretState(nextState);
    return nextState;
  }

  async function deleteReport(reportId) {
    if (!reportId) return;
    try {
      await deleteReportOutput(reportId);
      setReportItems((prev) => prev.filter((item) => item.id !== reportId));
      setSelectedReportItem((current) => (current?.id === reportId ? null : current));
    } catch {
      // Keep current list when deletion fails.
    }
  }

  function updateReportItem(nextItem) {
    const normalized = normalizeGeneratedReportRecord(nextItem);
    setReportItems((prev) => {
      const hasMatch = prev.some((item) => item.id === normalized.id);
      if (!hasMatch) return [normalized, ...prev];
      return prev.map((item) => (item.id === normalized.id ? normalized : item));
    });
    setSelectedReportItem(normalized);
    setSelectedReportId(normalized.id);
  }

  const baseActionContext = {
    availableLibraries: documentLibraries,
    refreshHomeData,
    loadDatasources,
    selectedBotId: '',
    loadDocumentSnapshot,
    loadReports,
    setGroupSaving,
    setInput,
    setIsLoading,
    setMessages,
    setPreferredLibraries,
    setReportItems,
    setSelectedReportId,
    setSelectedManualLibraries,
    preferredLibraries,
    setConversationState,
    systemConstraints,
    conversationState,
    datasetSecretState,
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
    selectedReportItem,
    selectedReportId,
    reportDetailLoading,
    selectedManualLibraries,
    preferredLibraries,
    datasetSecretState,
    conversationState,
    systemConstraints,
    sidebarSources,
    uploadInputRef,
    uploadLoading,
    chatDebugAvailable,
    chatDebugDetailsEnabled,
    setInput,
    setChatDebugDetailsEnabled,
    setReportCollapsed,
    setSelectedManualLibraries,
    setPreferredLibraries,
    setSelectedReportId,
    setConversationState,
    setSystemConstraints,
    deleteReport,
    updateReportItem,
    verifyDatasetSecret,
    activateDatasetSecret,
    clearDatasetSecretCache,
    setDatasetSecretState,
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
