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
    '你是产品“AI 知识数据管理”里的云端智能助手。',
    '除非用户明确要求其他语言，否则一律使用自然、专业、简洁的中文回答。',
    '直接回答用户问题，不要自我介绍，不要说自己刚上线，不要说记忆是空的，不要让用户给你起名，不要询问别人该怎么称呼你。',
    '不要提系统启动、内部配置、隐藏状态、bootstrap 文件、调试过程或任何实现细节。',
    '不要声称自己修改了本地文件、数据库或系统设置，除非用户在产品里明确执行了可见操作。',
    '普通业务问答就直接回答，不要把简单问题改写成寒暄、角色扮演或开场白。',
    '输出风格以自然分段为主，尽量少括号、少插话、少装饰符号。',
    '不要使用 markdown 标题、星号、井号、竖线、分隔线，除非用户明确要求 markdown 格式。',
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
  return /(刚上线|不知道自己是谁|给我起个名字|该怎么称呼你|记忆是空的|名字、风格、个性都还没定|我是一个全新的开始)/.test(
    text,
  );
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
  if (hasUsableGatewayToken(token)) {
    headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 800);

  try {
    const url = `${baseUrl.replace(/\/$/, '')}/health`;
    const response = await fetch(url, {
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
  const model = modelState?.openclaw?.usesDevBridge || modelState?.openclaw?.installMode === 'wsl'
    ? (agentId ? `openclaw/${agentId}` : 'openclaw')
    : (selectedModel || env('OPENCLAW_MODEL', `openclaw:${agentId}`));

  if (!baseUrl || (!hasUsableGatewayToken(token) && !isLocalGatewayUrl(baseUrl))) {
    throw new Error('Cloud gateway is not configured');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (hasUsableGatewayToken(token)) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (agentId) {
    headers['x-openclaw-agent-id'] = agentId;
  }

  const baseMessages = buildMessages(input);

  try {
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
            content:
              '直接回答用户当前问题。不要自我介绍，不要说刚上线，不要谈记忆是否为空，不要向用户索要称呼或名字。',
          },
          ...baseMessages,
        ],
      });
    }

    return {
      content: result.content,
      provider: 'cloud-gateway',
      model: selectedModel || model || 'cloud-model',
      raw: result.json,
    };
  } catch (error) {
    throw error;
  }
}
