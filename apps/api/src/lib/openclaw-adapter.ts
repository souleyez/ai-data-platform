import { getActiveOpenClawModel, loadModelConfigState } from './model-config.js';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type OpenClawChatRequest = {
  prompt: string;
  systemPrompt?: string;
  contextBlocks?: string[];
  chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  sessionUser?: string;
};

export type OpenClawChatResult = {
  content: string;
  provider: 'cloud-gateway';
  model: string;
  raw?: unknown;
};

function env(name: string, fallback?: string) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

function getGatewayTimeoutMs() {
  const parsed = Number(env('OPENCLAW_GATEWAY_TIMEOUT_MS', '45000'));
  if (!Number.isFinite(parsed) || parsed < 3000) return 45000;
  return parsed;
}

function hasUsableGatewayToken(token?: string) {
  const value = String(token || '').trim();
  if (!value) return false;
  return !/^replace-with-your-/i.test(value);
}

function isLocalGatewayUrl(url?: string) {
  const value = String(url || '').trim().toLowerCase();
  return value.startsWith('http://127.0.0.1') || value.startsWith('http://localhost');
}

function buildDefaultSystemPrompt() {
  return [
    '你是产品“AI智能服务”里的云端智能助手。',
    '除非用户明确要求其他语言，否则一律使用自然、专业、简洁的中文回答。',
    '直接回答用户问题，不要自我介绍，不要谈内部实现，也不要暴露底层模型或网关信息。',
    '尽量自然分段，不要使用 Markdown 标题、星号、井号、竖线和分隔线。',
    '不要使用过多括号和装饰性符号。',
    '如果用户要的是分析、总结、建议或方案，就直接给结果，不要加多余开场白。',
  ].join('\n');
}

function buildMessages(input: OpenClawChatRequest): ChatMessage[] {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: input.systemPrompt || buildDefaultSystemPrompt(),
    },
  ];

  const context = (input.contextBlocks || []).filter(Boolean);
  if (context.length) {
    messages.push({
      role: 'system',
      content: ['以下是与当前请求相关的知识库上下文，请优先参考：', context.join('\n\n')].join('\n\n'),
    });
  }

  for (const item of input.chatHistory || []) {
    const role = item?.role === 'assistant' ? 'assistant' : 'user';
    const content = String(item?.content || '').trim();
    if (!content) continue;
    messages.push({ role, content });
  }

  messages.push({
    role: 'user',
    content: String(input.prompt || '').trim(),
  });

  return messages;
}

function sanitizeModelContent(content: string) {
  return String(content || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim();
}

function looksLikeOnboardingDrift(content: string) {
  const text = String(content || '');
  return /(刚上线|给我起个名字|怎么称呼你|记忆是空的|我可以先介绍自己|你想叫我什么|没名字|没个性|第一次聊)/.test(text);
}

async function requestChatCompletion(baseUrl: string, headers: Record<string, string>, body: unknown) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getGatewayTimeoutMs());

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Cloud gateway request failed (${response.status}): ${text}`);
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = sanitizeModelContent(json.choices?.[0]?.message?.content || '');
    if (!content) {
      throw new Error('Cloud gateway returned empty content');
    }

    return { json, content };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Cloud gateway request timed out after ${getGatewayTimeoutMs()}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function isOpenClawGatewayConfigured() {
  const baseUrl = env('OPENCLAW_GATEWAY_URL');
  const token = env('OPENCLAW_GATEWAY_TOKEN');
  return Boolean(baseUrl && (hasUsableGatewayToken(token) || isLocalGatewayUrl(baseUrl)));
}

export async function isOpenClawGatewayReachable() {
  const baseUrl = env('OPENCLAW_GATEWAY_URL');
  const token = env('OPENCLAW_GATEWAY_TOKEN');
  if (!baseUrl) return false;
  if (!hasUsableGatewayToken(token) && !isLocalGatewayUrl(baseUrl)) return false;

  const headers: Record<string, string> = {};
  if (hasUsableGatewayToken(token)) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 800);

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/health`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    return response.ok || response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function runOpenClawChat(input: OpenClawChatRequest): Promise<OpenClawChatResult> {
  const baseUrl = env('OPENCLAW_GATEWAY_URL');
  const token = env('OPENCLAW_GATEWAY_TOKEN');
  const agentId = env('OPENCLAW_AGENT_ID', 'main');
  const [selectedModel, modelState] = await Promise.all([
    getActiveOpenClawModel(),
    loadModelConfigState(),
  ]);

  const model =
    modelState?.openclaw?.usesDevBridge || modelState?.openclaw?.installMode === 'wsl'
      ? agentId ? `openclaw/${agentId}` : 'openclaw'
      : (selectedModel || env('OPENCLAW_MODEL', `openclaw:${agentId}`));

  if (!baseUrl || (!hasUsableGatewayToken(token) && !isLocalGatewayUrl(baseUrl))) {
    throw new Error('Cloud gateway is not configured');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (hasUsableGatewayToken(token)) headers.Authorization = `Bearer ${token}`;
  if (agentId) headers['x-openclaw-agent-id'] = agentId;

  const baseMessages = buildMessages(input);

  let result = await requestChatCompletion(baseUrl, headers, {
    model,
    user: input.sessionUser,
    temperature: 0.2,
    messages: baseMessages,
  });

  if (looksLikeOnboardingDrift(result.content)) {
    result = await requestChatCompletion(baseUrl, headers, {
      model,
      user: input.sessionUser,
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content: '直接回答用户当前问题。不要自我介绍，不要谈内部状态，不要说自己没名字、没个性、第一次聊天，也不要让用户给你起名。',
        },
        ...baseMessages,
      ],
    });
  }

  if (looksLikeOnboardingDrift(result.content)) {
    result = await requestChatCompletion(baseUrl, headers, {
      model,
      user: input.sessionUser,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: '只回答用户当前问题。禁止自我介绍，禁止让用户给你起名，禁止谈刚启动或记忆状态。',
        },
        {
          role: 'user',
          content: input.prompt,
        },
      ],
    });
  }

  return {
    content: result.content,
    provider: 'cloud-gateway',
    model: selectedModel || model || 'cloud-model',
    raw: result.json,
  };
}
