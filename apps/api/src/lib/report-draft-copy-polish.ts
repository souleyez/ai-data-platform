import type { ReportDraftModule } from './report-center.js';
import {
  buildPlaceholderContentDraft,
  buildReadableModuleCopy,
  buildScenarioModuleTitle,
  normalizeText,
  polishMetricGridCards,
} from './report-draft-copy-polish-support.js';
import type { DraftPolishContext } from './report-draft-copy-polish-types.js';

export { normalizeText } from './report-draft-copy-polish-support.js';
export type { DraftPolishContext } from './report-draft-copy-polish-types.js';

export function polishDraftModules(modules: ReportDraftModule[], context: DraftPolishContext) {
  return modules.map((module) => {
    const normalizedEvidenceRefs = Array.isArray(module.evidenceRefs)
      ? module.evidenceRefs.map((item) => normalizeText(item)).filter(Boolean)
      : [];
    const contentDraft = normalizedEvidenceRefs.includes('composer:placeholder')
      ? buildPlaceholderContentDraft(module.moduleType, module.title, context.summary, context)
      : buildReadableModuleCopy(module, context);
    return {
      ...module,
      contentDraft,
      purpose: normalizeText(module.purpose),
      evidenceRefs: normalizedEvidenceRefs,
      title: buildScenarioModuleTitle(context.layoutVariant, module.moduleType, module.title),
      cards:
        module.moduleType === 'metric-grid'
          ? polishMetricGridCards(module.cards || [], context.layoutVariant)
          : module.cards,
    };
  });
}
