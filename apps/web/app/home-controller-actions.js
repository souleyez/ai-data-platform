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
import { setCloudModelHealthy, setCloudModelUnavailable } from './lib/cloud-model-status';
import {
  buildDraftEditorPath,
  createGeneratedReport,
  isDraftGeneratedReport,
  normalizeGeneratedReportRecord,
} from './lib/generated-reports';
import { normalizeChatResponse } from './lib/types';

function looksLikeCloudUnavailable(normalized) {
  const content = String(normalized?.message?.content || '').trim();
  const meta = String(normalized?.message?.meta || '').trim();
  return normalized?.mode === 'fallback'
    || content.includes('当前云端模型暂时不可用')
    || meta.includes('云端回复暂不可用');
}

function looksLikeScopeSwitchPrompt(prompt) {
  const text = String(prompt || '').trim();
  if (!text) return false;
  return /(后续|接下来|后面|之后|从现在开始|默认|切到|切换到|改成|锁定|限定|只按|只看|只围绕|围绕|针对).*(数据集|知识库|文档库|资料|问答|回答)/i.test(text)
    || /(按|围绕|针对).*(数据集|知识库|文档库).*(问答|回答)/i.test(text);
}

function resolvePreferredLibraryKeys(libraries, availableLibraries) {
  if (!Array.isArray(libraries) || !libraries.length) return [];
  const available = Array.isArray(availableLibraries) ? availableLibraries : [];
  const matched = [];
  for (const item of libraries) {
    const key = String(item?.key || '').trim();
    const label = String(item?.label || '').trim();
    const resolved = available.find((entry) => (
      (key && String(entry?.key || '').trim() === key)
      || (label && String(entry?.label || entry?.name || '').trim() === label)
    ));
    const candidate = String(resolved?.key || key).trim();
    if (candidate && !matched.includes(candidate)) matched.push(candidate);
  }
  return matched;
}

function applyScopedLibrariesIfNeeded(prompt, normalized, context) {
  if (!looksLikeScopeSwitchPrompt(prompt)) return;
  const nextKeys = resolvePreferredLibraryKeys(
    normalized?.libraries,
    context.availableLibraries,
  );
  if (!nextKeys.length) return;
  context.setPreferredLibraries?.(nextKeys);
}

function appendAssistantMessage(setMessages, message) {
  setMessages((prev) => appendChatMessageKeepingLatestFailure(prev, message));
}

async function applyActionResult(normalized, context) {
  const actionResult = normalized?.actionResult;
  if (!actionResult) return;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('aidp-platform-action', { detail: actionResult }));
  }
  if (actionResult.status !== 'completed') return;

  const invalidate = Array.isArray(actionResult.invalidate) ? actionResult.invalidate : [];
  const refreshTasks = [];
  if (invalidate.includes('documents') && context.loadDocumentSnapshot) {
    refreshTasks.push(context.loadDocumentSnapshot());
  }
  if (invalidate.includes('datasources') && context.loadDatasources) {
    refreshTasks.push(context.loadDatasources());
  }
  if (invalidate.includes('reports') && context.loadReports) {
    refreshTasks.push(context.loadReports());
  }
  if (invalidate.includes('models') && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('aidp-model-config-invalidated'));
  }

  if (refreshTasks.length) {
    await Promise.allSettled(refreshTasks);
  }

  if (actionResult.domain === 'documents' && actionResult.action === 'documents.create-library') {
    const key = String(actionResult?.entity?.key || '').trim();
    if (key) {
      context.setPreferredLibraries?.([key]);
    }
    return;
  }

  if (actionResult.domain === 'documents' && actionResult.action === 'documents.delete-library') {
    const deletedKey = String(actionResult?.entity?.key || '').trim();
    if (deletedKey) {
      context.setPreferredLibraries?.((current) => Array.isArray(current)
        ? current.filter((item) => item !== deletedKey)
        : []);
    }
  }
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
  if (normalized?.savedReport) {
    const savedItem = normalizeGeneratedReportRecord(normalized.savedReport);
    try {
      await loadReports?.();
      setSelectedReportId?.(savedItem.id);
      if (typeof window !== 'undefined' && isDraftGeneratedReport(savedItem)) {
        window.location.href = buildDraftEditorPath(savedItem);
        return;
      }
      return;
    } catch {
      setReportItems?.((prev) => [savedItem, ...prev.filter((item) => item.id !== savedItem.id)]);
      setSelectedReportId?.(savedItem.id);
      if (typeof window !== 'undefined' && isDraftGeneratedReport(savedItem)) {
        window.location.href = buildDraftEditorPath(savedItem);
        return;
      }
      return;
    }
  }

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
  if (typeof window !== 'undefined' && isDraftGeneratedReport(generatedReport)) {
    window.location.href = buildDraftEditorPath(generatedReport);
  }
}

function buildChatOptions(context, overrides = {}) {
  return {
    mode: overrides.mode || 'general',
    confirmedRequest: overrides.confirmedRequest || '',
    confirmedAction: overrides.confirmedAction || '',
    preferredLibraries: Array.isArray(overrides.preferredLibraries)
      ? overrides.preferredLibraries
      : (Array.isArray(context.preferredLibraries) ? context.preferredLibraries : []),
    conversationState: overrides.conversationState ?? context.conversationState ?? null,
    systemConstraints: overrides.systemConstraints ?? context.systemConstraints ?? '',
    botId: overrides.botId ?? context.selectedBotId ?? '',
  };
}

function buildOneTimePreferredDocumentConversationState(ingestItems) {
  const preferredDocumentPath = [...(Array.isArray(ingestItems) ? ingestItems : [])]
    .reverse()
    .find((item) => item?.status === 'success' && typeof item?.path === 'string' && item.path.trim())
    ?.path
    ?.trim();

  return preferredDocumentPath
    ? { kind: 'general', preferredDocumentPath }
    : null;
}

export async function runDocumentUpload(files, context) {
  const {
    defaultUploadNote,
    refreshHomeData,
    setMessages,
    setConversationState,
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
    setConversationState?.(buildOneTimePreferredDocumentConversationState(feedback.ingestItems));

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
  const { inputState, messages, setConversationState, setInput, setIsLoading, setMessages } = context;

  const text = String(value || '').trim();
  if (!text || inputState.isLoading || inputState.uploadLoading) return;

  const userMessage = { id: createMessageId('user'), role: 'user', content: text };
  setMessages((prev) => [...prev, userMessage]);
  setInput('');
  setIsLoading(true);

  try {
    const data = await sendChatPrompt(text, buildRecentChatHistory([...messages, userMessage]), buildChatOptions(context));
    const normalized = normalizeChatResponse(data, null);
    if (normalized?.mode === 'host') {
      // Keep cloud model health as-is; this turn was handled by a local platform action.
    } else if (looksLikeCloudUnavailable(normalized)) {
      setCloudModelUnavailable(normalized.message?.content, 'chat-fallback');
    } else {
      setCloudModelHealthy('chat-success');
    }
    applyScopedLibrariesIfNeeded(text, normalized, context);
    await applyActionResult(normalized, context);
    setConversationState?.(normalized.conversationState || null);
    const message = { ...normalized.message, id: createMessageId('assistant') };
    appendAssistantMessage(setMessages, message);
    await persistGeneratedReport(normalized, message, context, text);
  } catch (error) {
    setCloudModelUnavailable(
      error instanceof Error ? error.message : '当前云端模型暂时不可用，请稍后再试。',
      'chat-error',
    );
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

export async function confirmTemplateOption(option, context) {
  const { inputState, messages, setConversationState, setIsLoading, setMessages } = context;
  if (!option || inputState.isLoading || inputState.uploadLoading) return;

  const choiceText = `选择：${option.title || '继续执行'}`;
  const userMessage = {
    id: createMessageId('user'),
    role: 'user',
    content: choiceText,
  };
  setMessages((prev) => [...prev, userMessage]);
  setIsLoading(true);

  try {
    const data = await sendChatPrompt(
      option.executePrompt || option.confirmedRequest || option.title || '',
      buildRecentChatHistory([...messages, userMessage]),
      buildChatOptions(context, {
        mode: option.executeMode || 'general',
        confirmedAction: option.confirmedAction || '',
        confirmedRequest: option.confirmedRequest || '',
        preferredLibraries: option.preferredLibraries || [],
      }),
    );
    const normalized = normalizeChatResponse(data, null);
    if (normalized?.mode === 'host') {
      // Keep cloud model health as-is; this turn was handled by a local platform action.
    } else if (looksLikeCloudUnavailable(normalized)) {
      setCloudModelUnavailable(normalized.message?.content, 'template-chat-fallback');
    } else {
      setCloudModelHealthy('template-chat-success');
    }
    applyScopedLibrariesIfNeeded(
      option.confirmedRequest || option.executePrompt || option.title || '',
      normalized,
      context,
    );
    await applyActionResult(normalized, context);
    setConversationState?.(normalized.conversationState || null);
    const message = { ...normalized.message, id: createMessageId('assistant') };
    appendAssistantMessage(setMessages, message);
    await persistGeneratedReport(
      normalized,
      message,
      context,
      option.confirmedRequest || option.executePrompt || option.title || '',
    );
  } catch (error) {
    setCloudModelUnavailable(
      error instanceof Error ? error.message : '当前云端模型暂时不可用，请稍后再试。',
      'template-chat-error',
    );
    appendAssistantMessage(setMessages, {
      id: createMessageId('assistant'),
      role: 'assistant',
      title: '执行失败',
      content: error instanceof Error ? error.message : '当前执行失败，请稍后再试。',
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
