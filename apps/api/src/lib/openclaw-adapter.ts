import { getActiveOpenClawModel } from './model-config.js';

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
        '你是企业只读分析助手。请仅基于提供的上下文回答，优先输出中文。先给结论，再列出依据；若证据不足要明确说明“不足以判断”或“材料未覆盖”；不要编造不存在的数据。若引用材料，优先点名具体文档名并结合证据摘录来回答。',
    },
    {
      role: 'user',
      content: userContent,
    },
  ];
}

function sanitizeModelContent(content: string) {
  return String(content || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim();
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
  const model = (await getActiveOpenClawModel()) || env('OPENCLAW_MODEL', `openclaw:${agentId}`);

  if (!baseUrl || (!hasUsableGatewayToken(token) && !isLocalGatewayUrl(baseUrl))) {
    throw new Error('OpenClaw gateway is not configured');
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getGatewayTimeoutMs());

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers,
      signal: controller.signal,
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

    const content = sanitizeModelContent(json.choices?.[0]?.message?.content || '');
    if (!content) {
      throw new Error('OpenClaw gateway returned empty content');
    }

    return {
      content,
      provider: 'openclaw-gateway',
      model: model || 'openclaw',
      raw: json,
    };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`OpenClaw gateway request timed out after ${getGatewayTimeoutMs()}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
