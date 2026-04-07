import {
  buildSharedTemplateEnvelope,
  loadReportCenterState,
  type ReportGroup,
  type ReportTemplateEnvelope,
  type SharedReportTemplate,
} from './report-center.js';
import {
  adaptConceptRequestEnvelope,
  BID_CONCEPT_RULES,
  IOT_CONCEPT_RULES,
} from './concept-request-rules.js';
import { adaptTemplateEnvelopeForRequest } from './report-template-adapter.js';

export type KnowledgeOutputKind = 'table' | 'page' | 'pdf' | 'ppt' | 'doc' | 'md';
export type KnowledgeTemplateTaskHint =
  | 'general'
  | 'resume-comparison'
  | 'formula-table'
  | 'formula-static-page'
  | 'bids-table'
  | 'bids-static-page'
  | 'footfall-static-page'
  | 'paper-table'
  | 'paper-static-page'
  | 'order-static-page'
  | 'contract-risk'
  | 'technical-summary'
  | 'iot-table'
  | 'iot-static-page';

export type SelectedKnowledgeTemplate = {
  group: ReportGroup;
  template: SharedReportTemplate;
  envelope: ReportTemplateEnvelope;
};

export type RequestedSharedTemplate = {
  templateKey: string;
  clarificationMessage: string;
};

export type KnowledgeTemplateCatalogOption = {
  groupKey: string;
  groupLabel: string;
  templateKey: string;
  templateLabel: string;
  templateType: SharedReportTemplate['type'];
  description: string;
  origin: string;
  isDefault: boolean;
  outputHint: string;
  fixedStructure: string[];
  variableZones: string[];
  pageSections: string[];
  tableColumns: string[];
  referenceNames: string[];
  score: number;
};

type ResumeRequestView = 'generic' | 'company' | 'project' | 'talent' | 'skill';
type BidRequestView = 'generic' | 'section' | 'response' | 'risk';
type OrderRequestView = 'generic' | 'platform' | 'category' | 'stock';
type IotRequestView = 'generic' | 'scenario' | 'module' | 'value';

const RESUME_KEYWORDS = ['resume', 'cv', '简历', '候选人', '人才'];
const BID_KEYWORDS = ['bids', 'bid', 'tender', 'rfp', 'proposal', '标书', '招标', '投标'];
const ORDER_KEYWORDS = ['order', 'orders', '订单', '销量', '销售', '库存', '备货', '电商'];
const FOOTFALL_KEYWORDS = ['footfall', 'visitor', 'visitors', 'mall traffic', '客流', '人流', '商场分区', '楼层分区', '单间', '铺位', '广州ai'];
const FORMULA_KEYWORDS = ['formula', '配方', '奶粉', '菌株', '益生菌'];
const PAPER_KEYWORDS = ['paper', 'papers', 'study', 'studies', 'journal', 'research', '论文', '学术论文', '研究', '期刊'];
const CONTRACT_KEYWORDS = ['contract', 'contracts', '合同', '条款', '法务'];
const IOT_KEYWORDS = ['iot', 'internet of things', '物联网', '边缘', '传感', '设备', '网关', '平台', '解决方案'];

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
  if (kind === 'pdf' || kind === 'doc' || kind === 'md') return 'document';
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

function isFootfallGroup(group: ReportGroup) {
  return hasAnyKeyword(buildGroupText(group), FOOTFALL_KEYWORDS);
}

function isFormulaGroup(group: ReportGroup) {
  return hasAnyKeyword(buildGroupText(group), FORMULA_KEYWORDS);
}

function isPaperGroup(group: ReportGroup) {
  return hasAnyKeyword(buildGroupText(group), PAPER_KEYWORDS);
}

function isContractGroup(group: ReportGroup) {
  return hasAnyKeyword(buildGroupText(group), CONTRACT_KEYWORDS);
}

function isIotGroup(group: ReportGroup) {
  return hasAnyKeyword(buildGroupText(group), IOT_KEYWORDS);
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

function looksLikeFootfallTemplate(template: SharedReportTemplate) {
  return hasAnyKeyword(buildTemplateText(template), FOOTFALL_KEYWORDS);
}

function looksLikeFormulaTemplate(template: SharedReportTemplate) {
  return hasAnyKeyword(buildTemplateText(template), FORMULA_KEYWORDS);
}

function looksLikePaperTemplate(template: SharedReportTemplate) {
  return hasAnyKeyword(buildTemplateText(template), PAPER_KEYWORDS);
}

function looksLikeContractTemplate(template: SharedReportTemplate) {
  return hasAnyKeyword(buildTemplateText(template), CONTRACT_KEYWORDS);
}

function looksLikeIotTemplate(template: SharedReportTemplate) {
  return hasAnyKeyword(buildTemplateText(template), IOT_KEYWORDS);
}

function scoreTemplateForGroup(template: SharedReportTemplate, group: ReportGroup, kind: KnowledgeOutputKind) {
  const preferredType = mapOutputKindToTemplateType(kind);
  let score = template.type === preferredType ? 100 : -100;

  if (template.isDefault) score += 24;
  score += Math.min((template.referenceImages || []).length, 6) * 3;

  if (isResumeGroup(group) && looksLikeResumeTemplate(template)) score += 120;
  if (isBidGroup(group) && looksLikeBidTemplate(template)) score += 120;
  if (isOrderGroup(group) && looksLikeOrderTemplate(template)) score += 120;
  if (isFootfallGroup(group) && looksLikeFootfallTemplate(template)) score += 120;
  if (isFormulaGroup(group) && looksLikeFormulaTemplate(template)) score += 120;
  if (isPaperGroup(group) && looksLikePaperTemplate(template)) score += 120;
  if (isContractGroup(group) && looksLikeContractTemplate(template)) score += 120;
  if (isIotGroup(group) && looksLikeIotTemplate(template)) score += 120;

  return score;
}

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
    ...envelope.fixedStructure.map((item, index) => `${index + 1}. ${item}`),
    'Variable zones:',
    ...envelope.variableZones.map((item, index) => `${index + 1}. ${item}`),
    `Output hint: ${envelope.outputHint}`,
  ].join('\n');
}

function mentionsCustomTemplateIntent(text: string) {
  return /(自定义模板|我的模板|上传模板|参考模板|按模板|使用模板)/i.test(text);
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
    'it',
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

function hasBidSectionSignal(text: string) {
  return hasAnyKeyword(text, ['section', 'sections', 'chapter', '章节', '资格条件', '时间节点']);
}

function hasBidResponseSignal(text: string) {
  return hasAnyKeyword(text, ['response', 'materials', 'material', 'qualification', '应答', '材料', '资质', '方案']);
}

function hasBidRiskSignal(text: string) {
  return hasAnyKeyword(text, ['risk', 'risks', 'deadline', 'compliance', '风险', '截止', '合规']);
}

function hasOrderPlatformSignal(text: string) {
  return hasAnyKeyword(text, ['platform', 'tmall', 'jd', 'douyin', 'amazon', 'shopify', '平台', '天猫', '京东', '抖音']);
}

function hasOrderCategorySignal(text: string) {
  return hasAnyKeyword(text, ['category', 'categories', 'sku', '品类', '类目', '商品']);
}

function hasOrderStockSignal(text: string) {
  return hasAnyKeyword(text, ['inventory', 'stock', 'forecast', 'replenishment', 'restock', '库存', '预测', '备货', '异常波动']);
}

function hasIotScenarioSignal(text: string) {
  return hasAnyKeyword(text, ['scenario', 'use case', 'customer', 'industry', '场景', '客户', '行业']);
}

function hasIotModuleSignal(text: string) {
  return hasAnyKeyword(text, ['module', 'modules', 'device', 'gateway', 'platform', 'api', '模块', '设备', '网关', '平台', '接口']);
}

function hasIotValueSignal(text: string) {
  return hasAnyKeyword(text, ['value', 'roi', 'benefit', 'benefits', 'delivery', 'stability', '价值', '收益', '成效', '交付', '稳定性']);
}

function detectResumeRequestView(requestText: string): ResumeRequestView {
  const text = normalizeText(requestText);
  if (hasAnyKeyword(text, ['人才维度', '候选人维度', '人才画像', '候选人画像', '按人才', '按候选人'])) return 'talent';
  if (hasSkillSignal(text)) return 'skill';
  if (hasCompanySignal(text) && hasProjectSignal(text)) return 'company';
  if (hasProjectSignal(text)) return 'project';
  if (hasTalentSignal(text)) return 'talent';
  return 'generic';
}

function detectBidRequestView(requestText: string): BidRequestView {
  const text = normalizeText(requestText);
  if (hasBidRiskSignal(text)) return 'risk';
  if (hasBidResponseSignal(text)) return 'response';
  if (hasBidSectionSignal(text)) return 'section';
  return 'generic';
}

function detectOrderRequestView(requestText: string): OrderRequestView {
  const text = normalizeText(requestText);
  if (hasOrderPlatformSignal(text)) return 'platform';
  if (hasOrderCategorySignal(text)) return 'category';
  if (hasOrderStockSignal(text)) return 'stock';
  return 'generic';
}

function detectIotRequestView(requestText: string): IotRequestView {
  const text = normalizeText(requestText);
  if (hasIotValueSignal(text)) return 'value';
  if (hasIotModuleSignal(text)) return 'module';
  if (hasIotScenarioSignal(text)) return 'scenario';
  return 'generic';
}

function adaptResumeEnvelope(
  envelope: ReportTemplateEnvelope,
  kind: KnowledgeOutputKind,
  view: ResumeRequestView,
): ReportTemplateEnvelope {
  if (view === 'generic') return envelope;

  if (kind === 'page') {
    if (view === 'company') {
      return {
        ...envelope,
        title: '简历公司维度 IT 项目静态页',
        fixedStructure: [
          '按公司维度汇总库内简历里涉及的 IT 项目、系统、平台和接口经历。',
          '同一家公司下尽量聚合多位候选人的共同项目主题与技术信号。',
          '页面结构要稳定，适合业务方直接浏览和转发。',
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
        '同一家公司可以聚合多位候选人的相关项目经历。',
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
        '同一项目下尽量聚合涉及公司、候选人和技术关键词。',
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

  return {
    ...envelope,
    title: '简历人才维度表',
    fixedStructure: [
      '按人才维度整理候选人，优先体现学历、最近公司、核心能力、年龄、工作年限和项目亮点。',
      '每一行只对应一位候选人。',
      '字段缺失可以留空，不要自行补造。',
    ],
    variableZones: ['候选人', '第一学历', '最近就职公司', '核心能力', '年龄', '工作年限', '项目亮点', '证据来源'],
    outputHint: '按人才维度整理简历信息，突出学历背景、最近公司、核心能力和项目亮点。',
    tableColumns: ['候选人', '第一学历', '最近就职公司', '核心能力', '年龄', '工作年限', '项目亮点', '证据来源'],
  };
}

function adaptBidEnvelope(
  envelope: ReportTemplateEnvelope,
  kind: KnowledgeOutputKind,
  view: BidRequestView,
): ReportTemplateEnvelope {
  return adaptConceptRequestEnvelope(envelope, kind, view, BID_CONCEPT_RULES);
  if (view === 'generic') return envelope;

  if (kind === 'page') {
    if (view === 'risk') {
      return {
        ...envelope,
        title: '标书风险维度静态页',
        fixedStructure: [
          '按风险维度整理标书资料，突出资格风险、时间风险、材料缺口和合规事项。',
          '页面适合内部预审和复核，不要漂移到泛泛摘要。',
          '结论要与库内证据对应。',
        ],
        variableZones: ['风险概览', '资格风险', '材料缺口', '时间风险', '应答建议', 'AI综合分析'],
        outputHint: '按风险维度整理标书资料，突出资格风险、材料缺口、关键时间节点和应答建议。',
        pageSections: ['风险概览', '资格风险', '材料缺口', '时间风险', '应答建议', 'AI综合分析'],
      };
    }

    if (view === 'response') {
      return {
        ...envelope,
        title: '标书应答维度静态页',
        fixedStructure: [
          '按应答维度整理招投标资料，突出章节要求、应答重点、补充材料和交付建议。',
          '优先围绕实际应答动作组织内容。',
          '适合项目组内部分工和对标。',
        ],
        variableZones: ['项目概况', '应答重点', '需补充材料', '资格条件', '交付建议', 'AI综合分析'],
        outputHint: '按应答维度整理标书资料，突出应答重点、补充材料、资格条件和交付建议。',
        pageSections: ['项目概况', '应答重点', '需补充材料', '资格条件', '交付建议', 'AI综合分析'],
      };
    }

    return {
      ...envelope,
      title: '标书章节维度静态页',
      fixedStructure: [
        '按章节维度整理标书资料，突出章节要求、资格条件、时间节点和关键注意事项。',
        '同一章节下尽量聚合应答重点与风险提醒。',
        '适合快速浏览整体结构。',
      ],
      variableZones: ['章节概览', '资格条件', '时间节点', '应答重点', '风险提醒', 'AI综合分析'],
      outputHint: '按章节维度整理标书资料，突出章节要求、资格条件、时间节点和风险提醒。',
      pageSections: ['章节概览', '资格条件', '时间节点', '应答重点', '风险提醒', 'AI综合分析'],
    };
  }

  if (view === 'risk') {
    return {
      ...envelope,
      title: '标书风险维度表',
      fixedStructure: [
        '按风险维度整理标书资料。',
        '优先覆盖资格风险、材料缺口、时间风险和对应建议。',
        '每一行都应带证据来源。',
      ],
      variableZones: ['风险类别', '章节/事项', '风险说明', '需补充材料', '应对建议', '证据来源'],
      outputHint: '按风险维度整理标书资料，突出资格风险、材料缺口、时间风险和应对建议。',
      tableColumns: ['风险类别', '章节/事项', '风险说明', '需补充材料', '应对建议', '证据来源'],
    };
  }

  if (view === 'response') {
    return {
      ...envelope,
      title: '标书应答维度表',
      fixedStructure: [
        '按应答维度整理标书资料。',
        '优先体现章节、应答重点、需补充材料、负责人动作和证据来源。',
        '适合项目推进与分工。',
      ],
      variableZones: ['章节', '应答重点', '需补充材料', '资格条件', '交付建议', '证据来源'],
      outputHint: '按应答维度整理标书资料，突出章节、应答重点、需补充材料和交付建议。',
      tableColumns: ['章节', '应答重点', '需补充材料', '资格条件', '交付建议', '证据来源'],
    };
  }

  return {
    ...envelope,
    title: '标书章节维度表',
    fixedStructure: [
      '按章节维度整理标书资料。',
      '优先体现章节要求、资格条件、时间节点、风险提醒和证据来源。',
      '适合整体梳理和预审。',
    ],
    variableZones: ['章节', '资格条件', '关键时间节点', '应答重点', '风险提示', '证据来源'],
    outputHint: '按章节维度整理标书资料，突出章节要求、资格条件、时间节点和风险提示。',
    tableColumns: ['章节', '资格条件', '关键时间节点', '应答重点', '风险提示', '证据来源'],
  };
}

function adaptOrderEnvelope(
  envelope: ReportTemplateEnvelope,
  kind: KnowledgeOutputKind,
  view: OrderRequestView,
): ReportTemplateEnvelope {
  if (view === 'generic') return envelope;

  if (kind === 'page') {
    if (view === 'platform') {
      return {
        ...envelope,
        title: '订单平台维度静态页',
        fixedStructure: [
          '按平台维度整理订单与经营资料。',
          '优先体现平台对比、销量趋势、库存和备货动作。',
          '页面适合运营和业务复盘。',
        ],
        variableZones: ['经营摘要', '平台对比', '品类覆盖', '销量趋势', '库存与备货建议', 'AI综合分析'],
        outputHint: '按平台维度整理订单与经营资料，突出平台对比、销量趋势和库存备货。',
        pageSections: ['经营摘要', '平台对比', '品类覆盖', '销量趋势', '库存与备货建议', 'AI综合分析'],
      };
    }

    if (view === 'category') {
      return {
        ...envelope,
        title: '订单品类维度静态页',
        fixedStructure: [
          '按品类维度整理订单与经营资料。',
          '优先体现品类分布、平台覆盖、销量趋势和库存风险。',
          '页面适合经营分析与补货决策。',
        ],
        variableZones: ['经营摘要', '品类对比', '平台覆盖', '销量趋势', '库存风险', 'AI综合分析'],
        outputHint: '按品类维度整理订单与经营资料，突出品类分布、平台覆盖和库存风险。',
        pageSections: ['经营摘要', '品类对比', '平台覆盖', '销量趋势', '库存风险', 'AI综合分析'],
      };
    }

    return {
      ...envelope,
      title: '订单库存与预测静态页',
      fixedStructure: [
        '按库存与预测维度整理订单资料。',
        '优先体现库存指数、预测销量、备货推荐和异常波动。',
        '页面适合补货和运营预警。',
      ],
      variableZones: ['经营摘要', '库存指数', '预测销量', '备货推荐', '异常波动说明', 'AI综合分析'],
      outputHint: '按库存与预测维度整理订单资料，突出库存指数、预测销量、备货推荐和异常波动。',
      pageSections: ['经营摘要', '库存指数', '预测销量', '备货推荐', '异常波动说明', 'AI综合分析'],
    };
  }

  if (view === 'platform') {
    return {
      ...envelope,
      title: '订单平台维度表',
      fixedStructure: [
        '按平台维度整理订单与经营资料。',
        '优先体现平台、核心指标、同比环比、库存指数和备货建议。',
        '适合快速对比不同平台表现。',
      ],
      variableZones: ['平台', '核心指标', '同比/环比', '预测销量', '库存指数', '备货推荐', '证据来源'],
      outputHint: '按平台维度整理订单资料，突出平台、核心指标、同比环比和备货建议。',
      tableColumns: ['平台', '核心指标', '同比/环比', '预测销量', '库存指数', '备货推荐', '证据来源'],
    };
  }

  if (view === 'category') {
    return {
      ...envelope,
      title: '订单品类维度表',
      fixedStructure: [
        '按品类维度整理订单与经营资料。',
        '优先体现品类、平台覆盖、销量、库存风险和备货建议。',
        '适合品类经营分析。',
      ],
      variableZones: ['品类', '平台覆盖', '销量表现', '库存风险', '备货建议', '证据来源'],
      outputHint: '按品类维度整理订单资料，突出品类、平台覆盖、销量表现和库存风险。',
      tableColumns: ['品类', '平台覆盖', '销量表现', '库存风险', '备货建议', '证据来源'],
    };
  }

  return {
    ...envelope,
    title: '订单库存与预测表',
    fixedStructure: [
      '按库存与预测维度整理订单与经营资料。',
      '优先体现SKU或品类、预测销量、库存指数、备货建议和异常波动。',
      '适合补货和风控决策。',
    ],
    variableZones: ['对象', '预测销量', '库存指数', '备货推荐', '异常波动', '证据来源'],
    outputHint: '按库存与预测维度整理订单资料，突出预测销量、库存指数、备货推荐和异常波动。',
    tableColumns: ['对象', '预测销量', '库存指数', '备货推荐', '异常波动', '证据来源'],
  };
}

function adaptIotEnvelope(
  envelope: ReportTemplateEnvelope,
  kind: KnowledgeOutputKind,
  view: IotRequestView,
): ReportTemplateEnvelope {
  return adaptConceptRequestEnvelope(envelope, kind, view, IOT_CONCEPT_RULES);
  if (view === 'generic') return envelope;

  if (kind === 'page') {
    if (view === 'scenario') {
      return {
        ...envelope,
        title: 'IOT 场景维度静态页',
        fixedStructure: [
          '按场景维度整理 IOT 解决方案资料。',
          '优先体现行业/客户场景、核心痛点、解决方案和交付信号。',
          '适合方案汇报和客户沟通。',
        ],
        variableZones: ['场景概览', '行业分布', '核心痛点', '解决方案摘要', '交付信号', 'AI综合分析'],
        outputHint: '按场景维度整理 IOT 资料，突出行业/客户场景、核心痛点、解决方案和交付信号。',
        pageSections: ['场景概览', '行业分布', '核心痛点', '解决方案摘要', '交付信号', 'AI综合分析'],
      };
    }

    if (view === 'module') {
      return {
        ...envelope,
        title: 'IOT 模块维度静态页',
        fixedStructure: [
          '按模块维度整理 IOT 解决方案资料。',
          '优先体现设备、网关、平台、接口和集成关系。',
          '适合技术方案梳理和内部评审。',
        ],
        variableZones: ['模块概览', '设备与网关', '平台能力', '接口集成', '交付关系', 'AI综合分析'],
        outputHint: '按模块维度整理 IOT 资料，突出设备、网关、平台、接口和集成关系。',
        pageSections: ['模块概览', '设备与网关', '平台能力', '接口集成', '交付关系', 'AI综合分析'],
      };
    }

    return {
      ...envelope,
      title: 'IOT 价值维度静态页',
      fixedStructure: [
        '按价值维度整理 IOT 解决方案资料。',
        '优先体现业务价值、交付结果、稳定性、ROI 和落地建议。',
        '适合对外汇报和复盘。',
      ],
      variableZones: ['价值概览', '业务收益', '交付结果', '稳定性信号', '下一步建议', 'AI综合分析'],
      outputHint: '按价值维度整理 IOT 资料，突出业务收益、交付结果、稳定性和下一步建议。',
      pageSections: ['价值概览', '业务收益', '交付结果', '稳定性信号', '下一步建议', 'AI综合分析'],
    };
  }

  if (view === 'scenario') {
    return {
      ...envelope,
      title: 'IOT 场景维度表',
      fixedStructure: [
        '按场景维度整理 IOT 方案资料。',
        '优先体现行业/客户场景、核心痛点、解决方案、交付信号和证据来源。',
        '适合方案梳理。',
      ],
      variableZones: ['场景', '行业/客户', '核心痛点', '解决方案', '交付信号', '证据来源'],
      outputHint: '按场景维度整理 IOT 资料，突出行业/客户场景、核心痛点、解决方案和交付信号。',
      tableColumns: ['场景', '行业/客户', '核心痛点', '解决方案', '交付信号', '证据来源'],
    };
  }

  if (view === 'module') {
    return {
      ...envelope,
      title: 'IOT 模块维度表',
      fixedStructure: [
        '按模块维度整理 IOT 方案资料。',
        '优先体现模块、设备/网关、平台能力、接口集成和证据来源。',
        '适合技术评审。',
      ],
      variableZones: ['模块', '设备/网关', '平台能力', '接口集成', '交付关系', '证据来源'],
      outputHint: '按模块维度整理 IOT 资料，突出模块、设备/网关、平台能力和接口集成。',
      tableColumns: ['模块', '设备/网关', '平台能力', '接口集成', '交付关系', '证据来源'],
    };
  }

  return {
    ...envelope,
    title: 'IOT 价值维度表',
    fixedStructure: [
      '按价值维度整理 IOT 方案资料。',
      '优先体现业务价值、交付结果、稳定性、ROI 和建议。',
      '适合对外汇报和内部复盘。',
    ],
    variableZones: ['价值主题', '业务收益', '交付结果', '稳定性信号', '下一步建议', '证据来源'],
    outputHint: '按价值维度整理 IOT 资料，突出业务收益、交付结果、稳定性和下一步建议。',
    tableColumns: ['价值主题', '业务收益', '交付结果', '稳定性信号', '下一步建议', '证据来源'],
  };
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

export function inferKnowledgeTemplateTaskHintFromLibraries(
  libraries: Array<{ key?: string; label?: string }>,
  kind: KnowledgeOutputKind,
): KnowledgeTemplateTaskHint {
  const text = normalizeText(
    ...libraries.flatMap((item) => [item.key || '', item.label || '']),
  );

  if (hasAnyKeyword(text, RESUME_KEYWORDS)) return 'resume-comparison';
  if (hasAnyKeyword(text, BID_KEYWORDS)) return kind === 'page' ? 'bids-static-page' : 'bids-table';
  if (hasAnyKeyword(text, ORDER_KEYWORDS)) return 'order-static-page';
  if (hasAnyKeyword(text, FOOTFALL_KEYWORDS)) return 'footfall-static-page';
  if (hasAnyKeyword(text, FORMULA_KEYWORDS)) return kind === 'page' ? 'formula-static-page' : 'formula-table';
  if (hasAnyKeyword(text, PAPER_KEYWORDS)) return kind === 'page' ? 'paper-static-page' : 'paper-table';
  if (hasAnyKeyword(text, CONTRACT_KEYWORDS)) return 'contract-risk';
  if (hasAnyKeyword(text, IOT_KEYWORDS)) return kind === 'page' ? 'iot-static-page' : 'iot-table';
  return 'general';
}

export function shouldUseConceptPageMode(
  kind: KnowledgeOutputKind,
  preferredTemplateKey?: string,
) {
  return kind === 'page' && !String(preferredTemplateKey || '').trim();
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

export function inferTemplateTaskHint(
  selectedTemplates: SelectedKnowledgeTemplate[],
  kind: KnowledgeOutputKind,
): KnowledgeTemplateTaskHint {
  const primary = selectedTemplates[0];
  if (!primary) return 'general';

  if (isResumeGroup(primary.group)) return 'resume-comparison';
  if (isBidGroup(primary.group)) return kind === 'page' ? 'bids-static-page' : 'bids-table';
  if (isOrderGroup(primary.group)) return 'order-static-page';
  if (isFootfallGroup(primary.group)) return 'footfall-static-page';
  if (isFormulaGroup(primary.group)) return kind === 'page' ? 'formula-static-page' : 'formula-table';
  if (isPaperGroup(primary.group)) return kind === 'page' ? 'paper-static-page' : 'paper-table';
  if (isContractGroup(primary.group)) return 'contract-risk';
  if (isIotGroup(primary.group)) return kind === 'page' ? 'iot-static-page' : 'iot-table';
  return 'general';
}
