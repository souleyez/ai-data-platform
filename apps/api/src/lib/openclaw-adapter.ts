import {
  ensureNativeSearchPreferredConfig,
  getActiveOpenClawModel,
} from './model-config.js';
import {
  buildGatewayRequestModel,
  getConfiguredOpenClawGatewayToken,
  getOpenClawAgentId,
  getOpenClawGatewayBaseUrl,
  hasUsableGatewayToken,
  isOpenClawGatewayConfigured,
  isOpenClawGatewayReachable,
  resolveGatewayToken,
  resolveOpenClawModelOverride,
} from './openclaw-adapter-runtime.js';
import {
  buildMessages,
  buildNoToolLeakSystemPrompt,
  buildResponsesInput,
  buildResponsesInstructions,
  extractResponseOutputText,
  looksLikeLeakedToolCallContent,
  looksLikeOnboardingDrift,
  withAdditionalSystemInstruction,
} from './openclaw-adapter-prompts.js';
import {
  isOpenClawModelOverrideDeniedError,
  isRetryableCloudGatewayError,
  requestChatCompletionAllowingModelOverride,
  requestOpenResponses,
} from './openclaw-adapter-requests.js';
import type { OpenClawChatRequest, OpenClawChatResult } from './openclaw-adapter-types.js';

export type { OpenClawChatRequest, OpenClawChatResult } from './openclaw-adapter-types.js';
export {
  buildGatewayRequestModel,
  isOpenClawGatewayConfigured,
  isOpenClawGatewayReachable,
  resolveOpenClawModelOverride,
} from './openclaw-adapter-runtime.js';
export { looksLikeLeakedToolCallContent } from './openclaw-adapter-prompts.js';
export {
  isOpenClawModelOverrideDeniedError,
  isRetryableCloudGatewayError,
} from './openclaw-adapter-requests.js';

async function resolveGatewayHeaders(params: {
  baseUrl: string;
  configuredToken?: string;
  agentId?: string;
  modelOverride?: string;
}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const authToken = await resolveGatewayToken(params.baseUrl, params.configuredToken);
  if (hasUsableGatewayToken(authToken)) headers.Authorization = `Bearer ${authToken}`;
  if (params.agentId) headers['x-openclaw-agent-id'] = params.agentId;
  if (params.modelOverride) headers['x-openclaw-model'] = params.modelOverride;
  return headers;
}

export async function tryRunOpenClawNativeWebSearchChat(input: OpenClawChatRequest): Promise<OpenClawChatResult | null> {
  const baseUrl = getOpenClawGatewayBaseUrl();
  const token = getConfiguredOpenClawGatewayToken();
  const agentId = getOpenClawAgentId();
  const selectedModel = await getActiveOpenClawModel();
  const model = buildGatewayRequestModel(agentId);
  const modelOverride = resolveOpenClawModelOverride(input.modelOverride);

  if (!baseUrl || !isOpenClawGatewayConfigured()) {
    return null;
  }

  try {
    await ensureNativeSearchPreferredConfig();
  } catch {
    // Keep going; the request itself can still fail over to project-side search.
  }

  const headers = await resolveGatewayHeaders({
    baseUrl,
    configuredToken: token,
    agentId,
    modelOverride,
  });

  try {
    const json = await requestOpenResponses(
      baseUrl,
      headers,
      {
        model,
        user: input.sessionUser,
        input: buildResponsesInput(input),
        instructions: buildResponsesInstructions(input, true),
        temperature: 0.1,
        reasoning: {
          effort: 'medium',
          summary: 'auto',
        },
      },
      input.timeoutMs,
    );
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

export async function runOpenClawChat(input: OpenClawChatRequest): Promise<OpenClawChatResult> {
  const baseUrl = getOpenClawGatewayBaseUrl();
  const token = getConfiguredOpenClawGatewayToken();
  const agentId = getOpenClawAgentId();
  const selectedModel = await getActiveOpenClawModel();
  const model = buildGatewayRequestModel(agentId);
  const modelOverride = resolveOpenClawModelOverride(input.modelOverride);

  if (!baseUrl || !isOpenClawGatewayConfigured()) {
    throw new Error('Cloud gateway is not configured');
  }

  try {
    await ensureNativeSearchPreferredConfig();
  } catch {
    // Keep chat available even if config normalization fails.
  }

  const headers = await resolveGatewayHeaders({
    baseUrl,
    configuredToken: token,
    agentId,
    modelOverride,
  });
  const baseMessages = buildMessages(input);

  if (input.preferResponses) {
    try {
      const responsePayload = await requestOpenResponses(
        baseUrl,
        headers,
        {
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
        input.timeoutMs,
      );
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
