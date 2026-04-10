import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  ensureAllowedOpenClawModel,
  ensureNativeSearchPreferredConfig,
  getActiveOpenClawModel,
} from './model-config.js';

const execFileAsync = promisify(execFile);
let wslGatewayTokenCache: { token: string; expiresAt: number } = {
  token: '',
  expiresAt: 0,
};

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
  modelOverride?: string;
  timeoutMs?: number;
  preferResponses?: boolean;
};

export type OpenClawChatResult = {
  content: string;
  provider: 'cloud-gateway';
  model: string;
  raw?: unknown;
};

type OpenClawResponseInputItem = {
  type: 'message';
  role: 'system' | 'developer' | 'user' | 'assistant';
  content: string;
};

type OpenClawResponsesPayload = {
  id?: string;
  output?: Array<
    | {
        type?: 'message';
        content?: Array<{ type?: string; text?: string }>;
      }
    | {
        type?: 'reasoning';
        content?: string;
        summary?: string;
      }
  >;
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

function resolveGatewayTimeoutMs(timeoutMs?: number) {
  const parsed = Number(timeoutMs);
  if (!Number.isFinite(parsed) || parsed < 3000) return getGatewayTimeoutMs();
  return Math.floor(parsed);
}

function getGatewayRetryCount() {
  const parsed = Number(env('OPENCLAW_GATEWAY_RETRY_COUNT', '1'));
  if (!Number.isFinite(parsed) || parsed < 0) return 1;
  return Math.min(Math.floor(parsed), 2);
}

function getGatewayRetryDelayMs(attempt: number) {
  const delays = [350, 900];
  return delays[Math.max(0, Math.min(attempt - 1, delays.length - 1))] || 900;
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

function getWslDistro() {
  return env('OPENCLAW_WSL_DISTRO', 'Ubuntu-24.04') || 'Ubuntu-24.04';
}

async function readWslGatewayToken(forceRefresh = false) {
  if (process.platform !== 'win32') return '';

  const now = Date.now();
  if (!forceRefresh && wslGatewayTokenCache.token && wslGatewayTokenCache.expiresAt > now) {
    return wslGatewayTokenCache.token;
  }

  const script = [
    "python3 - <<'PY'",
    'import json, pathlib',
    "path = pathlib.Path.home() / '.openclaw' / 'openclaw.json'",
    "data = json.loads(path.read_text(encoding='utf-8'))",
    "print(data.get('gateway', {}).get('auth', {}).get('token', ''))",
    'PY',
  ].join('\n');

  try {
    const result = await execFileAsync(
      'wsl.exe',
      ['-d', getWslDistro(), '--', 'bash', '-lc', script],
      {
        windowsHide: true,
        timeout: 3000,
      },
    );
    const token = String(result.stdout || '').trim();
    if (!token) return '';
    wslGatewayTokenCache = {
      token,
      expiresAt: now + 60_000,
    };
    return token;
  } catch {
    return '';
  }
}

async function resolveGatewayToken(baseUrl?: string, configuredToken?: string) {
  if (hasUsableGatewayToken(configuredToken)) return String(configuredToken || '').trim();
  if (!isLocalGatewayUrl(baseUrl)) return '';
  return readWslGatewayToken();
}

// The API layer must always speak to gateways using the gateway-scoped model ids:
// `openclaw` or `openclaw/<agentId>`.
//
// Windows local development and the 120 server do not use the same bridge
// implementation:
// - Windows uses `tools/openclaw-local-gateway.mjs`
// - 120 uses `tools/http-model-bridge.mjs`
//
// Both bridge layers are required to accept these `openclaw`-scoped ids and
// translate them to the real provider model. Do not change this helper back to
// emitting provider ids such as `minimax/...`, or one side of the deployment
// matrix will break again.
export function buildGatewayRequestModel(agentId?: string) {
  const normalizedAgentId = String(agentId || '').trim();
  if (!normalizedAgentId || normalizedAgentId === 'main') {
    return 'openclaw';
  }
  return `openclaw/${normalizedAgentId}`;
}

export function resolveOpenClawModelOverride(modelOverride?: string) {
  const normalizedOverride = String(modelOverride || '').trim();
  return normalizedOverride || '';
}

function buildDefaultSystemPrompt() {
  return [
    '你是产品“AI智能服务”中的云端智能助手。',
    '除非用户明确要求其他语言，否则一律使用自然、专业、简洁的中文回答。',
    '直接回答用户问题，不要自我介绍，不要谈内部实现，也不要暴露底层模型或网关信息。',
    '尽量自然分段，不要使用 Markdown 标题、星号、井号、竖线和分隔线。',
    '不要使用过多括号和装饰性符号。',
    '如果用户要的是分析、总结、建议或方案，就直接给结果，不要加多余开场白。',
  ].join('\n');
}

function buildMessages(input: OpenClawChatRequest): ChatMessage[] {
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

function buildResponsesInstructions(input: OpenClawChatRequest, preferNativeWebSearch = false) {
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

function buildResponsesInput(input: OpenClawChatRequest): OpenClawResponseInputItem[] {
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

function sanitizeModelContent(content: string) {
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

function looksLikeOnboardingDrift(content: string) {
  const text = String(content || '');
  return /(刚上线|给我起个名字|怎么称呼你|记忆是空的|我可以先介绍自己|你想叫我什么|没名字|第一次聊天)/.test(text);
}

function shouldSuppressAssistantHistoryMessage(content: string) {
  return looksLikeLeakedToolCallContent(content);
}

function buildNoToolLeakSystemPrompt() {
  return [
    '不要输出任何原始工具调用标记、XML 风格的 invoke 或 parameter 标签、<tool_call>、<tool_code>、Bash 计划或命令执行步骤。',
    '当前宿主不会执行你输出的这些工具指令。',
    '如果用户是在提问、分析、总结、写作或生成交付物，请直接基于已有上下文给出最终结果或可直接使用的草稿。',
    '只有在用户明确要求命令文本时，才可以给命令；否则禁止把命令或执行计划当作答案主体。',
  ].join('\n');
}

function withAdditionalSystemInstruction(messages: ChatMessage[], instruction: string): ChatMessage[] {
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

async function requestChatCompletion(
  baseUrl: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs?: number,
) {
  const controller = new AbortController();
  const resolvedTimeoutMs = resolveGatewayTimeoutMs(timeoutMs);
  const timeout = setTimeout(() => controller.abort(), resolvedTimeoutMs);

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
      throw new Error(`Cloud gateway request timed out after ${resolvedTimeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function requestOpenResponses(
  baseUrl: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs?: number,
) {
  const controller = new AbortController();
  const resolvedTimeoutMs = resolveGatewayTimeoutMs(timeoutMs);
  const timeout = setTimeout(() => controller.abort(), resolvedTimeoutMs);

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/responses`, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenResponses request failed (${response.status}): ${text}`);
    }

    return (await response.json()) as OpenClawResponsesPayload;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`OpenResponses request timed out after ${resolvedTimeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function requestOpenResponsesWithRetry(
  baseUrl: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs?: number,
) {
  const maxAttempts = 1 + getGatewayRetryCount();
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await requestOpenResponses(baseUrl, headers, body, timeoutMs);
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isRetryableCloudGatewayError(error)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, getGatewayRetryDelayMs(attempt)));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('OpenResponses request failed');
}

export function isRetryableCloudGatewayError(error: unknown) {
  const message = String(error instanceof Error ? error.message : error || '').toLowerCase();
  if (!message) return false;

  return (
    /(?:cloud gateway|openresponses)\s+request failed \((500|502|503|504)\)/.test(message)
    || /request failed \((500|502|503|504)\)/.test(message)
    || message.includes('unknown error, 520')
    || message.includes('"type":"server_error"')
    || message.includes('temporarily unavailable')
    || message.includes('upstream connect error')
    || message.includes('timed out')
    || message.includes('timeout')
    || message.includes('overloaded')
  );
}

export function isOpenClawModelOverrideDeniedError(error: unknown) {
  const message = String(error instanceof Error ? error.message : error || '').toLowerCase();
  return message.includes('is not allowed for agent');
}

function extractResponseOutputText(payload: OpenClawResponsesPayload) {
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

async function requestOpenResponsesAllowingModelOverride(params: {
  baseUrl: string;
  headers: Record<string, string>;
  body: unknown;
  modelOverride?: string;
  timeoutMs?: number;
}) {
  const modelOverride = resolveOpenClawModelOverride(params.modelOverride);

  try {
    return await requestOpenResponsesWithRetry(params.baseUrl, params.headers, params.body, params.timeoutMs);
  } catch (error) {
    if (!modelOverride || !isOpenClawModelOverrideDeniedError(error)) {
      throw error;
    }

    await ensureAllowedOpenClawModel(modelOverride);
    return requestOpenResponsesWithRetry(params.baseUrl, params.headers, params.body, params.timeoutMs);
  }
}

export async function tryRunOpenClawNativeWebSearchChat(input: OpenClawChatRequest): Promise<OpenClawChatResult | null> {
  const baseUrl = env('OPENCLAW_GATEWAY_URL');
  const token = env('OPENCLAW_GATEWAY_TOKEN');
  const agentId = env('OPENCLAW_AGENT_ID', 'main');
  const selectedModel = await getActiveOpenClawModel();
  const model = buildGatewayRequestModel(agentId);
  const modelOverride = resolveOpenClawModelOverride(input.modelOverride);

  if (!baseUrl || (!hasUsableGatewayToken(token) && !isLocalGatewayUrl(baseUrl))) {
    return null;
  }

  try {
    await ensureNativeSearchPreferredConfig();
  } catch {
    // Keep going; the request itself can still fail over to project-side search.
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const authToken = await resolveGatewayToken(baseUrl, token);
  if (hasUsableGatewayToken(authToken)) headers.Authorization = `Bearer ${authToken}`;
  if (agentId) headers['x-openclaw-agent-id'] = agentId;
  if (modelOverride) headers['x-openclaw-model'] = modelOverride;

  try {
    const json = await requestOpenResponses(baseUrl, headers, {
      model,
      user: input.sessionUser,
      input: buildResponsesInput(input),
      instructions: buildResponsesInstructions(input, true),
      temperature: 0.1,
      reasoning: {
        effort: 'medium',
        summary: 'auto',
      },
    }, input.timeoutMs);
    const content = extractResponseOutputText(json);
    if (!content || looksLikeLeakedToolCallContent(content)) return null;

    return {
      content,
      provider: 'cloud-gateway',
      model: modelOverride || selectedModel || model || 'cloud-model',
      raw: json,
    };
  } catch {
    return null;
  }
}

async function requestChatCompletionWithRetry(
  baseUrl: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs?: number,
) {
  const maxAttempts = 1 + getGatewayRetryCount();
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await requestChatCompletion(baseUrl, headers, body, timeoutMs);
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isRetryableCloudGatewayError(error)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, getGatewayRetryDelayMs(attempt)));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Cloud gateway request failed');
}

async function requestChatCompletionAllowingModelOverride(params: {
  baseUrl: string;
  headers: Record<string, string>;
  body: unknown;
  modelOverride?: string;
  timeoutMs?: number;
}) {
  const modelOverride = resolveOpenClawModelOverride(params.modelOverride);

  try {
    return await requestChatCompletionWithRetry(params.baseUrl, params.headers, params.body, params.timeoutMs);
  } catch (error) {
    if (!modelOverride || !isOpenClawModelOverrideDeniedError(error)) {
      throw error;
    }

    await ensureAllowedOpenClawModel(modelOverride);
    return requestChatCompletionWithRetry(params.baseUrl, params.headers, params.body, params.timeoutMs);
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
  const authToken = await resolveGatewayToken(baseUrl, token);
  if (hasUsableGatewayToken(authToken)) headers.Authorization = `Bearer ${authToken}`;

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
  const selectedModel = await getActiveOpenClawModel();
  const model = buildGatewayRequestModel(agentId);
  const modelOverride = resolveOpenClawModelOverride(input.modelOverride);

  if (!baseUrl || (!hasUsableGatewayToken(token) && !isLocalGatewayUrl(baseUrl))) {
    throw new Error('Cloud gateway is not configured');
  }

  try {
    await ensureNativeSearchPreferredConfig();
  } catch {
    // Keep chat available even if config normalization fails.
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const authToken = await resolveGatewayToken(baseUrl, token);
  if (hasUsableGatewayToken(authToken)) headers.Authorization = `Bearer ${authToken}`;
  if (agentId) headers['x-openclaw-agent-id'] = agentId;
  if (modelOverride) headers['x-openclaw-model'] = modelOverride;

  const baseMessages = buildMessages(input);

  if (input.preferResponses) {
    try {
      const responsePayload = await requestOpenResponsesAllowingModelOverride({
        baseUrl,
        headers,
        modelOverride,
        timeoutMs: input.timeoutMs,
        body: {
          model,
          user: input.sessionUser,
          input: buildResponsesInput(input),
          instructions: buildResponsesInstructions(input, false),
          temperature: 0.2,
          reasoning: {
            effort: 'medium',
            summary: 'auto',
          },
        },
      });
      const responseContent = extractResponseOutputText(responsePayload);
      if (responseContent && !looksLikeLeakedToolCallContent(responseContent) && !looksLikeOnboardingDrift(responseContent)) {
        return {
          content: responseContent,
          provider: 'cloud-gateway',
          model: modelOverride || selectedModel || model || 'cloud-model',
          raw: responsePayload,
        };
      }
    } catch {
      // Fall back to chat completions for gateways or bridges that do not yet
      // support the responses endpoint or fail to complete tool execution.
    }
  }

  let result = await requestChatCompletionAllowingModelOverride({
    baseUrl,
    headers,
    modelOverride,
    timeoutMs: input.timeoutMs,
    body: {
      model,
      user: input.sessionUser,
      temperature: 0.2,
      messages: baseMessages,
    },
  });

  if (looksLikeOnboardingDrift(result.content)) {
    result = await requestChatCompletionAllowingModelOverride({
      baseUrl,
      headers,
      modelOverride,
      timeoutMs: input.timeoutMs,
      body: {
        model,
        user: input.sessionUser,
        temperature: 0.1,
        messages: withAdditionalSystemInstruction(
          baseMessages,
          '直接回答用户当前问题。不要自我介绍，不要谈内部状态，不要说自己没名字、没个性、第一次聊天，也不要让用户给你起名。',
        ),
      },
    });
  }

  if (looksLikeOnboardingDrift(result.content)) {
    result = await requestChatCompletionAllowingModelOverride({
      baseUrl,
      headers,
      modelOverride,
      timeoutMs: input.timeoutMs,
      body: {
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
      },
    });
  }

  if (looksLikeLeakedToolCallContent(result.content)) {
    try {
      result = await requestChatCompletionAllowingModelOverride({
        baseUrl,
        headers,
        modelOverride,
        timeoutMs: input.timeoutMs,
        body: {
          model,
          user: input.sessionUser,
          temperature: 0.1,
          messages: withAdditionalSystemInstruction(baseMessages, buildNoToolLeakSystemPrompt()),
        },
      });
    } catch {
      // Keep the original answer if the corrective retry is rejected by the provider.
    }
  }

  if (looksLikeLeakedToolCallContent(result.content)) {
    try {
      result = await requestChatCompletionAllowingModelOverride({
        baseUrl,
        headers,
        modelOverride,
        timeoutMs: input.timeoutMs,
        body: {
          model,
          user: input.sessionUser,
          temperature: 0,
          messages: [
            {
              role: 'system',
              content: [
                buildNoToolLeakSystemPrompt(),
                '直接回答当前问题，不要先说“让我先查看”或“我先执行”。',
              ].join('\n'),
            },
            {
              role: 'user',
              content: input.prompt,
            },
          ],
        },
      });
    } catch {
      // Keep the original answer if the fallback retry is rejected by the provider.
    }
  }

  return {
    content: result.content,
    provider: 'cloud-gateway',
    model: modelOverride || selectedModel || model || 'cloud-model',
    raw: result.json,
  };
}
