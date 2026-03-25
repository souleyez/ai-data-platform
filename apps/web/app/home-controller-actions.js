'use client';

import {
  createLoginCapture,
  createWebCapture,
  saveChatGeneratedReport,
  saveDocumentGroups,
  sendChatPrompt,
  uploadDocuments,
} from './home-api';
import {
  buildCredentialRequestMessage,
  buildIngestChatMessage,
  buildSummaryText,
  createMessageId,
  findIngestItem,
  patchMessageById,
  patchMessagesWithIngestItems,
} from './home-message-helpers';
import { createGeneratedReport } from './lib/generated-reports';
import { normalizeChatResponse } from './lib/types';

function seedSelectedLibraries(setSelectedManualLibraries, ingestItems) {
  setSelectedManualLibraries((prev) => {
    const next = { ...prev };
    for (const item of ingestItems || []) next[item.id] = '';
    return next;
  });
}

function appendAssistantMessage(setMessages, message) {
  setMessages((prev) => [...prev, message]);
}

function buildRecentChatHistory(messages) {
  return (messages || [])
    .filter((message) => {
      if (!(message?.role === 'user' || message?.role === 'assistant')) return false;
      if (message?.ingestFeedback || message?.credentialRequest) return false;
      const content = String(message?.content || '').trim();
      if (!content) return false;
      if (message?.role === 'assistant' && content.length < 2) return false;
      return true;
    })
    .map((message) => ({
      role: message.role,
      content: String(message.content || '').trim(),
    }))
    .slice(-8);
}

export async function runCaptureAction(action, context) {
  const { setMessages, setSelectedManualLibraries, refreshHomeData } = context;

  const json = await createWebCapture({
    url: action.url,
    focus: action.focus,
    note: action.note,
    frequency: 'manual',
  });

  const feedback = {
    message: json?.message || '网页采集任务已创建。',
    summary: json?.summary,
    ingestItems: json?.ingestItems || [],
  };

  seedSelectedLibraries(setSelectedManualLibraries, feedback.ingestItems);

  appendAssistantMessage(setMessages, buildIngestChatMessage({
    title: action.type === 'login_capture' ? '登录采集完成' : '网页采集完成',
    content: buildSummaryText(feedback, feedback.message),
    meta: action.url,
    feedback,
  }));

  await refreshHomeData();
}

export async function runLoginCaptureAction(action, credentials, context) {
  const { setSelectedManualLibraries, refreshHomeData } = context;

  const json = await createLoginCapture({
    url: action.url,
    focus: action.focus,
    note: action.note,
    ...(credentials || {}),
  });

  if (json?.status === 'credential_required') {
    return {
      needsCredential: true,
      message: buildCredentialRequestMessage({
        url: action.url,
        credentialRequest: json?.credentialRequest,
      }),
    };
  }

  const feedback = {
    message: json?.message || '登录采集已完成，内容已入库。',
    summary: json?.summary,
    ingestItems: json?.ingestItems || [],
  };

  seedSelectedLibraries(setSelectedManualLibraries, feedback.ingestItems);
  await refreshHomeData();

  return {
    needsCredential: false,
    message: buildIngestChatMessage({
      title: '登录采集完成',
      content: buildSummaryText(feedback, feedback.message),
      meta: action.url,
      feedback,
    }),
  };
}

export async function runDocumentUpload(files, context) {
  const {
    uploadInputRef,
    refreshHomeData,
    setMessages,
    setSelectedManualLibraries,
    setUploadLoading,
    defaultUploadNote,
  } = context;

  if (!files.length) return;

  setUploadLoading(true);

  try {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    formData.append('note', defaultUploadNote);

    const json = await uploadDocuments(formData);
    await refreshHomeData();

    const feedback = {
      message: json?.message || `已上传 ${json?.uploadedCount || files.length} 个文件。`,
      summary: json?.summary,
      ingestItems: json?.ingestItems || [],
    };

    seedSelectedLibraries(setSelectedManualLibraries, feedback.ingestItems);

    appendAssistantMessage(setMessages, buildIngestChatMessage({
      title: '资料上传完成',
      content: buildSummaryText(feedback, feedback.message),
      meta: files.map((file) => file.name).join(' / '),
      feedback,
    }));
  } catch (error) {
    appendAssistantMessage(setMessages, {
      id: createMessageId('assistant'),
      role: 'assistant',
      title: '资料上传失败',
      content: error instanceof Error ? error.message : '文档上传失败',
      meta: files.map((file) => file.name).join(' / '),
    });
  } finally {
    if (uploadInputRef.current) uploadInputRef.current.value = '';
    setUploadLoading(false);
  }
}

export async function submitQuestion(value, context) {
  const {
    inputState,
    setInput,
    setIsLoading,
    setMessages,
    setReportItems,
    setSelectedReportId,
    loadReports,
    messages,
  } = context;

  const text = value.trim();
  if (!text || inputState.isLoading || inputState.uploadLoading) return;

  setMessages((prev) => [...prev, { id: createMessageId('user'), role: 'user', content: text }]);
  setInput('');
  setIsLoading(true);

  try {
    const data = await sendChatPrompt(text, buildRecentChatHistory(messages));
    const normalized = normalizeChatResponse(data, context.panel || null);

    const message = { ...normalized.message, id: createMessageId('assistant') };
    appendAssistantMessage(setMessages, message);

    const generatedReport = createGeneratedReport({ response: normalized, message });
    if (generatedReport) {
      try {
        const saved = await saveChatGeneratedReport({
          groupKey: generatedReport.groupKey || normalized.libraries?.[0]?.key || '',
          title: generatedReport.title,
          kind: generatedReport.kind,
          format: generatedReport.format,
          content: generatedReport.content,
          table: generatedReport.table,
          page: generatedReport.page,
          libraries: generatedReport.libraries,
          downloadUrl: generatedReport.downloadUrl,
        });
        if (saved?.item) {
          await loadReports?.();
          setSelectedReportId?.(saved.item.id);
        }
      } catch {
        setReportItems?.((prev) => [generatedReport, ...prev]);
        setSelectedReportId?.(generatedReport.id);
      }
    }
  } catch {
    appendAssistantMessage(setMessages, {
      id: createMessageId('assistant'),
      role: 'assistant',
      content: '当前对话接口暂时不可用，请稍后再试。',
      meta: '来源：chat API / 错误回退',
    });
  } finally {
    setIsLoading(false);
  }
}

export async function saveGroupsForIngestItem(itemId, groups, context) {
  const { loadDocumentSnapshot, setGroupSaving, setMessages } = context;

  setGroupSaving(true);
  try {
    const json = await saveDocumentGroups([{ id: itemId, groups }]);
    setMessages((prev) => patchMessagesWithIngestItems(prev, json?.ingestItems || [], json?.message));
    await loadDocumentSnapshot();
    return true;
  } catch (error) {
    appendAssistantMessage(setMessages, {
      id: createMessageId('assistant'),
      role: 'assistant',
      title: '知识库分组更新失败',
      content: error instanceof Error ? error.message : '保存知识库分组失败',
    });
    return false;
  } finally {
    setGroupSaving(false);
  }
}

export async function acceptIngestGroupSuggestion(itemId, context) {
  const { groupSaving, messages } = context;
  if (groupSaving) return;
  const current = findIngestItem(messages, itemId);
  const groups = (current?.groupSuggestion?.suggestedGroups || []).map((item) => item.key);
  if (!groups.length) return;
  await saveGroupsForIngestItem(itemId, groups, context);
}

export async function assignIngestToSelectedLibrary(itemId, context) {
  const { groupSaving, messages, selectedManualLibraries, setSelectedManualLibraries } = context;
  if (groupSaving) return;

  const selectedLibraryKey = selectedManualLibraries[itemId];
  if (!selectedLibraryKey) return;

  const current = findIngestItem(messages, itemId);
  const existingGroups = current?.groupSuggestion?.suggestedGroups || [];
  const groups = Array.from(new Set([
    ...existingGroups.map((item) => item.key),
    selectedLibraryKey,
  ]));

  const saved = await saveGroupsForIngestItem(itemId, groups, context);
  if (saved) {
    setSelectedManualLibraries((prev) => ({ ...prev, [itemId]: '' }));
  }
}

export async function submitCredentialForMessage(messageId, credentials, context) {
  const { messages, setIsLoading, setMessages } = context;
  const currentMessage = messages.find((message) => message.id === messageId);
  const request = currentMessage?.credentialRequest;
  if (!request?.url) return;

  const action = {
    type: 'login_capture',
    url: request.url,
    focus: '正文、结构化要点、更新内容',
    note: `登录采集 ${request.url}`,
  };

  setIsLoading(true);
  setMessages((prev) => patchMessageById(prev, messageId, (message) => ({
    ...message,
    content: '登录信息已安全提交，正在尝试登录并采集。',
    credentialRequest: null,
  })));

  try {
    const result = await runLoginCaptureAction(action, credentials, context);
    appendAssistantMessage(setMessages, result.message);
  } catch (error) {
    appendAssistantMessage(setMessages, {
      id: createMessageId('assistant'),
      role: 'assistant',
      title: '登录采集失败',
      content: error instanceof Error ? error.message : '登录采集失败',
      meta: request.url,
    });
  } finally {
    setIsLoading(false);
  }
}
