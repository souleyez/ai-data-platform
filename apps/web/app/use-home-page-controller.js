'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchCaptureTasks, fetchDatasources, fetchDocumentsSnapshot } from './home-api';
import { DEFAULT_UPLOAD_NOTE } from './home-message-helpers';
import {
  acceptIngestGroupSuggestion,
  assignIngestToSelectedLibrary,
  runDocumentUpload,
  submitCredentialForMessage,
  submitQuestion,
} from './home-controller-actions';
import { normalizeDatasourceResponse } from './lib/types';
import { initialMessages, scenarios, sourceItems } from './lib/mock-data';

export function useHomePageController() {
  const [messages, setMessages] = useState(initialMessages);
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
  const [conversationState, setConversationState] = useState(null);

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

  async function refreshHomeData() {
    await Promise.all([loadCaptureTasks(), loadDatasources(), loadDocumentSnapshot()]);
  }

  useEffect(() => {
    loadDatasources();
    loadCaptureTasks();
    loadDocumentSnapshot();
  }, []);

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
    setActiveScenario('technical');
    setPanel(scenarios.technical || scenarios.default);
    setReportCollapsed(false);
    setReportItems([]);
    setSelectedReportId('');
    setInput('');
    setConversationState(null);
  }

  function deleteReport(reportId) {
    setReportItems((prev) => prev.filter((item) => item.id !== reportId));
  }

  const baseActionContext = {
    refreshHomeData,
    setActiveScenario,
    setGroupSaving,
    setInput,
    setIsLoading,
    setMessages,
    setPanel,
    setReportItems,
    setSelectedReportId,
    setSelectedManualLibraries,
    setConversationState,
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
    conversationState,
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
      conversationState,
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
