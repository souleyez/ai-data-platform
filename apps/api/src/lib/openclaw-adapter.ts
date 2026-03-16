type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type OpenClawChatRequest = {
  prompt: string;
  systemPrompt?: string;
  contextBlocks?: string[];
  sessionUser?: string;
};

export type OpenClawChatResult = {
  content: string;
  provider: 'openclaw-gateway';
  model: string;
  raw?: unknown;
};

function env(name: string, fallback?: string) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

function buildMessages(input: OpenClawChatRequest): ChatMessage[] {
  const context = input.contextBlocks?.filter(Boolean) ?? [];
  const userContent = [
    context.length ? `以下是与问题相关的只读文档上下文，请优先基于这些材料回答，并明确说明不确定处：\n\n${context.join('\n\n')}` : '',
    `用户问题：${input.prompt}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  return [
    {
      role: 'system',
      content:
        input.systemPrompt ||
        '你是企业只读分析助手。请仅基于提供的上下文回答，优先输出中文，结论要简洁可信；若证据不足要明确说明；不要编造不存在的数据。',
    },
    {
      role: 'user',
      content: userContent,
    },
  ];
}

export function isOpenClawGatewayConfigured() {
  return Boolean(env('OPENCLAW_GATEWAY_URL') && env('OPENCLAW_GATEWAY_TOKEN'));
}

export async function runOpenClawChat(input: OpenClawChatRequest): Promise<OpenClawChatResult> {
  const baseUrl = env('OPENCLAW_GATEWAY_URL');
  const token = env('OPENCLAW_GATEWAY_TOKEN');
  const agentId = env('OPENCLAW_AGENT_ID', 'main');
  const model = env('OPENCLAW_MODEL', `openclaw:${agentId}`);

  if (!baseUrl || !token) {
    throw new Error('OpenClaw gateway is not configured');
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  if (agentId) {
    headers['x-openclaw-agent-id'] = agentId;
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      user: input.sessionUser,
      temperature: 0.2,
      messages: buildMessages(input),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenClaw gateway request failed (${response.status}): ${text}`);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('OpenClaw gateway returned empty content');
  }

  return {
    content,
    provider: 'openclaw-gateway',
    model: model || 'openclaw',
    raw: json,
  };
}
