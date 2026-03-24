'use client';

import {
  createLoginCapture,
  createWebCapture,
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
  parseConversationAction,
  patchMessageById,
  patchMessagesWithIngestItems,
} from './home-message-helpers';
import { createGeneratedReport } from './lib/generated-reports';
import { normalizeChatResponse } from './lib/types';
import { scenarios } from './lib/mock-data';

function inferScenarioFromPrompt(text) {
  if (!text) return '';
  if (/(订单|销售|回款|sku)/i.test(text)) return 'order';
  if (/(合同|法务|条款|违约)/i.test(text)) return 'contract';
  if (/(文档|论文|技术|知识库|研究)/i.test(text)) return 'technical';
  if (/(日报|周报|进度|待办)/i.test(text)) return 'daily';
  if (/(发票|票据|核销)/i.test(text)) return 'invoice';
  if (/(客服|投诉|工单)/i.test(text)) return 'service';
  if (/(库存|出入库|补货)/i.test(text)) return 'inventory';
  return '';
}

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
    title: action.type === 'login_capture' ? '登录采集已转为正文采集' : '网页采集完成',
    content: action.type === 'login_capture'
      ? buildSummaryText(feedback, '已识别登录采集意图；当前先尝试按公开正文页面抓取并入库。')
      : buildSummaryText(feedback, '网页抓取、正文解析和入库反馈已返回。'),
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
    message: json?.message || '登录采集已完成，内容已结构化入库。',
    summary: json?.summary,
    ingestItems: json?.ingestItems || [],
  };

  seedSelectedLibraries(setSelectedManualLibraries, feedback.ingestItems);
  await refreshHomeData();

  return {
    needsCredential: false,
    message: buildIngestChatMessage({
      title: '登录采集完成',
      content: buildSummaryText(feedback, '登录后的正文内容已抓取、解析并入库。'),
      meta: json?.credentialSummary?.remembered
        ? `${action.url} · 已记住凭据`
        : action.url,
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
    const importantTitles = feedback.ingestItems
      .filter((item) => item.status === 'success')
      .map((item) => item.preview?.title)
      .filter(Boolean)
      .slice(0, 4);

    seedSelectedLibraries(setSelectedManualLibraries, feedback.ingestItems);

    appendAssistantMessage(setMessages, buildIngestChatMessage({
      title: '资料上传完成',
      content: importantTitles.length
        ? `本次重点识别标题：${importantTitles.join('、')}${feedback.summary && feedback.summary.total > importantTitles.length ? ` 等 ${feedback.summary.total} 项。` : '。'}`
        : buildSummaryText(feedback, feedback.message),
      meta: feedback.summary
        ? `成功 ${feedback.summary.successCount} 项，失败 ${feedback.summary.failedCount} 项`
        : files.map((file) => file.name).join('，'),
      feedback,
    }));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '文档上传失败';
    appendAssistantMessage(setMessages, {
      id: createMessageId('assistant'),
      role: 'assistant',
      title: '资料上传失败',
      content: errorMessage,
      meta: files.map((file) => file.name).join('，'),
    });
  } finally {
    if (uploadInputRef.current) uploadInputRef.current.value = '';
    setUploadLoading(false);
  }
}

export async function submitQuestion(value, context) {
  const {
    inputState,
    setActiveScenario,
    setInput,
    setIsLoading,
    setMessages,
    setPanel,
    setReportItems,
    setSelectedReportId,
    refreshHomeData,
    setSelectedManualLibraries,
  } = context;

  const text = value.trim();
  if (!text || inputState.isLoading || inputState.uploadLoading) return;

  const inferredScenario = inferScenarioFromPrompt(text);
  if (inferredScenario && scenarios[inferredScenario]) {
    setActiveScenario?.(inferredScenario);
    setPanel?.(scenarios[inferredScenario]);
  }

  setMessages((prev) => [...prev, { id: createMessageId('user'), role: 'user', content: text }]);
  setInput('');

  const action = parseConversationAction(text);
  if (action) {
    setIsLoading(true);
    try {
      if (action.type === 'login_capture') {
        const result = await runLoginCaptureAction(action, undefined, {
          setSelectedManualLibraries,
          refreshHomeData,
        });
        appendAssistantMessage(setMessages, result.message);
      } else {
        await runCaptureAction(action, {
          setMessages,
          setSelectedManualLibraries,
          refreshHomeData,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '网页采集失败';
      appendAssistantMessage(setMessages, {
        id: createMessageId('assistant'),
        role: 'assistant',
        title: action.type === 'login_capture' ? '登录采集失败' : '网页采集失败',
        content: errorMessage,
        meta: action.url,
      });
    } finally {
      setIsLoading(false);
    }
    return;
  }

  setIsLoading(true);
  try {
    const data = await sendChatPrompt(text);
    const normalized = normalizeChatResponse(data, scenarios.default);
    if (normalized.scenario) {
      setActiveScenario?.(normalized.scenario);
    }
    if (normalized.panel) {
      setPanel?.(normalized.panel);
    }
    const message = { ...normalized.message, id: createMessageId('assistant') };
    appendAssistantMessage(setMessages, message);
    const generatedReport = createGeneratedReport({ response: normalized, message });
    if (generatedReport) {
      setReportItems?.((prev) => [generatedReport, ...prev]);
      setSelectedReportId?.(generatedReport.id);
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
    const errorMessage = error instanceof Error ? error.message : '保存知识库分组失败';
    appendAssistantMessage(setMessages, {
      id: createMessageId('assistant'),
      role: 'assistant',
      title: '知识库分组更新失败',
      content: errorMessage,
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
  const { messages, refreshHomeData, setIsLoading, setMessages, setSelectedManualLibraries } = context;
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
    const result = await runLoginCaptureAction(action, credentials, {
      setSelectedManualLibraries,
      refreshHomeData,
    });
    appendAssistantMessage(setMessages, result.message);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '登录采集失败';
    appendAssistantMessage(setMessages, {
      id: createMessageId('assistant'),
      role: 'assistant',
      title: '登录采集失败',
      content: errorMessage,
      meta: request.url,
    });
  } finally {
    setIsLoading(false);
  }
}
