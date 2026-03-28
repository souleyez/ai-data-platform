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

type ResumeRequestView = 'generic' | 'company' | 'project' | 'talent' | 'skill';

const RESUME_KEYWORDS = ['resume', 'cv', '简历', '候选人', '人才'];
const BID_KEYWORDS = ['bids', 'bid', 'tender', 'rfp', 'proposal', '标书', '招标', '投标'];
const ORDER_KEYWORDS = ['order', 'orders', '订单', '销量', '销售', '库存', '备货', '电商'];
const FORMULA_KEYWORDS = ['formula', '配方', '奶粉', '菌株', '益生菌'];
const CONTRACT_KEYWORDS = ['contract', 'contracts', '合同', '条款', '法务'];

function normalizeText(...parts: Array<string | undefined | null>) {
  return parts
    .map((part) => String(part || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');
}

function normalizeTemplateNameText(value: string) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasAnyKeyword(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function mapOutputKindToTemplateType(kind: KnowledgeOutputKind): SharedReportTemplate['type'] {
  if (kind === 'page') return 'static-page';
  if (kind === 'ppt') return 'ppt';
  if (kind === 'pdf') return 'document';
  return 'table';
}

function buildGroupText(group: ReportGroup) {
  return normalizeText(group.key, group.label, group.description, ...(group.triggerKeywords || []));
}

function buildTemplateText(template: SharedReportTemplate) {
  return normalizeText(
    template.key,
    template.label,
    template.description,
    ...(template.referenceImages || []).map((item) => item.originalName),
  );
}

function isResumeGroup(group: ReportGroup) {
  return hasAnyKeyword(buildGroupText(group), RESUME_KEYWORDS);
}

function isBidGroup(group: ReportGroup) {
  return hasAnyKeyword(buildGroupText(group), BID_KEYWORDS);
}

function isOrderGroup(group: ReportGroup) {
  return hasAnyKeyword(buildGroupText(group), ORDER_KEYWORDS);
}

function isFormulaGroup(group: ReportGroup) {
  return hasAnyKeyword(buildGroupText(group), FORMULA_KEYWORDS);
}

function isContractGroup(group: ReportGroup) {
  return hasAnyKeyword(buildGroupText(group), CONTRACT_KEYWORDS);
}

function looksLikeResumeTemplate(template: SharedReportTemplate) {
  return hasAnyKeyword(buildTemplateText(template), RESUME_KEYWORDS);
}

function looksLikeBidTemplate(template: SharedReportTemplate) {
  return hasAnyKeyword(buildTemplateText(template), BID_KEYWORDS);
}

function looksLikeOrderTemplate(template: SharedReportTemplate) {
  return hasAnyKeyword(buildTemplateText(template), ORDER_KEYWORDS);
}

function looksLikeFormulaTemplate(template: SharedReportTemplate) {
  return hasAnyKeyword(buildTemplateText(template), FORMULA_KEYWORDS);
}

function looksLikeContractTemplate(template: SharedReportTemplate) {
  return hasAnyKeyword(buildTemplateText(template), CONTRACT_KEYWORDS);
}

function scoreTemplateForGroup(template: SharedReportTemplate, group: ReportGroup, kind: KnowledgeOutputKind) {
  const preferredType = mapOutputKindToTemplateType(kind);
  let score = template.type === preferredType ? 100 : -100;

  if (template.isDefault) score += 24;
  score += Math.min((template.referenceImages || []).length, 6) * 3;

  if (isResumeGroup(group) && looksLikeResumeTemplate(template)) score += 120;
  if (isBidGroup(group) && looksLikeBidTemplate(template)) score += 120;
  if (isOrderGroup(group) && looksLikeOrderTemplate(template)) score += 120;
  if (isFormulaGroup(group) && looksLikeFormulaTemplate(template)) score += 120;
  if (isContractGroup(group) && looksLikeContractTemplate(template)) score += 120;

  return score;
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

function mentionsCustomTemplateIntent(text: string) {
  return /(自定义模板|我的模板|上传模板|参考模板|按模板|使用模板|按照模板)/.test(text);
}

function matchesTemplateName(requestText: string, template: SharedReportTemplate) {
  const haystack = normalizeTemplateNameText(requestText);
  if (!haystack) return false;

  const candidates = [
    template.key,
    template.label,
    template.description,
    ...(template.referenceImages || []).map((item) => item.originalName),
  ]
    .map(normalizeTemplateNameText)
    .filter((candidate) => candidate.length >= 2);

  return candidates.some((candidate) => haystack.includes(candidate));
}

function hasCompanySignal(text: string) {
  return hasAnyKeyword(text, ['company', 'employer', 'organization', '公司', '雇主']);
}

function hasProjectSignal(text: string) {
  return hasAnyKeyword(text, [
    'project',
    'projects',
    'system',
    'systems',
    'platform',
    'platforms',
    'api',
    'implementation',
    'delivery',
    'architecture',
    '项目',
    '系统',
    '平台',
    '接口',
    '实施',
    '交付',
    '架构',
    'it项目',
  ]);
}

function hasSkillSignal(text: string) {
  return hasAnyKeyword(text, [
    'skill',
    'skills',
    'ability',
    'abilities',
    'tech stack',
    'technology',
    '技术栈',
    '技能',
    '能力',
    '核心能力',
    '关键技能',
  ]);
}

function hasTalentSignal(text: string) {
  return hasAnyKeyword(text, [
    'talent',
    'candidate',
    'candidates',
    'people',
    'person',
    '人才',
    '候选人',
    '人员',
    '画像',
    '学历',
    '工作经历',
  ]);
}

function detectResumeRequestView(requestText: string): ResumeRequestView {
  const text = normalizeText(requestText);

  if (hasAnyKeyword(text, ['人才维度', '候选人维度', '人才画像', '候选人画像', '按人才', '按候选人'])) {
    return 'talent';
  }
  if (hasSkillSignal(text)) return 'skill';
  if (hasCompanySignal(text) && hasProjectSignal(text)) return 'company';
  if (hasProjectSignal(text)) return 'project';
  if (hasTalentSignal(text)) return 'talent';
  return 'generic';
}

function adaptResumeEnvelope(
  envelope: ReportTemplateEnvelope,
  kind: KnowledgeOutputKind,
  view: ResumeRequestView,
): ReportTemplateEnvelope {
  if (kind === 'page') {
    if (view === 'company') {
      return {
        ...envelope,
        title: '简历公司维度 IT 项目静态页',
        fixedStructure: [
          '按公司维度汇总库内简历里涉及的 IT 项目、系统、平台和接口经历。',
          '同一家公司下尽量聚合多位候选人的共同项目主题与技术信号。',
          '页面结构应稳定，适合业务方直接浏览和转发。',
        ],
        variableZones: ['公司概览', '重点项目分布', '候选人覆盖', '技术关键词', '风险与机会', 'AI综合分析'],
        outputHint: '按公司维度整理简历中的 IT 项目经历，突出公司、项目、候选人覆盖和技术关键词。',
        pageSections: ['公司概览', '重点项目分布', '候选人覆盖', '技术关键词', '风险与机会', 'AI综合分析'],
      };
    }

    if (view === 'project') {
      return {
        ...envelope,
        title: '简历项目维度静态页',
        fixedStructure: [
          '按项目维度整理库内简历里的项目或系统经历。',
          '同一项目下聚合涉及公司、候选人和技术关键词。',
          '页面适合快速查看项目分布和交付信号。',
        ],
        variableZones: ['项目概览', '公司分布', '候选人参与', '技术关键词', '交付信号', 'AI综合分析'],
        outputHint: '按项目维度整理简历中的项目经历，突出项目名称、涉及公司、候选人和技术关键词。',
        pageSections: ['项目概览', '公司分布', '候选人参与', '技术关键词', '交付信号', 'AI综合分析'],
      };
    }

    if (view === 'skill') {
      return {
        ...envelope,
        title: '简历技能维度静态页',
        fixedStructure: [
          '按技能维度整理库内简历里的核心能力、技术栈和技能覆盖情况。',
          '同一技能下尽量聚合涉及的候选人、公司和关联项目。',
          '页面结构稳定，适合招聘和盘点场景。',
        ],
        variableZones: ['技能概览', '技能分布', '候选人覆盖', '公司关联', '项目关联', 'AI综合分析'],
        outputHint: '按技能维度整理简历信息，突出技能覆盖、候选人分布、公司关联和项目关联。',
        pageSections: ['技能概览', '技能分布', '候选人覆盖', '公司关联', '项目关联', 'AI综合分析'],
      };
    }

    return {
      ...envelope,
      title: '简历人才维度静态页',
      fixedStructure: [
        '按人才维度梳理库内简历，突出学历、最近公司、核心能力和项目亮点。',
        '每个分节都应围绕候选人画像展开，不要漂移到泛化结论。',
        '页面结构稳定，适合招聘和人才盘点场景。',
      ],
      variableZones: ['人才概览', '学历与背景', '公司经历', '项目经历', '核心能力', 'AI综合分析'],
      outputHint: '按人才维度整理简历信息，突出学历背景、最近公司、项目经历和核心能力。',
      pageSections: ['人才概览', '学历与背景', '公司经历', '项目经历', '核心能力', 'AI综合分析'],
    };
  }

  if (view === 'company') {
    return {
      ...envelope,
      title: '简历 IT 项目公司维度表',
      fixedStructure: [
        '按公司维度汇总简历中涉及的 IT 项目、系统、平台和接口经历。',
        '同一家公司可聚合多位候选人的相关项目经历。',
        '优先保留项目名称、项目职责、技术关键词、时间线和证据来源。',
      ],
      variableZones: ['公司名称', '候选人姓名', 'IT 项目或系统名称', '项目角色与职责', '技术栈或系统关键词', '时间线', '证据来源'],
      outputHint: '按公司维度整理简历中的 IT 项目经历，突出公司、候选人、项目、职责、技术关键词和证据。',
      tableColumns: ['公司', '候选人', 'IT项目', '项目角色/职责', '技术栈/系统关键词', '时间线', '证据来源'],
    };
  }

  if (view === 'project') {
    return {
      ...envelope,
      title: '简历项目维度表',
      fixedStructure: [
        '按项目维度整理简历里的项目或系统经历。',
        '同一项目尽量聚合涉及公司、候选人和技术关键词。',
        '优先保留项目名称、公司、候选人、职责、技术关键词和时间线。',
      ],
      variableZones: ['项目名称', '涉及公司', '候选人', '项目角色与职责', '技术关键词', '时间线', '证据来源'],
      outputHint: '按项目维度整理简历中的项目经历，突出项目名称、公司、候选人、职责和技术关键词。',
      tableColumns: ['IT项目/系统', '公司', '候选人', '项目角色/职责', '技术栈/系统关键词', '时间线', '证据来源'],
    };
  }

  if (view === 'skill') {
    return {
      ...envelope,
      title: '简历技能维度表',
      fixedStructure: [
        '按技能维度整理候选人信息，优先体现技能、候选人、最近公司和关联项目。',
        '同一技能项下可以聚合多位候选人，但不要混淆证据来源。',
        '输出应适合招聘筛选和人才盘点。',
      ],
      variableZones: ['技能类别', '候选人', '技能详情', '最近公司', '关联项目', '证据来源'],
      outputHint: '按技能维度整理简历信息，突出技能类别、候选人、最近公司、关联项目和证据来源。',
      tableColumns: ['技能类别', '候选人', '技能详情', '最近公司', '关联项目', '证据来源'],
    };
  }

  if (view === 'talent') {
    return {
      ...envelope,
      title: '简历人才维度表',
      fixedStructure: [
        '按人才维度整理候选人，优先体现学历、最近公司、核心能力、年龄、工作年限和项目亮点。',
        '每一行只对应一位候选人。',
        '字段缺失可以留空，不要自行补造。'
      ],
      variableZones: ['候选人', '第一学历', '最近就职公司', '核心能力', '年龄', '工作年限', '项目亮点', '证据来源'],
      outputHint: '按人才维度整理简历信息，突出学历背景、最近公司、核心能力和项目亮点。',
      tableColumns: ['候选人', '第一学历', '最近就职公司', '核心能力', '年龄', '工作年限', '项目亮点', '证据来源'],
    };
  }

  return envelope;
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
  if (!selectedTemplates.length) return '';

  return [
    'Follow the matched knowledge-base template skeleton strictly.',
    'Keep the fixed structure stable and only vary the explicitly allowed variable zones.',
    '',
    ...selectedTemplates.map(({ group, template }) => buildTemplateEnvelopeInstruction(group, template)),
  ].join('\n\n');
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

export function adaptSelectedTemplatesForRequest(
  selectedTemplates: SelectedKnowledgeTemplate[],
  requestText: string,
) {
  if (!selectedTemplates.length) return selectedTemplates;

  const normalizedRequest = String(requestText || '').trim();
  return selectedTemplates.map((entry) => {
    if (!isResumeGroup(entry.group)) return entry;

    const view = detectResumeRequestView(normalizedRequest);
    if (view === 'generic') return entry;

    const kind = entry.template.type === 'static-page'
      ? 'page'
      : entry.template.type === 'ppt'
        ? 'ppt'
        : entry.template.type === 'document'
          ? 'pdf'
          : 'table';

    return {
      ...entry,
      envelope: adaptResumeEnvelope(entry.envelope, kind, view),
    };
  });
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
