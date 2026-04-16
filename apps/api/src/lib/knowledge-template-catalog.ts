import {
  buildSharedTemplateEnvelope,
  type ReportGroup,
  type ReportTemplateEnvelope,
  loadReportCenterState,
  type SharedReportTemplate,
} from './report-center.js';
import { adaptTemplateEnvelopeForRequest } from './report-template-adapter.js';
import {
  mapOutputKindToTemplateType,
  scoreTemplateForGroup,
} from './knowledge-template-heuristics.js';
import type {
  KnowledgeOutputKind,
  KnowledgeTemplateCatalogOption,
  SelectedKnowledgeTemplate,
} from './knowledge-template-types.js';

function buildTemplateCatalogOption(
  group: ReportGroup,
  template: SharedReportTemplate,
  kind: KnowledgeOutputKind,
  preferredTemplateKey?: string,
): KnowledgeTemplateCatalogOption {
  const envelope = buildSharedTemplateEnvelope(template);
  let score = scoreTemplateForGroup(template, group, kind);
  if (preferredTemplateKey && template.key === preferredTemplateKey) score += 300;
  if (template.origin === 'user') score += 8;
  if (template.supported) score += 6;

  return {
    groupKey: group.key,
    groupLabel: group.label,
    templateKey: template.key,
    templateLabel: template.label,
    templateType: template.type,
    description: String(template.description || '').trim(),
    origin: String(template.origin || 'system').trim() || 'system',
    isDefault: Boolean(template.isDefault),
    outputHint: String(envelope.outputHint || '').trim(),
    fixedStructure: [...(envelope.fixedStructure || [])],
    variableZones: [...(envelope.variableZones || [])],
    pageSections: [...(envelope.pageSections || [])],
    tableColumns: [...(envelope.tableColumns || [])],
    referenceNames: (template.referenceImages || [])
      .map((item) => String(item.originalName || '').trim())
      .filter(Boolean)
      .slice(0, 6),
    score,
  };
}

function buildTemplateEnvelopeInstruction(group: ReportGroup, template: SharedReportTemplate) {
  const envelope = buildSharedTemplateEnvelope(template);
  return [
    `Template: ${envelope.title}`,
    `Knowledge base: ${group.label}`,
    'Fixed structure:',
    ...envelope.fixedStructure.map((item: string, index: number) => `${index + 1}. ${item}`),
    'Variable zones:',
    ...envelope.variableZones.map((item: string, index: number) => `${index + 1}. ${item}`),
    `Output hint: ${envelope.outputHint}`,
  ].join('\n');
}

export async function buildKnowledgeTemplateInstructionFromSelection(
  selectedTemplates: SelectedKnowledgeTemplate[],
) {
  if (!selectedTemplates.length) return '';

  return [
    'Follow the matched knowledge-base template skeleton strictly.',
    'Keep the fixed structure stable and only vary the explicitly allowed variable zones.',
    '',
    ...selectedTemplates.map(({ group, template }) => buildTemplateEnvelopeInstruction(group, template)),
  ].join('\n\n');
}

export async function listKnowledgeTemplateCatalogOptions(
  libraries: Array<{ key: string; label: string }>,
  kind: KnowledgeOutputKind,
  preferredTemplateKey?: string,
): Promise<KnowledgeTemplateCatalogOption[]> {
  const state = await loadReportCenterState();
  const librarySet = new Set(libraries.flatMap((item) => [item.key, item.label]).filter(Boolean));
  const preferredType = mapOutputKindToTemplateType(kind);
  const matchedGroups = state.groups.filter((group) => librarySet.has(group.key) || librarySet.has(group.label));
  const optionsById = new Map<string, KnowledgeTemplateCatalogOption>();

  for (const group of matchedGroups) {
    for (const templateRef of group.templates) {
      const template = state.templates.find((item) => item.key === templateRef.key);
      if (!template || !template.supported || template.type !== preferredType) continue;
      const option = buildTemplateCatalogOption(group, template, kind, preferredTemplateKey);
      const id = `${group.key}::${template.key}`;
      const existing = optionsById.get(id);
      if (!existing || option.score > existing.score) optionsById.set(id, option);
    }
  }

  if (preferredTemplateKey && ![...optionsById.values()].some((item) => item.templateKey === preferredTemplateKey)) {
    const explicitTemplate = state.templates.find((item) => item.key === preferredTemplateKey && item.type === preferredType);
    if (explicitTemplate) {
      const ownerGroups = state.groups.filter((group) => group.templates.some((item) => item.key === explicitTemplate.key));
      for (const group of ownerGroups) {
        const option = buildTemplateCatalogOption(group, explicitTemplate, kind, preferredTemplateKey);
        optionsById.set(`${group.key}::${explicitTemplate.key}`, option);
      }
    }
  }

  return [...optionsById.values()]
    .sort((left, right) => (
      right.score - left.score
      || Number(right.isDefault) - Number(left.isDefault)
      || left.groupLabel.localeCompare(right.groupLabel, 'zh-CN')
      || left.templateLabel.localeCompare(right.templateLabel, 'zh-CN')
    ))
    .slice(0, 12);
}

export function buildTemplateCatalogContextBlock(
  options: KnowledgeTemplateCatalogOption[],
  explicitTemplateKey?: string,
) {
  if (!options.length) return '';

  return [
    'Optional template catalog for the current knowledge libraries:',
    explicitTemplateKey
      ? `The user explicitly mentioned template key: ${explicitTemplateKey}. Use it only if it still fits the evidence and output type.`
      : 'No template is forced. Choose one only when it clearly improves the output; otherwise answer directly from library evidence.',
    'Reusable page, table, and document outputs may also be published into the local report center for preview, revision, and reopening.',
    ...options.map((option, index) => {
      const sections = option.pageSections.length ? `Page sections: ${option.pageSections.join(' | ')}` : '';
      const columns = option.tableColumns.length ? `Table columns: ${option.tableColumns.join(' | ')}` : '';
      const references = option.referenceNames.length ? `Reference files: ${option.referenceNames.join(' | ')}` : '';
      const fixed = option.fixedStructure.length ? `Fixed structure: ${option.fixedStructure.join(' | ')}` : '';
      const variable = option.variableZones.length ? `Variable zones: ${option.variableZones.join(' | ')}` : '';
      return [
        `${index + 1}. Library: ${option.groupLabel}`,
        `Template key: ${option.templateKey}`,
        `Template label: ${option.templateLabel}`,
        `Template type: ${option.templateType}`,
        `Origin: ${option.origin}${option.isDefault ? ' | default' : ''}`,
        `Description: ${option.description || '-'}`,
        sections,
        columns,
        fixed,
        variable,
        option.outputHint ? `Output hint: ${option.outputHint}` : '',
        references,
      ]
        .filter(Boolean)
        .join('\n');
    }),
  ].join('\n\n');
}

export function buildTemplateCatalogSearchHints(options: KnowledgeTemplateCatalogOption[]) {
  return [...new Set(
    options.flatMap((option) => [
      option.groupKey,
      option.groupLabel,
      option.templateKey,
      option.templateLabel,
      option.description,
      option.outputHint,
      ...option.pageSections,
      ...option.tableColumns,
      ...option.fixedStructure,
      ...option.variableZones,
      ...option.referenceNames,
    ]),
  )]
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

export function buildTemplateContextBlock(selectedTemplates: SelectedKnowledgeTemplate[]) {
  if (!selectedTemplates.length) return '';

  return selectedTemplates
    .map(({ group, template, envelope }) => {
      const fixed = envelope.fixedStructure.map((item, index) => `${index + 1}. ${item}`).join('\n');
      const variable = envelope.variableZones.map((item, index) => `${index + 1}. ${item}`).join('\n');
      const columns = envelope.tableColumns?.length ? `Preferred columns: ${envelope.tableColumns.join(' | ')}` : '';
      const sections = envelope.pageSections?.length ? `Preferred sections: ${envelope.pageSections.join(' | ')}` : '';
      const references = Array.isArray(template.referenceImages) && template.referenceImages.length
        ? `Reference files: ${template.referenceImages.map((item) => item.originalName).slice(0, 6).join(' | ')}`
        : '';

      return [
        `Knowledge base: ${group.label}`,
        `Template key: ${template.key}`,
        `Template type: ${template.type}`,
        `Template title: ${envelope.title}`,
        `Template description: ${template.description}`,
        columns,
        sections,
        references,
        'Fixed structure:',
        fixed,
        'Variable zones:',
        variable,
        `Output hint: ${envelope.outputHint}`,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');
}

function collectEnvelopeTerms(envelope: ReportTemplateEnvelope) {
  return [
    ...(envelope.tableColumns || []),
    ...(envelope.pageSections || []),
    ...envelope.fixedStructure,
    ...envelope.variableZones,
    envelope.outputHint,
    envelope.title,
  ]
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

export function buildTemplateSearchHints(selectedTemplates: SelectedKnowledgeTemplate[]) {
  return [...new Set(
    selectedTemplates.flatMap(({ group, template, envelope }) => [
      group.key,
      group.label,
      template.key,
      template.label,
      template.description,
      ...(template.referenceImages || []).map((item) => item.originalName),
      ...collectEnvelopeTerms(envelope),
    ]),
  )];
}

export function adaptSelectedTemplatesForRequest(
  selectedTemplates: SelectedKnowledgeTemplate[],
  requestText: string,
) {
  if (!selectedTemplates.length) return selectedTemplates;

  const normalizedRequest = String(requestText || '').trim();
  return selectedTemplates.map((entry) => {
    const kind = entry.template.type === 'static-page'
      ? 'page'
      : entry.template.type === 'ppt'
        ? 'ppt'
        : entry.template.type === 'document'
          ? 'pdf'
          : 'table';

    return {
      ...entry,
      envelope: adaptTemplateEnvelopeForRequest(entry.group, entry.envelope, kind, normalizedRequest),
    };
  });
}
