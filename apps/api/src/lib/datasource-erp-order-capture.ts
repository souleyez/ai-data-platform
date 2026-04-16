import type { DatasourceDefinition } from './datasource-definitions.js';
import type { ErpExecutionPlan } from './datasource-erp-connector.js';
import { isOpenClawGatewayConfigured, runOpenClawChat } from './openclaw-adapter.js';
import {
  buildErpOrderCapturePrompt,
  buildErpOrderCaptureSystemPrompt,
  normalizeCapturePlan,
} from './datasource-erp-order-capture-prompts.js';
import {
  buildErpOrderCaptureSummaryItems,
  buildFallbackErpOrderCapturePlan,
} from './datasource-erp-order-capture-support.js';
import type {
  ErpOrderCaptureProviderMode,
  ErpOrderCaptureResolution,
} from './datasource-erp-order-capture-types.js';

export type {
  ErpOrderCaptureMode,
  ErpOrderCapturePlan,
  ErpOrderCaptureProvider,
  ErpOrderCaptureProviderMode,
  ErpOrderCaptureResolution,
} from './datasource-erp-order-capture-types.js';

export {
  buildErpOrderCaptureSummaryItems,
  buildFallbackErpOrderCapturePlan,
} from './datasource-erp-order-capture-support.js';

export function resolveErpOrderCaptureProviderMode(
  value = process.env.ERP_ORDER_CAPTURE_PROVIDER || 'openclaw-skill',
): ErpOrderCaptureProviderMode {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'disabled') return 'disabled';
  if (normalized === 'openclaw-chat') return 'openclaw-chat';
  return 'openclaw-skill';
}

export async function runErpOrderCapturePlanner(input: {
  definition: DatasourceDefinition;
  executionPlan: ErpExecutionPlan;
  sessionUser?: string;
  mode?: ErpOrderCaptureProviderMode;
}): Promise<ErpOrderCaptureResolution> {
  const fallbackPlan = buildFallbackErpOrderCapturePlan(input.definition, input.executionPlan);
  const mode = input.mode || resolveErpOrderCaptureProviderMode();

  if (mode === 'disabled' || !isOpenClawGatewayConfigured()) {
    return {
      plan: fallbackPlan,
      provider: 'deterministic',
      model: 'deterministic',
      usedFallback: true,
    };
  }

  try {
    const systemPrompt = await buildErpOrderCaptureSystemPrompt(mode);
    const result = await runOpenClawChat({
      prompt: buildErpOrderCapturePrompt(input.definition, input.executionPlan, fallbackPlan),
      systemPrompt,
      sessionUser: input.sessionUser,
    });

    const parsed = normalizeCapturePlan(result.content, fallbackPlan);
    if (!parsed) {
      return {
        plan: fallbackPlan,
        provider: 'deterministic',
        model: 'deterministic',
        usedFallback: true,
      };
    }

    return {
      plan: parsed,
      provider: mode,
      model: result.model,
      usedFallback: false,
    };
  } catch {
    return {
      plan: fallbackPlan,
      provider: 'deterministic',
      model: 'deterministic',
      usedFallback: true,
    };
  }
}
