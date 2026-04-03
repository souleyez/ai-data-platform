'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createBot,
  fetchBots,
  deleteReportOutput,
  fetchDatasources,
  fetchDocumentsSnapshot,
  fetchReportsSnapshot,
  reviseReportOutput,
  updateBot,
} from './home-api';
import { DEFAULT_UPLOAD_NOTE } from './home-message-helpers';
import {
  appendChatMessageKeepingLatestFailure,
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

function createLocalMessageId(prefix = 'assistant') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const CHAT_CONSTRAINTS_STORAGE_KEY = 'aidp_home_chat_constraints_v1';
const BOT_SELECTION_STORAGE_KEY = 'aidp_home_selected_bot_v1';

function loadStoredSystemConstraints() {
  if (typeof window === 'undefined') return '';
  try {
    return String(window.localStorage.getItem(CHAT_CONSTRAINTS_STORAGE_KEY) || '').trim();
  } catch {
    return '';
  }
}

function loadStoredBotId() {
  if (typeof window === 'undefined') return '';
  try {
    return String(window.localStorage.getItem(BOT_SELECTION_STORAGE_KEY) || '').trim();
  } catch {
    return '';
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
  const [systemConstraints, setSystemConstraints] = useState(() => loadStoredSystemConstraints());
  const [botItems, setBotItems] = useState([]);
  const [botManageEnabled, setBotManageEnabled] = useState(false);
  const [botLoading, setBotLoading] = useState(false);
  const [selectedBotId, setSelectedBotId] = useState(() => loadStoredBotId());

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

  async function loadBots(preferredBotId = '') {
    setBotLoading(true);
    try {
      const json = await fetchBots();
      const items = Array.isArray(json?.items) ? json.items : [];
      setBotItems(items);
      setBotManageEnabled(Boolean(json?.manageEnabled));
      setSelectedBotId((prev) => {
        const requested = String(preferredBotId || prev || '').trim();
        if (requested && items.some((item) => item?.id === requested)) return requested;
        const defaultItem = items.find((item) => item?.isDefault) || items[0] || null;
        return String(defaultItem?.id || '');
      });
    } catch {
      setBotItems([]);
      setBotManageEnabled(false);
      setSelectedBotId('');
    } finally {
      setBotLoading(false);
    }
  }

  async function createBotDefinition(payload) {
    const json = await createBot(payload);
    const item = json?.item || null;
    await loadBots(item?.id || '');
    return item;
  }

  async function updateBotDefinition(botId, payload) {
    const json = await updateBot(botId, payload);
    const item = json?.item || null;
    await loadBots(item?.id || botId || '');
    return item;
  }

  useEffect(() => {
    loadDatasources();
    loadDocumentSnapshot();
    loadReports();
    loadBots();
  }, []);

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
      if (selectedBotId) {
        window.localStorage.setItem(BOT_SELECTION_STORAGE_KEY, selectedBotId);
      } else {
        window.localStorage.removeItem(BOT_SELECTION_STORAGE_KEY);
      }
    } catch {
      // Ignore local persistence failures.
    }
  }, [selectedBotId]);

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

  async function reviseReport(reportId, instruction) {
    if (!reportId || !String(instruction || '').trim()) return null;

    try {
      const json = await reviseReportOutput(reportId, instruction);
      await loadReports();
      setMessages((prev) => [
        ...prev,
        {
          id: createLocalMessageId('assistant'),
          role: 'assistant',
          title: '报表已更新',
          content: json?.message || '已按你的要求更新当前报表。',
          meta: String(instruction || '').trim(),
        },
      ]);
      return {
        item: json?.item || null,
        message: json?.message || '已按你的要求更新当前报表。',
      };
    } catch (error) {
      setMessages((prev) => appendChatMessageKeepingLatestFailure(prev, {
        id: createLocalMessageId('assistant'),
        role: 'assistant',
        title: '报表调整失败',
        content: error instanceof Error ? error.message : '当前报表调整失败，请稍后再试。',
        messageType: 'system_failure',
      }));
      throw error;
    }
  }

  const baseActionContext = {
    refreshHomeData,
    selectedBotId,
    loadDocumentSnapshot,
    loadReports,
    setGroupSaving,
    setInput,
    setIsLoading,
    setMessages,
    setReportItems,
    setSelectedReportId,
    setSelectedManualLibraries,
    systemConstraints,
    setUploadLoading,
    uploadInputRef,
  };

  return {
    documentLibraries,
    documentTotal,
    botItems,
    botLoading,
    botManageEnabled,
    groupSaving,
    input,
    isLoading,
    messages,
    reportCollapsed,
    reportItems,
    selectedReportId,
    selectedManualLibraries,
    selectedBotId,
    systemConstraints,
    sidebarSources,
    uploadInputRef,
    uploadLoading,
    setInput,
    setReportCollapsed,
    setSelectedManualLibraries,
    setSelectedBotId,
    setSelectedReportId,
    setSystemConstraints,
    refreshBots: loadBots,
    createBotDefinition,
    updateBotDefinition,
    deleteReport,
    reviseReport,
    resetConversation,
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
