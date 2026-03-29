import type {
  ReportGroup,
  ReportTemplateEnvelope,
  SharedReportTemplate,
} from './report-center.js';
import {
  adaptConceptRequestEnvelope,
  BID_CONCEPT_RULES,
  IOT_CONCEPT_RULES,
} from './concept-request-rules.js';

type KnowledgeOutputKind = 'table' | 'page' | 'pdf' | 'ppt';
type ResumeRequestView = 'generic' | 'company' | 'project' | 'talent' | 'skill';
type BidRequestView = 'generic' | 'section' | 'response' | 'risk';
type OrderRequestView = 'generic' | 'platform' | 'category' | 'stock';
type PaperRequestView = 'generic' | 'method' | 'result' | 'conclusion';
type IotRequestView = 'generic' | 'scenario' | 'module' | 'value';

const RESUME_KEYWORDS = ['resume', 'cv', '简历', '候选人', '人才'];
const BID_KEYWORDS = ['bids', 'bid', 'tender', 'rfp', 'proposal', '标书', '招标', '投标'];
const ORDER_KEYWORDS = ['order', 'orders', '订单', '销量', '销售', '库存', '备货', '电商'];
const PAPER_KEYWORDS = ['paper', 'papers', 'study', 'studies', 'journal', 'research', '论文', '研究', '期刊'];
const IOT_KEYWORDS = ['iot', 'internet of things', '物联网', '传感', '设备', '网关', '平台', '解决方案'];

function normalizeText(...parts: Array<string | undefined | null>) {
  return parts
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function buildGroupText(group: ReportGroup) {
  return normalizeText(group.key, group.label, group.description, ...(group.triggerKeywords || []));
}

function isResumeGroup(group: ReportGroup) {
  return containsAny(buildGroupText(group), RESUME_KEYWORDS);
}

function isBidGroup(group: ReportGroup) {
  return containsAny(buildGroupText(group), BID_KEYWORDS);
}

function isOrderGroup(group: ReportGroup) {
  return containsAny(buildGroupText(group), ORDER_KEYWORDS);
}

function isPaperGroup(group: ReportGroup) {
  return containsAny(buildGroupText(group), PAPER_KEYWORDS);
}

function isIotGroup(group: ReportGroup) {
  return containsAny(buildGroupText(group), IOT_KEYWORDS);
}

function hasCompanySignal(text: string) {
  return containsAny(text, ['company', 'employer', 'organization', '公司', '雇主']);
}

function hasProjectSignal(text: string) {
  return containsAny(text, [
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
  return containsAny(text, [
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
  return containsAny(text, [
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
  return containsAny(text, ['section', 'sections', 'chapter', '章节', '资格条件', '时间节点']);
}

function hasBidResponseSignal(text: string) {
  return containsAny(text, ['response', 'responses', 'materials', 'material', 'qualification', '应答', '材料', '资质', '方案']);
}

function hasBidRiskSignal(text: string) {
  return containsAny(text, ['risk', 'risks', 'deadline', 'compliance', '风险', '截止', '合规']);
}

function hasOrderPlatformSignal(text: string) {
  return containsAny(text, ['platform', 'tmall', 'jd', 'douyin', 'amazon', 'shopify', '平台', '天猫', '京东', '抖音']);
}

function hasOrderCategorySignal(text: string) {
  return containsAny(text, ['category', 'categories', 'sku', '品类', '类目', '商品']);
}

function hasOrderStockSignal(text: string) {
  return containsAny(text, ['inventory', 'stock', 'stockout', 'replenishment', '库存', '缺货', '备货', '补货']);
}

function hasPaperMethodSignal(text: string) {
  return containsAny(text, ['method', 'methods', 'methodology', 'design', 'trial', 'randomized', 'placebo', '方法', '方法学', '研究设计', '试验设计']);
}

function hasPaperResultSignal(text: string) {
  return containsAny(text, ['result', 'results', 'finding', 'findings', 'metric', 'outcome', '结果', '结论', '指标', '发现']);
}

function hasPaperConclusionSignal(text: string) {
  return containsAny(text, ['conclusion', 'conclusions', 'takeaway', 'summary', 'insight', '结论', '摘要', '综述', '启示']);
}

function hasIotScenarioSignal(text: string) {
  return containsAny(text, ['scenario', 'scenarios', 'use case', '场景', '应用场景', '业务场景']);
}

function hasIotModuleSignal(text: string) {
  return containsAny(text, ['module', 'modules', 'gateway', 'sensor', 'platform', 'api', '模块', '网关', '传感', '平台', '接口']);
}

function hasIotValueSignal(text: string) {
  return containsAny(text, ['value', 'roi', 'benefit', 'benefits', '收益', '价值', '指标', '回报']);
}

function detectResumeRequestView(requestText: string): ResumeRequestView {
  const text = normalizeText(requestText);
  if (containsAny(text, ['人才维度', '候选人维度', '人才画像', '候选人画像', '按人才', '按候选人'])) return 'talent';
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

function detectPaperRequestView(requestText: string): PaperRequestView {
  const text = normalizeText(requestText);
  if (hasPaperMethodSignal(text)) return 'method';
  if (hasPaperResultSignal(text)) return 'result';
  if (hasPaperConclusionSignal(text)) return 'conclusion';
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
          '按项目维度聚合候选人的项目经历、公司分布和技术栈信号。',
          '优先归纳项目主题、交付类型、公司参与情况和关键技术词。',
          '页面结构应稳定，适合用于项目经验盘点。',
        ],
        variableZones: ['项目概览', '公司分布', '候选人参与', '技术关键词', '交付信号', 'AI综合分析'],
        outputHint: '按项目维度展示候选人的项目经历、公司分布和交付特征。',
        pageSections: ['项目概览', '公司分布', '候选人参与', '技术关键词', '交付信号', 'AI综合分析'],
      };
    }
    return {
      ...envelope,
      title: '简历人才维度静态页',
      fixedStructure: [
        '按人才维度概览候选人的背景、公司经历、项目经历和核心能力。',
        '页面优先突出人才画像，而不是单一项目或技能列表。',
        '输出应稳定适合管理层浏览。',
      ],
      variableZones: ['人才概览', '学历与背景', '公司经历', '项目经历', '核心能力', 'AI综合分析'],
      outputHint: '按人才维度整理候选人背景、项目经历和能力画像。',
      pageSections: ['人才概览', '学历与背景', '公司经历', '项目经历', '核心能力', 'AI综合分析'],
    };
  }

  if (view === 'company') {
    return {
      ...envelope,
      title: '简历 IT 项目公司维度表',
      fixedStructure: [
        '按公司维度整理库内简历中涉及的 IT 项目信息。',
        '同一家公司下可出现多位候选人和多个项目，但输出列要稳定。',
      ],
      variableZones: ['公司、候选人、项目、角色、技术栈、时间线、证据来源'],
      outputHint: '按公司维度输出简历中涉及的 IT 项目表格。',
      tableColumns: ['公司', '候选人', 'IT项目', '项目角色/职责', '技术栈/系统关键词', '时间线', '证据来源'],
    };
  }
  if (view === 'skill') {
    return {
      ...envelope,
      title: '简历技能维度表',
      fixedStructure: [
        '按技能维度汇总候选人的技能、最近公司和关联项目。',
        '同一技能下尽量聚合多位候选人的共性信息。',
      ],
      variableZones: ['技能类别、候选人、技能详情、最近公司、关联项目、证据来源'],
      outputHint: '按技能维度输出简历中的候选人与项目关联。',
      tableColumns: ['技能类别', '候选人', '技能详情', '最近公司', '关联项目', '证据来源'],
    };
  }
  if (view === 'talent') {
    return {
      ...envelope,
      title: '简历人才维度表',
      fixedStructure: [
        '按人才维度汇总候选人的学历、最近公司、核心能力和代表项目。',
        '优先突出人才画像和匹配判断。',
      ],
      variableZones: ['候选人、第一学历、最近公司、核心能力、代表项目、匹配判断、证据来源'],
      outputHint: '按人才维度输出候选人对比表。',
      tableColumns: ['候选人', '第一学历', '最近公司', '核心能力', '代表项目', '匹配判断', '证据来源'],
    };
  }
  return {
    ...envelope,
    title: '简历项目维度表',
    fixedStructure: [
      '按项目维度汇总候选人的项目经历、公司分布和技术关键词。',
      '优先体现项目主题、公司、候选人和交付信号。',
    ],
    variableZones: ['项目主题、公司、候选人、角色、技术关键词、时间线、证据来源'],
    outputHint: '按项目维度输出候选人的项目经历表。',
    tableColumns: ['项目主题', '公司', '候选人', '角色/职责', '技术关键词', '时间线', '证据来源'],
  };
}

function adaptBidEnvelope(
  envelope: ReportTemplateEnvelope,
  kind: KnowledgeOutputKind,
  view: BidRequestView,
): ReportTemplateEnvelope {
  return adaptConceptRequestEnvelope(envelope, kind, view, BID_CONCEPT_RULES);
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
          '按平台维度组织订单、销售、趋势和库存信息。',
          '页面需要稳定且适合经营团队直接查看。',
        ],
        variableZones: ['经营摘要', '平台对比', '品类覆盖', '销量趋势', '库存与备货建议', 'AI综合分析'],
        outputHint: '按平台维度输出订单经营静态页，突出平台差异、销量趋势和备货建议。',
        pageSections: ['经营摘要', '平台对比', '品类覆盖', '销量趋势', '库存与备货建议', 'AI综合分析'],
      };
    }
    if (view === 'category') {
      return {
        ...envelope,
        title: '订单品类维度静态页',
        fixedStructure: [
          '按品类维度组织订单表现、SKU结构和库存状态。',
          '优先突出品类差异和库存风险。',
        ],
        variableZones: ['经营摘要', '品类对比', 'SKU表现', '趋势变化', '库存与备货', 'AI综合分析'],
        outputHint: '按品类维度输出订单经营静态页，突出品类表现和库存变化。',
        pageSections: ['经营摘要', '品类对比', 'SKU表现', '趋势变化', '库存与备货', 'AI综合分析'],
      };
    }
    return {
      ...envelope,
      title: '订单库存维度静态页',
      fixedStructure: [
        '按库存与备货维度组织风险 SKU、销量预测和补货建议。',
        '优先突出库存风险和补货动作。',
      ],
      variableZones: ['经营摘要', '库存概览', '风险SKU', '销量预测', '补货建议', 'AI综合分析'],
      outputHint: '按库存维度输出订单经营静态页，突出风险 SKU、销量预测和补货建议。',
      pageSections: ['经营摘要', '库存概览', '风险SKU', '销量预测', '补货建议', 'AI综合分析'],
    };
  }

  if (view === 'platform') {
    return {
      ...envelope,
      title: '订单平台维度表',
      fixedStructure: [
        '按平台维度整理订单、销售、库存和异常波动。',
        '优先突出平台间差异。',
      ],
      variableZones: ['平台、核心指标、同比环比、预测销量、库存指数、备货建议'],
      outputHint: '按平台维度输出订单经营表。',
      tableColumns: ['平台', '核心指标', '同比/环比', '预测销量', '库存指数', '备货建议'],
    };
  }
  if (view === 'category') {
    return {
      ...envelope,
      title: '订单品类维度表',
      fixedStructure: [
        '按品类维度整理订单表现、库存状态和补货建议。',
        '优先突出重点品类和 SKU。',
      ],
      variableZones: ['品类、SKU、核心指标、趋势、库存状态、补货建议'],
      outputHint: '按品类维度输出订单经营表。',
      tableColumns: ['品类', 'SKU', '核心指标', '趋势变化', '库存状态', '补货建议'],
    };
  }
  return {
    ...envelope,
    title: '订单库存维度表',
    fixedStructure: [
      '按库存维度整理风险 SKU、库存指数和补货建议。',
      '优先突出库存风险和异常波动。',
    ],
    variableZones: ['风险SKU、库存指数、预测销量、异常波动、补货建议'],
    outputHint: '按库存维度输出订单经营表。',
    tableColumns: ['风险SKU', '库存指数', '预测销量', '异常波动', '补货建议'],
  };
}

function adaptPaperEnvelope(
  envelope: ReportTemplateEnvelope,
  kind: KnowledgeOutputKind,
  view: PaperRequestView,
): ReportTemplateEnvelope {
  if (view === 'generic') return envelope;

  if (kind === 'page') {
    if (view === 'method') {
      return {
        ...envelope,
        title: '论文方法维度静态页',
        fixedStructure: [
          '按研究方法维度组织论文资料，突出研究设计、样本对象、对照方式和关键指标。',
          '页面适合科研综述和方法学对比，不要漂移到泛化结论。',
        ],
        variableZones: ['研究概览', '研究设计', '研究对象', '关键指标', '证据质量', 'AI综合分析'],
        outputHint: '按方法维度输出论文静态页，突出研究设计、样本对象、对照方式和关键指标。',
        pageSections: ['研究概览', '研究设计', '研究对象', '关键指标', '证据质量', 'AI综合分析'],
      };
    }
    if (view === 'result') {
      return {
        ...envelope,
        title: '论文结果维度静态页',
        fixedStructure: [
          '按研究结果维度组织论文资料，突出核心发现、结果指标、效应方向和证据来源。',
          '页面适合业务方快速浏览研究结论，不要变成全文复述。',
        ],
        variableZones: ['研究概览', '核心发现', '结果指标', '证据来源', '局限与风险', 'AI综合分析'],
        outputHint: '按结果维度输出论文静态页，突出核心发现、结果指标和局限性。',
        pageSections: ['研究概览', '核心发现', '结果指标', '证据来源', '局限与风险', 'AI综合分析'],
      };
    }
    return {
      ...envelope,
      title: '论文结论维度静态页',
      fixedStructure: [
        '按结论维度组织论文资料，突出研究结论、证据等级、适用人群和后续建议。',
        '页面适合给非科研用户快速理解论文价值。',
      ],
      variableZones: ['研究概览', '研究结论', '适用人群', '证据等级', '局限与建议', 'AI综合分析'],
      outputHint: '按结论维度输出论文静态页，突出研究结论、适用人群和下一步建议。',
      pageSections: ['研究概览', '研究结论', '适用人群', '证据等级', '局限与建议', 'AI综合分析'],
    };
  }

  if (view === 'method') {
    return {
      ...envelope,
      title: '论文方法维度表',
      fixedStructure: [
        '按研究方法维度整理论文，突出研究设计、研究对象、对照方式和关键指标。',
        '表格适合科研方法对比和证据筛选。',
      ],
      variableZones: ['论文标题', '研究设计', '研究对象', '关键指标', '主要发现', '证据来源'],
      outputHint: '按研究方法维度输出论文表格，突出研究设计、研究对象和关键指标。',
      tableColumns: ['论文标题', '研究设计', '研究对象', '关键指标', '主要发现', '证据来源'],
    };
  }
  if (view === 'result') {
    return {
      ...envelope,
      title: '论文结果维度表',
      fixedStructure: [
        '按研究结果维度整理论文，突出核心发现、结果指标、效应方向和局限性。',
        '优先保留对业务判断有直接价值的结果信息。',
      ],
      variableZones: ['论文标题', '核心发现', '结果指标', '效应方向', '局限性', '证据来源'],
      outputHint: '按研究结果维度输出论文表格，突出核心发现、结果指标和局限性。',
      tableColumns: ['论文标题', '核心发现', '结果指标', '效应方向', '局限性', '证据来源'],
    };
  }
  return {
    ...envelope,
    title: '论文结论维度表',
    fixedStructure: [
      '按结论维度整理论文，突出研究结论、适用人群、证据等级和建议。',
      '适合非科研用户快速浏览和比对。',
    ],
    variableZones: ['论文标题', '研究结论', '适用人群', '证据等级', '建议', '证据来源'],
    outputHint: '按结论维度输出论文表格，突出研究结论、适用人群和建议。',
    tableColumns: ['论文标题', '研究结论', '适用人群', '证据等级', '建议', '证据来源'],
  };
}

function adaptIotEnvelope(
  envelope: ReportTemplateEnvelope,
  kind: KnowledgeOutputKind,
  view: IotRequestView,
): ReportTemplateEnvelope {
  return adaptConceptRequestEnvelope(envelope, kind, view, IOT_CONCEPT_RULES);
}

export function adaptTemplateEnvelopeForRequest(
  group: ReportGroup,
  envelope: ReportTemplateEnvelope,
  kind: KnowledgeOutputKind,
  requestText: string,
) {
  if (isResumeGroup(group)) {
    return adaptResumeEnvelope(envelope, kind, detectResumeRequestView(requestText));
  }
  if (isBidGroup(group)) {
    return adaptBidEnvelope(envelope, kind, detectBidRequestView(requestText));
  }
  if (isOrderGroup(group)) {
    return adaptOrderEnvelope(envelope, kind, detectOrderRequestView(requestText));
  }
  if (isPaperGroup(group)) {
    return adaptPaperEnvelope(envelope, kind, detectPaperRequestView(requestText));
  }
  if (isIotGroup(group)) {
    return adaptIotEnvelope(envelope, kind, detectIotRequestView(requestText));
  }
  return envelope;
}
