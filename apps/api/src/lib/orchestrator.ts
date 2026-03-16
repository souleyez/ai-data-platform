import { buildDocumentId, loadParsedDocuments, matchDocumentsByPrompt } from './document-store.js';
import { resolveScenario, scenarios, type ScenarioKey } from './mock-data.js';
import { isOpenClawGatewayConfigured, runOpenClawChat } from './openclaw-adapter.js';
import type { ParsedDocument } from './document-parser.js';

export type ChatRequestInput = {
  prompt: string;
  sessionUser?: string;
};

function buildDocumentContext(items: ParsedDocument[]) {
  return items.map((item, index) => {
    const extras = [
      `文档名：${item.name}`,
      `业务分类：${item.bizCategory}`,
      `解析分类：${item.category}`,
      `解析状态：${item.parseStatus}`,
      item.riskLevel ? `风险等级：${item.riskLevel}` : '',
      item.topicTags?.length ? `主题标签：${item.topicTags.join('、')}` : '',
      item.contractFields?.contractNo ? `合同编号：${item.contractFields.contractNo}` : '',
      item.contractFields?.amount ? `金额：${item.contractFields.amount}` : '',
      item.contractFields?.paymentTerms ? `付款条款：${item.contractFields.paymentTerms}` : '',
      item.contractFields?.duration ? `期限：${item.contractFields.duration}` : '',
      `摘要：${item.summary}`,
      `证据摘录：${item.excerpt}`,
    ].filter(Boolean);

    return `资料 ${index + 1}\n${extras.join('\n')}`;
  });
}

function buildMeta(scenarioKey: ScenarioKey, matchedDocs: ParsedDocument[], mode: 'openclaw' | 'fallback') {
  const scenario = scenarios[scenarioKey];
  const parts: string[] = [scenario.source];
  if (matchedDocs.length) {
    parts.push(`命中文档 ${matchedDocs.length} 篇`);
  }
  parts.push(mode === 'openclaw' ? '编排：OpenClaw' : '编排：fallback mock');
  return parts.join(' / ');
}

function buildFallbackAnswer(scenarioKey: ScenarioKey, matchedDocs: ParsedDocument[]) {
  const scenario = scenarios[scenarioKey];
  if (!matchedDocs.length) {
    return `${scenario.reply}\n\n当前没有命中足够相关的文档证据；如果你愿意，我下一步可以先帮你重扫文档库或调整分类绑定。`;
  }

  const docSummary = matchedDocs
    .map((item, index) => {
      const extra = item.category === 'contract'
        ? `风险等级：${item.riskLevel || 'unknown'}`
        : item.category === 'technical' || item.category === 'paper'
          ? `主题：${(item.topicTags || []).join('、') || '未识别'}`
          : `分类：${item.category}`;
      return `${index + 1}. ${item.name}（${extra}）\n- 摘要：${item.summary}\n- 证据摘录：${item.excerpt}`;
    })
    .join('\n');

  return [
    '以下结论仅基于当前命中的只读文档材料。若证据不足，我会明确保留判断。',
    '',
    scenario.reply,
    '',
    '命中文档与证据：',
    docSummary,
  ].join('\n');
}

function chooseScenario(prompt: string, matchedDocs: ParsedDocument[]): ScenarioKey {
  if (matchedDocs.length) {
    const contractCount = matchedDocs.filter((item) => item.category === 'contract').length;
    const docCount = matchedDocs.filter((item) => item.category === 'technical' || item.category === 'paper').length;

    if (contractCount > docCount) return 'contract';
    if (docCount > 0) return 'doc';
  }

  return resolveScenario(prompt);
}

export async function runChatOrchestration(input: ChatRequestInput) {
  const prompt = input.prompt.trim();
  const { items } = await loadParsedDocuments();
  const matchedDocs = matchDocumentsByPrompt(items, prompt);
  const scenarioKey = chooseScenario(prompt, matchedDocs);
  const scenario = scenarios[scenarioKey];

  let answer = '';
  let orchestrationMode: 'openclaw' | 'fallback' = 'fallback';

  if (isOpenClawGatewayConfigured()) {
    try {
      const result = await runOpenClawChat({
        prompt,
        sessionUser: input.sessionUser,
        contextBlocks: buildDocumentContext(matchedDocs),
      });
      answer = result.content;
      orchestrationMode = 'openclaw';
    } catch {
      answer = buildFallbackAnswer(scenarioKey, matchedDocs);
    }
  } else {
    answer = buildFallbackAnswer(scenarioKey, matchedDocs);
  }

  return {
    scenario: scenarioKey,
    traceId: `trace_${Date.now()}`,
    message: {
      role: 'assistant' as const,
      content: answer,
      meta: buildMeta(scenarioKey, matchedDocs, orchestrationMode),
      references: matchedDocs.map((item) => ({
        id: buildDocumentId(item.path),
        name: item.name,
        summary: item.summary,
        category: item.category,
        riskLevel: item.riskLevel,
        topicTags: item.topicTags,
      })),
    },
    panel: scenario,
    sources: [
      ...scenario.sources,
      ...matchedDocs.map((item) => ({ type: 'documents', name: item.name, table: item.path })),
    ],
    permissions: {
      mode: 'read-only',
    },
    orchestration: {
      mode: orchestrationMode,
      docMatches: matchedDocs.length,
      gatewayConfigured: isOpenClawGatewayConfigured(),
    },
    latencyMs: 120,
  };
}
