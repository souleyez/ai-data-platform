import type { ParsedDocument } from './document-parser.js';
import { isOpenClawGatewayConfigured, runOpenClawChat } from './openclaw-adapter.js';
import type { ReportPlan } from './report-planner.js';
import type { ReportTemplateEnvelope } from './report-center.js';
import {
  buildOrderInventoryComposerPrompt,
  buildOrderInventoryComposerSystemPrompt,
} from './order-inventory-page-composer-prompts.js';
import {
  detectOrderInventoryRequestView,
  resolveOrderInventoryComposerAttemptModes,
  sanitizeOrderComposerText,
} from './order-inventory-page-composer-support.js';
import {
  isOrderInventoryEvidenceDocument,
  selectOrderInventoryEvidenceDocuments,
} from './order-inventory-page-composer-evidence.js';
import type { OrderInventoryPageComposerExecution } from './order-inventory-page-composer-types.js';

export type { OrderInventoryPageComposerExecution } from './order-inventory-page-composer-types.js';
export { resolveOrderInventoryComposerAttemptModes } from './order-inventory-page-composer-support.js';
export {
  isOrderInventoryEvidenceDocument,
  selectOrderInventoryEvidenceDocuments,
} from './order-inventory-page-composer-evidence.js';

export async function runOrderInventoryPageComposerDetailed(input: {
  requestText: string;
  reportPlan?: ReportPlan | null;
  envelope?: ReportTemplateEnvelope | null;
  documents: ParsedDocument[];
  sessionUser?: string;
}): Promise<OrderInventoryPageComposerExecution> {
  if (!isOpenClawGatewayConfigured()) {
    return {
      content: null,
      error: 'Cloud gateway is not configured',
      attemptMode: '',
      attemptedModes: [],
    };
  }

  if (!input.documents.length) {
    return {
      content: null,
      error: 'No order or inventory documents available for composer',
      attemptMode: '',
      attemptedModes: [],
    };
  }

  const systemPrompt = await buildOrderInventoryComposerSystemPrompt();
  const attemptedModes = [] as Array<'rich' | 'compact'>;
  let lastError = '';
  const attemptModes = resolveOrderInventoryComposerAttemptModes(detectOrderInventoryRequestView(input));

  for (const mode of attemptModes) {
    attemptedModes.push(mode);
    try {
      const result = await runOpenClawChat({
        prompt: buildOrderInventoryComposerPrompt(input, mode),
        systemPrompt,
        sessionUser: input.sessionUser,
      });
      if (sanitizeOrderComposerText(result.content, 120)) {
        return {
          content: result.content,
          error: '',
          attemptMode: mode,
          attemptedModes,
        };
      }
      lastError = `Composer returned empty content in ${mode} mode`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error || '');
    }
  }

  return {
    content: null,
    error: lastError || 'Composer returned empty content',
    attemptMode: '',
    attemptedModes,
  };
}

export async function runOrderInventoryPageComposer(input: {
  requestText: string;
  reportPlan?: ReportPlan | null;
  envelope?: ReportTemplateEnvelope | null;
  documents: ParsedDocument[];
  sessionUser?: string;
}) {
  const result = await runOrderInventoryPageComposerDetailed(input);
  return result.content;
}
