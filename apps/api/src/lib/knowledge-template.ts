import {
  buildSharedTemplateEnvelope,
  loadReportCenterState,
  type ReportGroup,
} from './report-center.js';
import {
  adaptSelectedTemplatesForRequest,
  buildKnowledgeTemplateInstructionFromSelection,
  buildTemplateCatalogContextBlock,
  buildTemplateCatalogSearchHints,
  buildTemplateContextBlock,
  buildTemplateSearchHints,
  listKnowledgeTemplateCatalogOptions,
} from './knowledge-template-catalog.js';
import {
  inferKnowledgeTemplateTaskHintFromLibraries as inferKnowledgeTemplateTaskHintFromLibrariesByLibrary,
  inferTemplateTaskHintForGroup,
  mapOutputKindToTemplateType,
  matchesTemplateName,
  mentionsCustomTemplateIntent,
  scoreTemplateForGroup,
} from './knowledge-template-heuristics.js';
import type {
  KnowledgeOutputKind,
  KnowledgeTemplateCatalogOption,
  KnowledgeTemplateTaskHint,
  RequestedSharedTemplate,
  SelectedKnowledgeTemplate,
} from './knowledge-template-types.js';

export type {
  KnowledgeOutputKind,
  KnowledgeTemplateCatalogOption,
  KnowledgeTemplateTaskHint,
  RequestedSharedTemplate,
  SelectedKnowledgeTemplate,
} from './knowledge-template-types.js';

export function selectSharedTemplateForGroup(
  templates: Awaited<ReturnType<typeof loadReportCenterState>>['templates'],
  group: ReportGroup,
  kind: KnowledgeOutputKind,
  preferredTemplateKey?: string,
) {
  if (!templates.length) return null;

  const preferredType = mapOutputKindToTemplateType(kind);
  const explicit = preferredTemplateKey
    ? templates.find((item) => item.key === preferredTemplateKey && item.type === preferredType)
    : null;
  if (explicit) return explicit;

  const candidates = templates.filter((item) => item.type === preferredType);
  const pool = candidates.length ? candidates : templates;

  return [...pool]
    .sort((left, right) => scoreTemplateForGroup(right, group, kind) - scoreTemplateForGroup(left, group, kind))[0] || null;
}

export async function selectKnowledgeTemplates(
  libraries: Array<{ key: string; label: string }>,
  kind: KnowledgeOutputKind,
  preferredTemplateKey?: string,
): Promise<SelectedKnowledgeTemplate[]> {
  if (!libraries.length) return [];

  const state = await loadReportCenterState();
  const librarySet = new Set(libraries.flatMap((item) => [item.key, item.label]).filter(Boolean));

  return state.groups
    .filter((group) => librarySet.has(group.key) || librarySet.has(group.label))
    .map((group) => {
      const template = selectSharedTemplateForGroup(state.templates, group, kind, preferredTemplateKey);
      if (!template) return null;
      return {
        group,
        template,
        envelope: buildSharedTemplateEnvelope(template),
      };
    })
    .filter(Boolean) as SelectedKnowledgeTemplate[];
}

export async function buildKnowledgeTemplateInstruction(
  libraries: Array<{ key: string; label: string }>,
  kind: KnowledgeOutputKind,
  preferredTemplateKey?: string,
) {
  const selectedTemplates = await selectKnowledgeTemplates(libraries, kind, preferredTemplateKey);
  return buildKnowledgeTemplateInstructionFromSelection(selectedTemplates);
}

export {
  adaptSelectedTemplatesForRequest,
  buildTemplateCatalogContextBlock,
  buildTemplateCatalogSearchHints,
  buildTemplateContextBlock,
  buildTemplateSearchHints,
  listKnowledgeTemplateCatalogOptions,
};

export function inferKnowledgeTemplateTaskHintFromLibraries(
  libraries: Array<{ key?: string; label?: string }>,
  kind: KnowledgeOutputKind,
): KnowledgeTemplateTaskHint {
  return inferKnowledgeTemplateTaskHintFromLibrariesByLibrary(libraries, kind);
}

export function shouldUseConceptPageMode(
  kind: KnowledgeOutputKind,
  preferredTemplateKey?: string,
) {
  return kind === 'page' && !String(preferredTemplateKey || '').trim();
}

export async function resolveRequestedSharedTemplate(
  requestText: string,
  kind: KnowledgeOutputKind,
): Promise<RequestedSharedTemplate | null> {
  const state = await loadReportCenterState();
  const preferredType = mapOutputKindToTemplateType(kind);
  const typeTemplates = state.templates.filter((item) => item.type === preferredType);
  const explicit = typeTemplates.find((item) => matchesTemplateName(requestText, item));

  if (explicit) {
    return {
      templateKey: explicit.key,
      clarificationMessage: '',
    };
  }

  if (!mentionsCustomTemplateIntent(requestText)) return null;

  const customTemplates = typeTemplates.filter((item) => !item.isDefault);
  const candidateNames = customTemplates.map((item) => item.label).filter(Boolean).slice(0, 6);
  const clarificationMessage = candidateNames.length
    ? `如果要使用自定义模板，必须精确指定模板全名，例如：${candidateNames.join('、')}。`
    : '如果要使用自定义模板，请先在报表中心上传模板，并在需求中精确指定模板全名。';

  return {
    templateKey: '',
    clarificationMessage,
  };
}

export function inferTemplateTaskHint(
  selectedTemplates: SelectedKnowledgeTemplate[],
  kind: KnowledgeOutputKind,
): KnowledgeTemplateTaskHint {
  const primary = selectedTemplates[0];
  return inferTemplateTaskHintForGroup(primary?.group, kind);
}
