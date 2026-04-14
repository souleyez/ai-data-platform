import { ensureAllowedOpenClawModel } from './model-config.js';
import {
  getGatewayRetryCount,
  getGatewayRetryDelayMs,
  resolveGatewayTimeoutMs,
  resolveOpenClawModelOverride,
} from './openclaw-adapter-runtime.js';
import { sanitizeModelContent } from './openclaw-adapter-prompts.js';
import type { OpenClawResponsesPayload } from './openclaw-adapter-types.js';

type ChatCompletionPayload = {
  choices?: Array<{ message?: { content?: string } }>;
};

export async function requestChatCompletion(
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

    const json = (await response.json()) as ChatCompletionPayload;
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

export async function requestOpenResponses(
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
    || message.includes('\"type\":\"server_error\"')
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

export async function requestOpenResponsesAllowingModelOverride(params: {
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

export async function requestChatCompletionAllowingModelOverride(params: {
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
