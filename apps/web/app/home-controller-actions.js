'use client';

import {
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
import { appendChatMessageKeepingLatestFailure, buildRecentChatHistory } from './lib/chat-memory';
import { createGeneratedReport } from './lib/generated-reports';
import { normalizeChatResponse } from './lib/types';

function appendAssistantMessage(setMessages, message) {
  setMessages((prev) => appendChatMessageKeepingLatestFailure(prev, message));
}

function seedSelectedLibraries(setSelectedManualLibraries, ingestItems) {
  setSelectedManualLibraries((prev) => {
    const next = { ...prev };
    for (const item of ingestItems || []) {
      next[item.id] = '';
    }
    return next;
  });
}

async function persistGeneratedReport(normalized, message, context, requestPrompt = '') {
  const { setReportItems, setSelectedReportId, loadReports } = context;
  const generatedReport = createGeneratedReport({ response: normalized, message, requestPrompt });
  if (!generatedReport) return;

  try {
    const saved = await saveChatGeneratedReport({
      groupKey: generatedReport.groupKey || normalized.libraries?.[0]?.key || '',
      templateKey: generatedReport.templateKey || normalized.reportTemplate?.key || '',
      title: generatedReport.title,
      kind: generatedReport.kind,
      format: generatedReport.format,
      content: generatedReport.content,
      table: generatedReport.table,
      page: generatedReport.page,
      libraries: generatedReport.libraries,
      downloadUrl: generatedReport.downloadUrl,
      dynamicSource: generatedReport.dynamicSource || null,
    });
    if (saved?.item) {
      await loadReports?.();
      setSelectedReportId?.(saved.item.id);
      return;
    }
  } catch {
    // Fall through to local optimistic list update.
  }

  setReportItems?.((prev) => [generatedReport, ...prev]);
  setSelectedReportId?.(generatedReport.id);
}

export async function runDocumentUpload(files, context) {
  const {
    defaultUploadNote,
    refreshHomeData,
    setMessages,
    setSelectedManualLibraries,
    setUploadLoading,
    uploadInputRef,
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
      message: json?.message || `已接收 ${json?.uploadedCount || files.length} 个文件。`,
      summary: json?.summary,
      ingestItems: json?.ingestItems || [],
    };

    seedSelectedLibraries(setSelectedManualLibraries, feedback.ingestItems);

    appendAssistantMessage(
      setMessages,
      buildIngestChatMessage({
        title: '文档上传完成',
        content: buildSummaryText(feedback, feedback.message),
        meta: files.map((file) => file.name).join(' / '),
        feedback,
      }),
    );
  } catch (error) {
    appendAssistantMessage(setMessages, {
      id: createMessageId('assistant'),
      role: 'assistant',
      title: '文档上传失败',
      content: error instanceof Error ? error.message : '文档上传失败，请稍后重试。',
      meta: files.map((file) => file.name).join(' / '),
      messageType: 'system_failure',
    });
  } finally {
    if (uploadInputRef.current) uploadInputRef.current.value = '';
    setUploadLoading(false);
  }
}

export async function submitQuestion(value, context) {
  const { inputState, messages, setInput, setIsLoading, setMessages } = context;

  const text = String(value || '').trim();
  if (!text || inputState.isLoading || inputState.uploadLoading) return;

  setMessages((prev) => [...prev, { id: createMessageId('user'), role: 'user', content: text }]);
  setInput('');
  setIsLoading(true);

  try {
    const data = await sendChatPrompt(text, buildRecentChatHistory(messages), {
      mode: 'general',
    });
    const normalized = normalizeChatResponse(data, null);
    const message = { ...normalized.message, id: createMessageId('assistant') };
    appendAssistantMessage(setMessages, message);
    await persistGeneratedReport(normalized, message, context, text);
  } catch (error) {
    appendAssistantMessage(setMessages, {
      id: createMessageId('assistant'),
      role: 'assistant',
      content: error instanceof Error ? error.message : '当前云端问答暂时不可用，请稍后再试。',
      meta: '云端问答未返回结果',
      messageType: 'system_failure',
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
    try {
      await loadDocumentSnapshot();
    } catch {
      // Ignore snapshot refresh errors when save already succeeded.
    }
    return true;
  } catch (error) {
    appendAssistantMessage(setMessages, {
      id: createMessageId('assistant'),
      role: 'assistant',
      title: '知识库分组更新失败',
      content: error instanceof Error ? error.message : '保存知识库分组失败。',
      messageType: 'system_failure',
    });
    return false;
  } finally {
    setGroupSaving(false);
  }
}

export async function acceptIngestGroupSuggestion(itemId, context) {
  const { groupSaving, messages } = context;
  if (groupSaving) return;

  const ingestItem = findIngestItem(messages, itemId);
  if (!ingestItem?.suggestedGroups?.length) return;

  await saveGroupsForIngestItem(itemId, ingestItem.suggestedGroups, context);
}

export async function assignIngestToSelectedLibrary(itemId, context) {
  const { groupSaving, messages, selectedManualLibraries } = context;
  if (groupSaving) return;

  const library = String(selectedManualLibraries?.[itemId] || '').trim();
  if (!library) return;

  const ingestItem = findIngestItem(messages, itemId);
  const existing = Array.isArray(ingestItem?.groups) ? ingestItem.groups : [];
  const nextGroups = Array.from(new Set([...existing, library]));
  const ok = await saveGroupsForIngestItem(itemId, nextGroups, context);
  if (!ok) return;

  context.setSelectedManualLibraries?.((prev) => ({ ...prev, [itemId]: '' }));
}

export async function submitCredentialForMessage(messageId, credentials, context) {
  const { messages, setMessages } = context;
  const target = (messages || []).find((item) => item.id === messageId);
  if (!target?.credentialRequest) return;

  setMessages((prev) =>
    patchMessageById(prev, messageId, () => ({
      ...target,
      meta: '登录信息已提交，正在继续处理。',
    })),
  );

  appendAssistantMessage(setMessages, {
    id: createMessageId('assistant'),
    role: 'assistant',
    content: '已收到登录信息。当前首页主流程不再自动触发网页采集，如需恢复这条能力，会在数据源工作台里继续管理。',
    meta: buildCredentialRequestMessage({
      url: target.credentialRequest.url,
      credentialRequest: target.credentialRequest,
    }),
  });
}
