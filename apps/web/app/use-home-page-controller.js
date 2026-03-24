'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchCaptureTasks, fetchDatasources, fetchDocumentsSnapshot } from './home-api';
import { CHAT_STORAGE_KEY, DEFAULT_UPLOAD_NOTE } from './home-message-helpers';
import {
  acceptIngestGroupSuggestion,
  assignIngestToSelectedLibrary,
  runDocumentUpload,
  submitCredentialForMessage,
  submitQuestion,
} from './home-controller-actions';
import { normalizeDatasourceResponse } from './lib/types';
import { initialMessages, scenarios, sourceItems } from './lib/mock-data';

const EMPTY_DOCUMENT_SNAPSHOT = { totalFiles: 0, parsed: 0, scanRoot: '' };

export function useHomePageController() {
  const [messages, setMessages] = useState(initialMessages);
  const uploadInputRef = useRef(null);
  const [input, setInput] = useState('');
  const [activeScenario, setActiveScenario] = useState('technical');
  const [panel, setPanel] = useState(scenarios.technical || scenarios.default);
  const [sidebarSources, setSidebarSources] = useState(sourceItems);
  const [isLoading, setIsLoading] = useState(false);
  const [captureTasks, setCaptureTasks] = useState([]);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [groupSaving, setGroupSaving] = useState(false);
  const [documentLibraries, setDocumentLibraries] = useState([]);
  const [selectedManualLibraries, setSelectedManualLibraries] = useState({});
  const [documentSnapshot, setDocumentSnapshot] = useState(EMPTY_DOCUMENT_SNAPSHOT);

  const selectWorkbenchCategory = (categoryKey) => {
    setActiveScenario(categoryKey);
    setPanel(scenarios[categoryKey] || scenarios.default);
  };

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
      setDocumentLibraries(Array.isArray(json?.libraries) ? json.libraries : []);
      setDocumentSnapshot({
        totalFiles: json?.totalFiles || 0,
        parsed: json?.meta?.parsed || 0,
        scanRoot: json?.scanRoot || '',
      });
    } catch {
      setDocumentLibraries([]);
      setDocumentSnapshot(EMPTY_DOCUMENT_SNAPSHOT);
    }
  }

  async function refreshHomeData() {
    await Promise.all([loadCaptureTasks(), loadDatasources(), loadDocumentSnapshot()]);
  }

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CHAT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) setMessages(parsed);
      }
    } catch {
      // ignore invalid local cache
    }

    loadDatasources();
    loadCaptureTasks();
    loadDocumentSnapshot();
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-60)));
    } catch {
      // ignore persistence failure
    }
  }, [messages]);

  function resetConversation() {
    setMessages(initialMessages);
    setActiveScenario('technical');
    setPanel(scenarios.technical || scenarios.default);
    setInput('');
    try {
      window.localStorage.removeItem(CHAT_STORAGE_KEY);
    } catch {
      // ignore clear failure
    }
  }

  const baseActionContext = {
    loadDocumentSnapshot,
    refreshHomeData,
    setGroupSaving,
    setInput,
    setIsLoading,
    setMessages,
    setSelectedManualLibraries,
    setUploadLoading,
    uploadInputRef,
  };

  return {
    activeScenario,
    captureTasks,
    documentLibraries,
    documentSnapshot,
    groupSaving,
    input,
    isLoading,
    messages,
    panel,
    selectedManualLibraries,
    sidebarSources,
    uploadInputRef,
    uploadLoading,
    setInput,
    setSelectedManualLibraries,
    selectWorkbenchCategory,
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
