import {
  buildTemplateEnvelope,
  loadReportCenterState,
  type ReportGroup,
  type ReportGroupTemplate,
  type ReportTemplateEnvelope,
} from './report-center.js';

export type KnowledgeOutputKind = 'table' | 'page' | 'pdf' | 'ppt';
export type KnowledgeTemplateTaskHint =
  | 'general'
  | 'resume-comparison'
  | 'formula-table'
  | 'formula-static-page'
  | 'bids-table'
  | 'bids-static-page'
  | 'order-static-page'
  | 'contract-risk';

export type SelectedKnowledgeTemplate = {
  group: ReportGroup;
  template: ReportGroupTemplate;
  envelope: ReportTemplateEnvelope;
};

function mapOutputKindToTemplateType(kind: KnowledgeOutputKind): ReportGroupTemplate['type'] {
  if (kind === 'page') return 'static-page';
  if (kind === 'pdf' || kind === 'ppt') return 'ppt';
  return 'table';
}

function buildTemplateEnvelopeInstruction(group: ReportGroup, template: ReportGroupTemplate) {
  const envelope = buildTemplateEnvelope(group, template);
  return [
    `Template: ${envelope.title}`,
    'Fixed structure:',
    ...envelope.fixedStructure.map((item, index) => `${index + 1}. ${item}`),
    'Variable zones:',
    ...envelope.variableZones.map((item, index) => `${index + 1}. ${item}`),
    `Output hint: ${envelope.outputHint}`,
  ].join('\n');
}

export async function buildKnowledgeTemplateInstruction(
  libraries: Array<{ key: string; label: string }>,
  kind: KnowledgeOutputKind,
) {
  if (!libraries.length) return '';

  const state = await loadReportCenterState();
  const preferredType = mapOutputKindToTemplateType(kind);
  const libraryMap = new Map(libraries.map((item) => [item.key, item]));

  const instructions = state.groups
    .filter((group) => libraryMap.has(group.key))
    .map((group) => {
      const template =
        group.templates.find((item) => item.type === preferredType)
        || group.templates.find((item) => item.key === group.defaultTemplateKey)
        || group.templates[0];
      if (!template) return '';
      return buildTemplateEnvelopeInstruction(group, template);
    })
    .filter(Boolean);

  if (!instructions.length) return '';
  return `Follow the matched knowledge-base template skeleton strictly. Do not change the fixed structure unless the evidence clearly requires it.\n\n${instructions.join('\n\n')}`;
}

export async function selectKnowledgeTemplates(
  libraries: Array<{ key: string; label: string }>,
  kind: KnowledgeOutputKind,
): Promise<SelectedKnowledgeTemplate[]> {
  if (!libraries.length) return [];

  const state = await loadReportCenterState();
  const preferredType = mapOutputKindToTemplateType(kind);
  const libraryMap = new Map(libraries.map((item) => [item.key, item]));

  return state.groups
    .filter((group) => libraryMap.has(group.key))
    .map((group) => {
      const template =
        group.templates.find((item) => item.type === preferredType)
        || group.templates.find((item) => item.key === group.defaultTemplateKey)
        || group.templates[0];
      if (!template) return null;
      return {
        group,
        template,
        envelope: buildTemplateEnvelope(group, template),
      };
    })
    .filter(Boolean) as SelectedKnowledgeTemplate[];
}

export function buildTemplateContextBlock(selectedTemplates: SelectedKnowledgeTemplate[]) {
  if (!selectedTemplates.length) return '';

  return selectedTemplates
    .map(({ group, template, envelope }) => {
      const fixed = envelope.fixedStructure.map((item, index) => `${index + 1}. ${item}`).join('\n');
      const variable = envelope.variableZones.map((item, index) => `${index + 1}. ${item}`).join('\n');
      const columns = envelope.tableColumns?.length ? `Preferred columns: ${envelope.tableColumns.join(' | ')}` : '';
      const sections = envelope.pageSections?.length ? `Preferred sections: ${envelope.pageSections.join(' | ')}` : '';

      return [
        `Knowledge base: ${group.label}`,
        `Template key: ${template.key}`,
        `Template type: ${template.type}`,
        `Template title: ${envelope.title}`,
        columns,
        sections,
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
      ...collectEnvelopeTerms(envelope),
    ]),
  )];
}

export function inferTemplateTaskHint(
  selectedTemplates: SelectedKnowledgeTemplate[],
  kind: KnowledgeOutputKind,
): KnowledgeTemplateTaskHint {
  const primary = selectedTemplates[0];
  if (!primary) return 'general';

  const groupKey = String(primary.group.key || '').toLowerCase();
  const groupLabel = String(primary.group.label || '').toLowerCase();
  const templateKey = String(primary.template.key || '').toLowerCase();

  if (groupKey.includes('resume') || groupLabel.includes('简历') || groupLabel.includes('resume')) {
    return 'resume-comparison';
  }
  if (groupKey.includes('bids') || groupKey.includes('bid') || groupKey.includes('tender') || /(标书|招标|投标)/.test(groupLabel)) {
    return kind === 'page' ? 'bids-static-page' : 'bids-table';
  }
  if (groupKey.includes('order') || /(订单|销售|电商|库存)/.test(groupLabel)) {
    return 'order-static-page';
  }
  if (groupKey.includes('formula') || /(配方|奶粉|formula)/.test(groupLabel)) {
    return kind === 'page' ? 'formula-static-page' : 'formula-table';
  }
  if (groupKey.includes('contract') || /(合同|contract)/.test(groupLabel)) {
    return 'contract-risk';
  }
  if (templateKey.includes('static-page') && (groupKey.includes('bids') || groupKey.includes('order'))) {
    return groupKey.includes('bids') ? 'bids-static-page' : 'order-static-page';
  }
  return 'general';
}
