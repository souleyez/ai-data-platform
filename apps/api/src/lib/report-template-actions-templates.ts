import type { ReportTemplateActionDeps } from './report-template-actions.js';
import type {
  ReportReferenceSourceType,
  ReportTemplateType,
  SharedReportTemplate,
} from './report-center.js';
import { findTemplateOrThrow } from './report-template-actions-support.js';

export async function createSharedReportTemplateWithDeps(
  input: {
    label: string;
    type?: ReportTemplateType;
    sourceType?: ReportReferenceSourceType;
    description?: string;
    preferredLayoutVariant?: SharedReportTemplate['preferredLayoutVariant'];
    isDefault?: boolean;
  },
  deps: ReportTemplateActionDeps,
) {
  const state = await deps.loadState();
  const label = String(input.label || '').trim();
  const type = input.type || deps.inferReportTemplateTypeFromSource({ sourceType: input.sourceType });
  if (!label) throw new Error('template label is required');
  if (!['table', 'static-page', 'ppt', 'document'].includes(type)) {
    throw new Error('template type is invalid');
  }

  const description = String(input.description || '').trim() || `${label} 模板`;
  const template: SharedReportTemplate = {
    key: deps.buildId('template'),
    label,
    type,
    description,
    preferredLayoutVariant: type === 'static-page'
      ? (
        input.preferredLayoutVariant
        || deps.inferTemplatePreferredLayoutVariant({ label, type, description })
      )
      : undefined,
    supported: true,
    isDefault: Boolean(input.isDefault),
    origin: 'user',
    createdAt: new Date().toISOString(),
    referenceImages: [],
  };

  const nextTemplates = state.templates.map((item) => (
    item.type === type && template.isDefault ? { ...item, isDefault: false } : item
  ));
  nextTemplates.push(template);
  await deps.saveGroupsAndOutputs(state.groups, state.outputs, nextTemplates);
  return template;
}

export async function updateSharedReportTemplateWithDeps(
  templateKey: string,
  patch: {
    label?: string;
    description?: string;
    preferredLayoutVariant?: SharedReportTemplate['preferredLayoutVariant'];
    isDefault?: boolean;
  },
  deps: ReportTemplateActionDeps,
) {
  const state = await deps.loadState();
  const template = findTemplateOrThrow(state.templates, templateKey);

  const nextTemplates = state.templates.map((item) => {
    if (item.key === templateKey) {
      return {
        ...item,
        label: patch.label ? String(patch.label).trim() || item.label : item.label,
        description: patch.description !== undefined ? String(patch.description).trim() || item.description : item.description,
        preferredLayoutVariant:
          item.type === 'static-page' && patch.preferredLayoutVariant !== undefined
            ? patch.preferredLayoutVariant
            : item.preferredLayoutVariant,
        isDefault: patch.isDefault !== undefined ? Boolean(patch.isDefault) : item.isDefault,
      };
    }
    if (patch.isDefault && item.type === template.type) {
      return { ...item, isDefault: false };
    }
    return item;
  });

  await deps.saveGroupsAndOutputs(state.groups, state.outputs, nextTemplates);
  return nextTemplates.find((item) => item.key === templateKey)!;
}

export async function deleteSharedReportTemplateWithDeps(
  templateKey: string,
  deps: ReportTemplateActionDeps,
) {
  const state = await deps.loadState();
  const template = findTemplateOrThrow(state.templates, templateKey);
  if (!deps.isUserSharedReportTemplate(template)) throw new Error('system template cannot be deleted');

  for (const reference of template.referenceImages || []) {
    await deps.deleteStoredReferenceFile(reference);
  }

  const nextTemplates = state.templates
    .filter((item) => item.key !== templateKey)
    .map((item) => ({ ...item }));

  if (template.isDefault) {
    const sameType = nextTemplates.filter((item) => item.type === template.type);
    if (sameType.length && !sameType.some((item) => item.isDefault)) {
      sameType[0].isDefault = true;
    }
  }

  await deps.saveGroupsAndOutputs(state.groups, state.outputs, nextTemplates);
  return template;
}
