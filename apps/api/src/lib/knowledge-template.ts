import {
  buildSharedTemplateEnvelope,
  loadReportCenterState,
  type ReportGroup,
  type ReportTemplateEnvelope,
  type SharedReportTemplate,
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
  template: SharedReportTemplate;
  envelope: ReportTemplateEnvelope;
};

export type RequestedSharedTemplate = {
  templateKey: string;
  clarificationMessage: string;
};

function mapOutputKindToTemplateType(kind: KnowledgeOutputKind): SharedReportTemplate['type'] {
  if (kind === 'page') return 'static-page';
  if (kind === 'ppt') return 'ppt';
  if (kind === 'pdf') return 'document';
  return 'table';
}

function normalizeText(...parts: Array<string | undefined | null>) {
  return parts
    .map((part) => String(part || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');
}

function hasAnyKeyword(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function isResumeGroup(group: ReportGroup) {
  return hasAnyKeyword(normalizeText(group.key, group.label), ['resume', 'cv', '简历', '候选人']);
}

function isBidGroup(group: ReportGroup) {
  return hasAnyKeyword(normalizeText(group.key, group.label), ['bids', 'bid', 'tender', '标书', '招标', '投标']);
}

function isOrderGroup(group: ReportGroup) {
  return hasAnyKeyword(normalizeText(group.key, group.label), ['order', '订单', '销售', '电商', '库存']);
}

function isFormulaGroup(group: ReportGroup) {
  return hasAnyKeyword(normalizeText(group.key, group.label), ['formula', '配方', '奶粉']);
}

function isContractGroup(group: ReportGroup) {
  return hasAnyKeyword(normalizeText(group.key, group.label), ['contract', '合同']);
}

function templateText(template: SharedReportTemplate) {
  return normalizeText(
    template.key,
    template.label,
    template.description,
    ...(template.referenceImages || []).map((item) => item.originalName),
  );
}

function looksLikeResumeTemplate(template: SharedReportTemplate) {
  return hasAnyKeyword(templateText(template), ['resume', 'cv', '简历', '候选人']);
}

function looksLikeBidTemplate(template: SharedReportTemplate) {
  return hasAnyKeyword(templateText(template), ['bids', 'bid', 'tender', '标书', '招标', '投标']);
}

function looksLikeOrderTemplate(template: SharedReportTemplate) {
  return hasAnyKeyword(templateText(template), ['order', '订单', '销售', '电商', '库存']);
}

function looksLikeFormulaTemplate(template: SharedReportTemplate) {
  return hasAnyKeyword(templateText(template), ['formula', '配方', '奶粉']);
}

function looksLikeContractTemplate(template: SharedReportTemplate) {
  return hasAnyKeyword(templateText(template), ['contract', '合同', '风险']);
}

function buildTemplateEnvelopeInstruction(group: ReportGroup, template: SharedReportTemplate) {
  const envelope = buildSharedTemplateEnvelope(template);
  return [
    `Template: ${envelope.title}`,
    `Knowledge base: ${group.label}`,
    'Fixed structure:',
    ...envelope.fixedStructure.map((item, index) => `${index + 1}. ${item}`),
    'Variable zones:',
    ...envelope.variableZones.map((item, index) => `${index + 1}. ${item}`),
    `Output hint: ${envelope.outputHint}`,
  ].join('\n');
}

function scoreTemplateForGroup(template: SharedReportTemplate, group: ReportGroup, kind: KnowledgeOutputKind) {
  const preferredType = mapOutputKindToTemplateType(kind);
  let score = template.type === preferredType ? 100 : -100;

  if (template.isDefault) score += 25;
  score += Math.min((template.referenceImages || []).length, 5) * 3;

  if (isResumeGroup(group) && looksLikeResumeTemplate(template)) score += 120;
  if (isBidGroup(group) && looksLikeBidTemplate(template)) score += 120;
  if (isOrderGroup(group) && looksLikeOrderTemplate(template)) score += 120;
  if (isFormulaGroup(group) && looksLikeFormulaTemplate(template)) score += 120;
  if (isContractGroup(group) && looksLikeContractTemplate(template)) score += 120;

  return score;
}

export function selectSharedTemplateForGroup(
  templates: SharedReportTemplate[],
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

export async function buildKnowledgeTemplateInstruction(
  libraries: Array<{ key: string; label: string }>,
  kind: KnowledgeOutputKind,
  preferredTemplateKey?: string,
) {
  const selectedTemplates = await selectKnowledgeTemplates(libraries, kind, preferredTemplateKey);
  if (!selectedTemplates.length) return '';

  return [
    'Follow the matched knowledge-base template skeleton strictly. Do not change the fixed structure unless the evidence clearly requires it.',
    '',
    ...selectedTemplates.map(({ group, template }) => buildTemplateEnvelopeInstruction(group, template)),
  ].join('\n\n');
}

export async function selectKnowledgeTemplates(
  libraries: Array<{ key: string; label: string }>,
  kind: KnowledgeOutputKind,
  preferredTemplateKey?: string,
): Promise<SelectedKnowledgeTemplate[]> {
  if (!libraries.length) return [];

  const state = await loadReportCenterState();
  const libraryMap = new Map(libraries.map((item) => [item.key, item]));

  return state.groups
    .filter((group) => libraryMap.has(group.key))
    .map((group) => {
      const selected = selectSharedTemplateForGroup(state.templates, group, kind, preferredTemplateKey);
      if (!selected) return null;
      return {
        group,
        template: selected,
        envelope: buildSharedTemplateEnvelope(selected),
      };
    })
    .filter(Boolean) as SelectedKnowledgeTemplate[];
}

function normalizeTemplateText(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/[，。、“”"'‘’：:；;？！!（）()\[\]\-_/\\|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mentionsCustomTemplateIntent(text: string) {
  return /(自定义模板|我的模板|上传模板|参考模板|按模板|用模板|按照模板|按我上传的模板)/.test(text);
}

function matchesTemplateName(requestText: string, template: SharedReportTemplate) {
  const haystack = normalizeTemplateText(requestText);
  const candidates = [
    template.key,
    template.label,
    template.description,
    ...(template.referenceImages || []).map((item) => item.originalName),
  ]
    .map(normalizeTemplateText)
    .filter(Boolean);

  return candidates.some((candidate) => candidate.length >= 2 && haystack.includes(candidate));
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
  const message = candidateNames.length
    ? `如果要使用自定义模板，请明确指出模板名称，例如：${candidateNames.join('、')}。`
    : '如果要使用自定义模板，请先在报表中心上传模板，并在需求里明确指出模板名称。';

  return {
    templateKey: '',
    clarificationMessage: message,
  };
}

function looksLikeResumeCompanyProjectRequest(requestText: string) {
  const text = normalizeText(requestText);
  return (
    hasAnyKeyword(text, ['resume', 'cv', 'candidate', 'talent', '简历', '候选人', '人才'])
    && hasAnyKeyword(text, ['company', 'employer', '公司', '维度', '组织'])
    && hasAnyKeyword(text, ['project', 'it', 'system', 'platform', 'api', '项目', '系统', '平台', '接口', '实施', '开发', '技术'])
  );
}

export function adaptSelectedTemplatesForRequest(
  selectedTemplates: SelectedKnowledgeTemplate[],
  requestText: string,
) {
  if (!selectedTemplates.length) return selectedTemplates;

  return selectedTemplates.map((entry) => {
    if (
      entry.template.type === 'table'
      && looksLikeResumeCompanyProjectRequest(requestText)
      && isResumeGroup(entry.group)
    ) {
      return {
        ...entry,
        envelope: {
          ...entry.envelope,
          title: '简历 IT 项目公司维度表',
          fixedStructure: [
            '按公司维度汇总简历中涉及的 IT 项目信息。',
            '同一家公司可以聚合多位候选人的相关项目经历。',
            '优先保留项目名称、项目职责、技术栈或系统关键词、时间线和证据来源。',
          ],
          variableZones: [
            '公司名称',
            '候选人姓名',
            'IT 项目或系统名称',
            '项目角色与职责',
            '技术栈或系统关键词',
            '项目时间线',
            '证据来源',
          ],
          outputHint: '按公司维度整理简历中的 IT 项目信息，优先提取项目、系统、平台、接口、实施、开发等经历。',
          tableColumns: ['公司', '候选人', 'IT项目', '项目角色/职责', '技术栈/系统关键词', '时间线', '证据来源'],
        },
      };
    }

    return entry;
  });
}

export function buildTemplateContextBlock(selectedTemplates: SelectedKnowledgeTemplate[]) {
  if (!selectedTemplates.length) return '';

  return selectedTemplates
    .map(({ group, template, envelope }) => {
      const fixed = envelope.fixedStructure.map((item, index) => `${index + 1}. ${item}`).join('\n');
      const variable = envelope.variableZones.map((item, index) => `${index + 1}. ${item}`).join('\n');
      const columns = envelope.tableColumns?.length ? `Preferred columns: ${envelope.tableColumns.join(' | ')}` : '';
      const sections = envelope.pageSections?.length ? `Preferred sections: ${envelope.pageSections.join(' | ')}` : '';
      const referenceSummary = Array.isArray(template.referenceImages) && template.referenceImages.length
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
        referenceSummary,
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
      ...(Array.isArray(template.referenceImages) ? template.referenceImages.map((item) => item.originalName) : []),
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

  if (isResumeGroup(primary.group)) return 'resume-comparison';
  if (isBidGroup(primary.group)) return kind === 'page' ? 'bids-static-page' : 'bids-table';
  if (isOrderGroup(primary.group)) return 'order-static-page';
  if (isFormulaGroup(primary.group)) return kind === 'page' ? 'formula-static-page' : 'formula-table';
  if (isContractGroup(primary.group)) return 'contract-risk';
  return 'general';
}
