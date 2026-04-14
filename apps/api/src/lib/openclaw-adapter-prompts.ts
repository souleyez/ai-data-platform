import type {
  ChatMessage,
  OpenClawChatRequest,
  OpenClawResponseInputItem,
  OpenClawResponsesPayload,
} from './openclaw-adapter-types.js';

function shouldSuppressAssistantHistoryMessage(content: string) {
  return looksLikeLeakedToolCallContent(content);
}

export function buildDefaultSystemPrompt() {
  return [
    '你是产品“AI智能服务”中的云端智能助手。',
    '除非用户明确要求其他语言，否则一律使用自然、专业、简洁的中文回答。',
    '直接回答用户问题，不要自我介绍，不要谈内部实现，也不要暴露底层模型或网关信息。',
    '尽量自然分段，不要使用 Markdown 标题、星号、井号、竖线和分隔线。',
    '不要使用过多括号和装饰性符号。',
    '如果用户要的是分析、总结、建议或方案，就直接给结果，不要加多余开场白。',
  ].join('\n');
}

export function buildMessages(input: OpenClawChatRequest): ChatMessage[] {
  const context = (input.contextBlocks || []).filter(Boolean);
  const systemParts = [input.systemPrompt || buildDefaultSystemPrompt()];

  if (context.length) {
    systemParts.push(['以下是与当前请求相关的知识库上下文，请优先参考：', context.join('\n\n')].join('\n\n'));
  }

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: systemParts.filter(Boolean).join('\n\n'),
    },
  ];

  for (const item of input.chatHistory || []) {
    const role = item?.role === 'assistant' ? 'assistant' : 'user';
    const content = String(item?.content || '').trim();
    if (!content) continue;
    if (role === 'assistant' && shouldSuppressAssistantHistoryMessage(content)) continue;
    messages.push({ role, content });
  }

  messages.push({
    role: 'user',
    content: String(input.prompt || '').trim(),
  });

  return messages;
}

export function buildResponsesInstructions(input: OpenClawChatRequest, preferNativeWebSearch = false) {
  const context = (input.contextBlocks || []).filter(Boolean);
  const instructionParts = [input.systemPrompt || buildDefaultSystemPrompt()];

  if (preferNativeWebSearch) {
    instructionParts.push(
      [
        '如果用户问题包含最新、当前、官网、新闻、价格、天气、比分、赛程、公告等实时信息，',
        '并且原生网页搜索能力可用，请优先使用 OpenClaw 的原生网页搜索后再回答。',
        '回答中直接给结论，并尽量基于搜索结果表述，不要暴露内部工具细节。',
      ].join(''),
    );
  }

  if (context.length) {
    instructionParts.push(
      ['以下是与当前请求相关的补充上下文，请一并参考：', context.join('\n\n')].join('\n\n'),
    );
  }

  return instructionParts.filter(Boolean).join('\n\n');
}

export function buildResponsesInput(input: OpenClawChatRequest): OpenClawResponseInputItem[] {
  const items: OpenClawResponseInputItem[] = [];

  for (const item of input.chatHistory || []) {
    const role = item?.role === 'assistant' ? 'assistant' : 'user';
    const content = String(item?.content || '').trim();
    if (!content) continue;
    if (role === 'assistant' && shouldSuppressAssistantHistoryMessage(content)) continue;
    items.push({
      type: 'message',
      role,
      content,
    });
  }

  const prompt = String(input.prompt || '').trim();
  if (prompt) {
    items.push({
      type: 'message',
      role: 'user',
      content: prompt,
    });
  }

  return items;
}

export function sanitizeModelContent(content: string) {
  return String(content || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim();
}

export function looksLikeLeakedToolCallContent(content: string) {
  const text = String(content || '').trim();
  if (!text) return false;

  return (
    /<\s*tool_(?:call|code)\b/i.test(text)
    || /<\s*minimax:tool_call\b/i.test(text)
    || /<\s*invoke\b/i.test(text)
    || /<\s*parameter\b/i.test(text)
    || /<\/\s*invoke\s*>/i.test(text)
  );
}

export function looksLikeOnboardingDrift(content: string) {
  const text = String(content || '');
  return /(刚上线|给我起个名字|怎么称呼你|记忆是空的|我可以先介绍自己|你想叫我什么|没名字|第一次聊天)/.test(text);
}

export function buildNoToolLeakSystemPrompt() {
  return [
    '不要输出任何原始工具调用标记、XML 风格的 invoke 或 parameter 标签、<tool_call>、<tool_code>、Bash 计划或命令执行步骤。',
    '当前宿主不会执行你输出的这些工具指令。',
    '如果用户是在提问、分析、总结、写作或生成交付物，请直接基于已有上下文给出最终结果或可直接使用的草稿。',
    '只有在用户明确要求命令文本时，才可以给命令；否则禁止把命令或执行计划当作答案主体。',
  ].join('\n');
}

export function withAdditionalSystemInstruction(messages: ChatMessage[], instruction: string): ChatMessage[] {
  const normalizedInstruction = String(instruction || '').trim();
  if (!normalizedInstruction) return messages;
  if (!Array.isArray(messages) || !messages.length) {
    return [{ role: 'system', content: normalizedInstruction }];
  }

  const [first, ...rest] = messages;
  if (first.role !== 'system') {
    return [{ role: 'system', content: normalizedInstruction }, first, ...rest];
  }

  return [
    {
      role: 'system',
      content: `${first.content}\n\n${normalizedInstruction}`.trim(),
    },
    ...rest,
  ];
}

export function extractResponseOutputText(payload: OpenClawResponsesPayload) {
  const blocks: string[] = [];
  for (const item of payload.output || []) {
    if (item?.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (String(part?.type || '') !== 'output_text') continue;
      const text = sanitizeModelContent(String(part?.text || '').trim());
      if (text) blocks.push(text);
    }
  }
  return blocks.join('\n\n').trim();
}
