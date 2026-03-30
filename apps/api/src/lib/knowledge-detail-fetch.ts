import type { RetrievalResult } from './document-retrieval.js';
import { buildKnowledgeContext } from './knowledge-evidence.js';
import { buildKnowledgeDetailFetchPrompt } from './knowledge-prompts.js';
import { isOpenClawGatewayConfigured, runOpenClawChat } from './openclaw-adapter.js';
import { loadWorkspaceSkillBundle } from './workspace-skills.js';

type KnowledgeLibrary = { key: string; label: string };

export type KnowledgeDetailFetchInput = {
  requestText: string;
  libraries: KnowledgeLibrary[];
  retrieval: RetrievalResult;
  timeRange?: string;
  contentFocus?: string;
  sessionUser?: string;
  chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
};

export type KnowledgeDetailFetchResult = {
  content: string;
  provider: 'openclaw-skill' | 'degraded-local';
  model: string;
};

function sanitizeText(value: unknown, maxLength = 220) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength).trim() : text;
}

function buildLibraryLabel(libraries: KnowledgeLibrary[]) {
  const labels = libraries
    .map((item) => sanitizeText(item.label || item.key, 80))
    .filter(Boolean);
  return labels.length ? labels.join('、') : '当前知识库';
}

export function buildKnowledgeDetailFallbackAnswer(input: KnowledgeDetailFetchInput) {
  const libraryLabel = buildLibraryLabel(input.libraries);
  const documents = input.retrieval.documents
    .slice(0, 3)
    .map((item, index) => {
      const title = sanitizeText(item.title || item.name, 80) || `文档${index + 1}`;
      const summary = sanitizeText(item.summary || item.excerpt || '', 140);
      return summary ? `${index + 1}. ${title}：${summary}` : `${index + 1}. ${title}`;
    })
    .filter(Boolean);
  const evidence = input.retrieval.evidenceMatches
    .slice(0, 4)
    .map((item, index) => {
      const title = sanitizeText(item.item.title || item.item.name, 80);
      const text = sanitizeText(item.chunkText, 140);
      if (!text) return '';
      return title ? `${index + 1}. ${title}：${text}` : `${index + 1}. ${text}`;
    })
    .filter(Boolean);

  const parts = [
    `先基于当前命中的 ${libraryLabel} 文档详情给你一个直接整理版答案。`,
    '这次没有完成云端详情生成，所以以下内容来自已检索到的文档摘要和证据块，不代表已经复核了全部原文。',
    documents.length ? `优先文档：\n${documents.join('\n')}` : '',
    evidence.length ? `关键信息：\n${evidence.join('\n')}` : '',
  ].filter(Boolean);

  return parts.join('\n\n');
}

async function buildSystemPrompt() {
  const skillInstruction = await loadWorkspaceSkillBundle('knowledge-detail-fetch', [
    'references/output-contract.md',
  ]);
  return buildKnowledgeDetailFetchPrompt(skillInstruction);
}

export async function runKnowledgeDetailFetch(
  input: KnowledgeDetailFetchInput,
): Promise<KnowledgeDetailFetchResult> {
  const degradedContent = buildKnowledgeDetailFallbackAnswer(input);

  if (!input.retrieval.documents.length) {
    return {
      content: degradedContent,
      provider: 'degraded-local',
      model: 'degraded-local',
    };
  }

  if (!isOpenClawGatewayConfigured()) {
    return {
      content: degradedContent,
      provider: 'degraded-local',
      model: 'degraded-local',
    };
  }

  try {
    const systemPrompt = await buildSystemPrompt();
    const cloud = await runOpenClawChat({
      prompt: input.requestText,
      sessionUser: input.sessionUser,
      chatHistory: input.chatHistory,
      contextBlocks: [
        buildKnowledgeContext(input.requestText, input.libraries, input.retrieval, {
          timeRange: input.timeRange,
          contentFocus: input.contentFocus,
        }),
      ],
      systemPrompt,
    });

    return {
      content: cloud.content,
      provider: 'openclaw-skill',
      model: cloud.model,
    };
  } catch {
    return {
      content: degradedContent,
      provider: 'degraded-local',
      model: 'degraded-local',
    };
  }
}
