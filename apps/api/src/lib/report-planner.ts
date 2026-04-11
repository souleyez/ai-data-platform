import type { RetrievalResult } from './document-retrieval.js';
import type { KnowledgeTemplateTaskHint, SelectedKnowledgeTemplate } from './knowledge-template.js';
import type { ReportTemplateEnvelope } from './report-center.js';

export type ReportPlanAudience = 'client';
export type ReportPlanTemplateMode = 'concept-page' | 'shared-template';
export type ReportPlanCompletionMode = 'knowledge-first' | 'knowledge-plus-model';

export type ReportPlanSection = {
  title: string;
  purpose: string;
  evidenceFocus: string;
  completionMode: ReportPlanCompletionMode;
  datavizSlotKeys?: string[];
};

export type ReportPlanCard = {
  label: string;
  purpose: string;
};

export type ReportPlanChart = {
  title: string;
  purpose: string;
};

export type ReportPlanDatavizSlot = {
  key: string;
  title: string;
  purpose: string;
  preferredChartType: 'bar' | 'horizontal-bar' | 'line';
  placement: 'hero' | 'section';
  sectionTitle?: string;
  evidenceFocus: string;
  minItems: number;
  maxItems: number;
};

export type ReportPlanPageSpecSection = {
  title: string;
  purpose: string;
  completionMode: ReportPlanCompletionMode;
  datavizSlotKeys: string[];
};

export type ReportPlanLayoutVariant =
  | 'insight-brief'
  | 'risk-brief'
  | 'operations-cockpit'
  | 'talent-showcase'
  | 'research-brief'
  | 'solution-overview';

export type ReportPlanPageSpec = {
  layoutVariant: ReportPlanLayoutVariant;
  heroCardLabels: string[];
  heroDatavizSlotKeys: string[];
  sections: ReportPlanPageSpecSection[];
};

export type ReportPlan = {
  audience: ReportPlanAudience;
  templateMode: ReportPlanTemplateMode;
  objective: string;
  envelope: ReportTemplateEnvelope;
  stylePriorities: string[];
  evidenceRules: string[];
  completionRules: string[];
  cards: ReportPlanCard[];
  charts: ReportPlanChart[];
  datavizSlots: ReportPlanDatavizSlot[];
  sections: ReportPlanSection[];
  pageSpec: ReportPlanPageSpec;
  knowledgeScope: {
    libraryLabels: string[];
    documentCount: number;
    detailedCount: number;
    dominantTopics: string[];
    dominantSchemas: string[];
  };
};

export type ReportPlannerInput = {
  requestText: string;
  templateTaskHint?: KnowledgeTemplateTaskHint | null;
  conceptPageMode?: boolean;
  selectedTemplates?: SelectedKnowledgeTemplate[];
  baseEnvelope?: ReportTemplateEnvelope | null;
  retrieval: RetrievalResult;
  libraries: Array<{ key?: string; label?: string }>;
};

type ReportPlanTaskHintInput = {
  requestText?: string;
  groupKey?: string;
  groupLabel?: string;
  templateKey?: string;
  templateLabel?: string;
  kind?: 'table' | 'page' | 'ppt' | 'pdf' | 'doc' | 'md';
};

const RESUME_HINT_KEYWORDS = ['resume', 'cv', '简历', '候选人', '人才'];
const BID_HINT_KEYWORDS = ['bids', 'bid', 'tender', 'rfp', 'proposal', '标书', '招标', '投标'];
const ORDER_HINT_KEYWORDS = ['order', 'orders', '订单', '销售', '销售', '库存', '备货', '电商'];
const FOOTFALL_HINT_KEYWORDS = ['footfall', 'visitor', 'visitors', 'mall traffic', '客流', '人流', '商场分区', '楼层分区', '单间', '铺位', '广州ai'];
const FORMULA_HINT_KEYWORDS = ['formula', '配方', '奶粉', '菌株', '益生菌'];
const PAPER_HINT_KEYWORDS = ['paper', 'papers', 'study', 'studies', 'journal', 'research', '论文', '学术论文', '研究', '期刊'];
const CONTRACT_HINT_KEYWORDS = ['contract', 'contracts', '合同', '条款', '法务'];
const IOT_HINT_KEYWORDS = ['iot', 'internet of things', '物联网', '边缘', '传感', '设备', '网关', '平台', '解决方案'];

function countTopValues(values: string[], limit = 4) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (!normalized) continue;
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([label]) => label);
}

function uniqueNonEmpty(values: Array<string | undefined | null>) {
  return [...new Set(
    values
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )];
}

function normalizeKeywordText(...values: Array<string | undefined | null>) {
  return values
    .map((value) => String(value || ''))
    .join(' ')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDatavizSlotKey(title: string) {
  return String(title || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'chart';
}

function hasKeyword(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(normalizeKeywordText(keyword)));
}

export function inferReportPlanTaskHint(input: ReportPlanTaskHintInput): KnowledgeTemplateTaskHint | null {
  const text = normalizeKeywordText(
    input.requestText,
    input.groupKey,
    input.groupLabel,
    input.templateKey,
    input.templateLabel,
  );
  if (!text) return null;

  if (hasKeyword(text, RESUME_HINT_KEYWORDS)) return 'resume-comparison';
  if (hasKeyword(text, BID_HINT_KEYWORDS)) return input.kind === 'table' ? 'bids-table' : 'bids-static-page';
  if (hasKeyword(text, ORDER_HINT_KEYWORDS)) return 'order-static-page';
  if (hasKeyword(text, FOOTFALL_HINT_KEYWORDS)) return 'footfall-static-page';
  if (hasKeyword(text, FORMULA_HINT_KEYWORDS)) return input.kind === 'table' ? 'formula-table' : 'formula-static-page';
  if (hasKeyword(text, PAPER_HINT_KEYWORDS)) return input.kind === 'table' ? 'paper-table' : 'paper-static-page';
  if (hasKeyword(text, CONTRACT_HINT_KEYWORDS)) return 'contract-risk';
  if (hasKeyword(text, IOT_HINT_KEYWORDS)) return input.kind === 'table' ? 'iot-table' : 'iot-static-page';
  return null;
}

function buildFallbackSections(templateTaskHint?: KnowledgeTemplateTaskHint | null) {
  switch (templateTaskHint) {
    case 'resume-comparison':
      return ['客户概览', '代表候选人', '代表项目', '技能覆盖', '匹配建议', 'AI综合分析'];
    case 'bids-static-page':
      return ['摘要', '重点分析', '风险提示', '应答建议', 'AI综合分析'];
    case 'paper-static-page':
      return ['研究概览', '核心发现', '证据质量', '行动建议', 'AI综合分析'];
    case 'order-static-page':
      return ['经营总览', '渠道结构', 'SKU与品类焦点', '库存与补货', '异常波动解释', '行动建议', 'AI综合分析'];
    case 'footfall-static-page':
      return ['客流总览', '商场分区贡献', '重点分区对比', '商场动线提示', '行动建议', 'AI综合分析'];
    case 'iot-static-page':
      return ['方案概览', '核心模块', '接口与集成', '交付与风险', 'AI综合分析'];
    default:
      return ['摘要', '重点分析', '行动建议', 'AI综合分析'];
  }
}

function buildFallbackTitle(
  templateTaskHint: KnowledgeTemplateTaskHint | null | undefined,
  libraryLabels: string[],
  requestText = '',
  documentTitles: string[] = [],
) {
  const primaryLabel = libraryLabels[0] || '知识库';
  switch (templateTaskHint) {
    case 'resume-comparison':
      return '简历客户汇报静态页';
    case 'bids-static-page':
      return '客户汇报型标书静态页';
    case 'paper-static-page':
      return '客户汇报型论文综述页';
    case 'order-static-page':
      return '客户汇报型多渠道经营驾驶舱';
    case 'footfall-static-page':
      return buildFootfallFallbackTitle(requestText, libraryLabels, documentTitles);
    case 'iot-static-page':
      return '客户汇报型 IOT 方案静态页';
    default:
      return `${primaryLabel} 客户汇报静态页`;
  }
}

const FOOTFALL_SUBJECT_STOPWORDS = new Set([
  '广州AI',
  '广州ai',
  '广州 AI',
  'AI',
  'ai',
  '知识库',
  '商场',
  '客流',
  '人流',
  '采集',
  '数据',
  '报表',
  '静态页',
  '分析',
  '输出',
  '一份',
  '使用',
  '基于',
]);

function normalizeFootfallSubjectKey(value: string) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '')
    .trim();
}

function sanitizeFootfallSubject(value: string, libraryLabels: string[]) {
  const raw = String(value || '').trim().replace(/[《》"'“”‘’、，。；：:]+$/g, '');
  if (!raw) return '';
  if (raw.length < 2 || raw.length > 24) return '';
  const normalizedRaw = normalizeFootfallSubjectKey(raw);
  if (FOOTFALL_SUBJECT_STOPWORDS.has(raw) || FOOTFALL_SUBJECT_STOPWORDS.has(normalizedRaw)) return '';
  if (libraryLabels.some((label) => normalizedRaw === normalizeFootfallSubjectKey(String(label || '').trim()))) return '';
  if (/^[a-z]{2,4}$/i.test(raw)) return '';
  if (/知识库|静态页|报表|数据|采集|分析|输出/.test(raw)) return '';
  return raw;
}

function extractFootfallSubjectFromText(text: string, libraryLabels: string[]) {
  const source = String(text || '').trim();
  if (!source) return '';

  const patterns = [
    /对\s*([\u4e00-\u9fffA-Za-z0-9()（）·\-]{2,24}?)\s*客流(?:采集)?数据/u,
    /([\u4e00-\u9fffA-Za-z0-9()（）·\-]{2,24}?)\s*客流(?:采集)?数据/u,
    /([\u4e00-\u9fffA-Za-z0-9()（）·\-]{2,24}?)\s*客流(?:报表|日报|静态页|分析)/u,
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    const candidate = sanitizeFootfallSubject(match?.[1] || '', libraryLabels);
    if (candidate) return candidate;
  }

  return '';
}

function extractFootfallSubjectFromTitle(title: string, libraryLabels: string[]) {
  const source = String(title || '').trim();
  if (!source) return '';

  const patterns = [
    /([\u4e00-\u9fffA-Za-z0-9()（）·\-]{2,24}?)\s*客流(?:日报|报表|数据|分析)/u,
    /([\u4e00-\u9fffA-Za-z0-9()（）·\-]{2,24}?)\s*商场客流/u,
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    const candidate = sanitizeFootfallSubject(match?.[1] || '', libraryLabels);
    if (candidate) return candidate;
  }

  return '';
}

function buildFootfallFallbackTitle(requestText: string, libraryLabels: string[], documentTitles: string[]) {
  const subject =
    extractFootfallSubjectFromText(requestText, libraryLabels)
    || documentTitles.map((item) => extractFootfallSubjectFromTitle(item, libraryLabels)).find(Boolean)
    || '';
  if (!subject) return '客户汇报型商场客流分区驾驶舱';
  return subject.includes('商场')
    ? `${subject}客流分析报告`
    : `${subject}商场客流分析报告`;
}

function resolveBaseEnvelope(input: ReportPlannerInput, libraryLabels: string[]) {
  const selectedEnvelope = input.selectedTemplates?.[0]?.envelope || input.baseEnvelope || null;
  const pageSections = input.templateTaskHint === 'resume-comparison'
    ? buildFallbackSections(input.templateTaskHint)
    : selectedEnvelope?.pageSections?.length
    ? [...selectedEnvelope.pageSections]
    : buildFallbackSections(input.templateTaskHint);

  return {
    title: selectedEnvelope?.title || buildFallbackTitle(
      input.templateTaskHint,
      libraryLabels,
      input.requestText,
      input.retrieval.documents.map((item) => String(item.title || item.name || '').trim()).filter(Boolean),
    ),
    fixedStructure: uniqueNonEmpty([
      ...(selectedEnvelope?.fixedStructure || []),
      'Lead with the business conclusion and keep the page client-facing.',
      'Prefer a clean visual board with stable sections before decorative details.',
      'Use matched knowledge evidence first, then add conservative model synthesis.',
    ]),
    variableZones: uniqueNonEmpty([
      ...(selectedEnvelope?.variableZones || []),
      ...pageSections,
    ]),
    outputHint: uniqueNonEmpty([
      selectedEnvelope?.outputHint,
      'Generate a client-facing visual static page that is clear, credible, and easy to present.',
    ]).join(' '),
    pageSections,
  } satisfies ReportTemplateEnvelope;
}

function buildObjective(
  templateTaskHint: KnowledgeTemplateTaskHint | null | undefined,
  libraryLabels: string[],
) {
  const primaryLabel = libraryLabels[0] || 'the selected knowledge libraries';
  switch (templateTaskHint) {
    case 'resume-comparison':
      return `Create a client-facing talent insight page from ${primaryLabel}, with quick decision support instead of raw resume dumping.`;
    case 'bids-static-page':
      return `Create a customer-ready bid analysis page from ${primaryLabel}, highlighting risks, gaps, and response direction.`;
    case 'paper-static-page':
      return `Create a readable research insight page from ${primaryLabel}, turning paper evidence into a clear decision-oriented overview.`;
    case 'order-static-page':
      return `Create a multi-channel, multi-SKU operating cockpit from ${primaryLabel}, highlighting channel mix, SKU concentration, inventory health, and replenishment priorities.`;
    case 'footfall-static-page':
      return `Create a mall footfall summary page from ${primaryLabel}, aggregate strictly at mall-zone level, and avoid expanding floor-zone or room-unit detail in the presentation layer.`;
    case 'iot-static-page':
      return `Create a solution overview page from ${primaryLabel}, showing modules, integrations, delivery shape, and business value.`;
    default:
      return `Create a client-facing visual report from ${primaryLabel}, with clear structure, credible evidence, and concise guidance.`;
  }
}

function buildCardPlan(templateTaskHint: KnowledgeTemplateTaskHint | null | undefined) {
  switch (templateTaskHint) {
    case 'resume-comparison':
      return [
        { label: '候选人覆盖', purpose: 'Show how many candidates and profiles support the page.' },
        { label: '公司覆盖', purpose: 'Show employer breadth and business context.' },
        { label: '项目匹配', purpose: 'Highlight delivery-fit and project relevance for customer review.' },
        { label: '技能热点', purpose: 'Summarize the strongest reusable capability signals.' },
      ];
    case 'bids-static-page':
      return [
        { label: '资料覆盖', purpose: 'Show how much bid material supports the page.' },
        { label: '高风险主题', purpose: 'Surface the most important risk cluster.' },
        { label: '材料缺口', purpose: 'Call out missing materials or weak coverage.' },
        { label: '行动优先级', purpose: 'Show what should be handled first.' },
      ];
    case 'paper-static-page':
      return [
        { label: '论文数量', purpose: 'Show the volume of research evidence.' },
        { label: '研究对象', purpose: 'Summarize the dominant subject population.' },
        { label: '方法设计', purpose: 'Highlight the strongest methodology signal.' },
        { label: '核心结论', purpose: 'Surface the most decision-relevant result.' },
      ];
    case 'order-static-page':
      return [
        { label: '渠道GMV', purpose: 'Show the channel mix and where revenue concentration actually sits.' },
        { label: '动销SKU', purpose: 'Show how many SKUs are truly contributing to sell-through instead of sitting idle.' },
        { label: '高风险SKU', purpose: 'Surface SKUs with stockout, overstock, or margin pressure.' },
        { label: '库存健康', purpose: 'Summarize whether the inventory structure can safely support the next cycle.' },
        { label: '补货优先级', purpose: 'Show the most urgent replenishment or allocation actions.' },
      ];
    case 'footfall-static-page':
      return [
        { label: '总客流', purpose: 'Show the total recognized visitor volume across the matched footfall reports.' },
        { label: '商场分区数', purpose: 'Show how many mall zones are included after aggregation.' },
        { label: '头部分区', purpose: 'Surface the highest-footfall mall zone at the summary layer.' },
        { label: '展示口径', purpose: 'Make it explicit that the page stays at mall-zone level only.' },
      ];
    case 'iot-static-page':
      return [
        { label: '方案资料数', purpose: 'Show how much solution evidence is included.' },
        { label: '核心模块', purpose: 'Summarize the dominant module or system focus.' },
        { label: '接口集成', purpose: 'Highlight integration complexity and boundaries.' },
        { label: '业务价值', purpose: 'Show the clearest customer-facing value signal.' },
      ];
    default:
      return [
        { label: '资料覆盖', purpose: 'Show the evidence footprint behind the page.' },
        { label: '重点主题', purpose: 'Highlight the dominant business theme.' },
        { label: '主要类型', purpose: 'Show the dominant document shape or schema.' },
        { label: '行动建议', purpose: 'Surface the clearest next-step guidance.' },
      ];
  }
}

function buildChartPlan(templateTaskHint: KnowledgeTemplateTaskHint | null | undefined) {
  switch (templateTaskHint) {
    case 'resume-comparison':
      return [
        { title: '公司覆盖分布', purpose: 'Show employer clustering and business concentration.' },
        { title: '技能热点分布', purpose: 'Show repeated capability themes.' },
      ];
    case 'bids-static-page':
      return [
        { title: '风险主题分布', purpose: 'Show the most repeated risk clusters.' },
        { title: '资料类型分布', purpose: 'Show what kind of bid evidence is actually present.' },
      ];
    case 'paper-static-page':
      return [
        { title: '研究主题分布', purpose: 'Show what the literature mainly covers.' },
        { title: '文档类型分布', purpose: 'Show evidence composition and quality shape.' },
      ];
    case 'order-static-page':
      return [
        { title: '渠道贡献结构', purpose: 'Show how business volume is distributed across marketplaces and channels.' },
        { title: 'SKU动销/库存风险矩阵', purpose: 'Show which SKUs are both important and operationally fragile.' },
        { title: '月度GMV与库存指数联动', purpose: 'Show whether growth and inventory health are moving together or drifting apart.' },
        { title: '补货优先级队列', purpose: 'Show which replenishment actions should be handled first.' },
      ];
    case 'footfall-static-page':
      return [
        { title: '商场分区客流贡献', purpose: 'Show how total footfall is distributed across mall zones.' },
        { title: '重点分区客流梯队', purpose: 'Show the relative ranking of leading mall zones without exploding floor or room detail.' },
      ];
    case 'iot-static-page':
      return [
        { title: '模块/主题分布', purpose: 'Show repeated solution modules or capability clusters.' },
        { title: '文档类型分布', purpose: 'Show the dominant evidence composition.' },
      ];
    default:
      return [
        { title: '主题热点分布', purpose: 'Show repeated themes in the matched knowledge.' },
        { title: '文档类型分布', purpose: 'Show how the evidence set is composed.' },
      ];
  }
}

function inferDatavizSlotChartType(
  templateTaskHint: KnowledgeTemplateTaskHint | null | undefined,
  title: string,
  index: number,
) {
  const normalizedTitle = normalizeKeywordText(title);
  if (/trend|monthly|month|timeline|联动|趋势|月度|同比|环比/.test(normalizedTitle)) return 'line' as const;
  if (/queue|priority|梯队|ranking|排名|top|risk|风险|补货/.test(normalizedTitle)) return 'horizontal-bar' as const;

  switch (templateTaskHint) {
    case 'resume-comparison':
      return 'horizontal-bar';
    case 'bids-static-page':
      return index === 0 ? 'horizontal-bar' : 'bar';
    case 'order-static-page':
      if (index === 2) return 'line';
      if (index === 1 || index === 3) return 'horizontal-bar';
      return 'bar';
    case 'footfall-static-page':
      return index === 0 ? 'bar' : 'horizontal-bar';
    default:
      return 'bar';
  }
}

function buildDatavizSlotPlan(
  templateTaskHint: KnowledgeTemplateTaskHint | null | undefined,
  charts: ReportPlanChart[],
  sections: ReportPlanSection[],
) {
  const sectionAnchors = sections
    .map((item) => item.title)
    .filter((title) => title && !/AI综合分析/i.test(title));

  return charts.map((chart, index) => {
    const anchoredSection = index > 0
      ? sectionAnchors[Math.min(index, Math.max(sectionAnchors.length - 1, 0))]
      : undefined;
    const preferredChartType = inferDatavizSlotChartType(templateTaskHint, chart.title, index);
    return {
      key: normalizeDatavizSlotKey(chart.title),
      title: chart.title,
      purpose: chart.purpose,
      preferredChartType,
      placement: index === 0 ? 'hero' : 'section',
      sectionTitle: index === 0 ? undefined : anchoredSection,
      evidenceFocus: anchoredSection
        ? sections.find((item) => item.title === anchoredSection)?.evidenceFocus || chart.purpose
        : chart.purpose,
      minItems: preferredChartType === 'line' ? 3 : 2,
      maxItems: preferredChartType === 'horizontal-bar' ? 8 : 6,
    } satisfies ReportPlanDatavizSlot;
  });
}

function attachDatavizSlotsToSections(
  sections: ReportPlanSection[],
  datavizSlots: ReportPlanDatavizSlot[],
) {
  return sections.map((section) => ({
    ...section,
    datavizSlotKeys: datavizSlots
      .filter((slot) => slot.sectionTitle === section.title)
      .map((slot) => slot.key),
  }));
}

function buildPageSpec(
  templateTaskHint: KnowledgeTemplateTaskHint | null | undefined,
  preferredLayoutVariant: ReportPlanLayoutVariant | undefined,
  cards: ReportPlanCard[],
  sections: ReportPlanSection[],
  datavizSlots: ReportPlanDatavizSlot[],
): ReportPlanPageSpec {
  const layoutVariant: ReportPlanLayoutVariant = preferredLayoutVariant
    || (
    templateTaskHint === 'resume-comparison'
      ? 'talent-showcase'
      : templateTaskHint === 'bids-static-page'
        ? 'risk-brief'
        : templateTaskHint === 'order-static-page' || templateTaskHint === 'footfall-static-page'
          ? 'operations-cockpit'
          : templateTaskHint === 'paper-static-page'
            ? 'research-brief'
            : templateTaskHint === 'iot-static-page'
              ? 'solution-overview'
              : 'insight-brief'
    );
  return {
    layoutVariant,
    heroCardLabels: cards.map((item) => item.label),
    heroDatavizSlotKeys: datavizSlots
      .filter((slot) => slot.placement === 'hero')
      .map((slot) => slot.key),
    sections: sections.map((section) => ({
      title: section.title,
      purpose: section.purpose,
      completionMode: section.completionMode,
      datavizSlotKeys: section.datavizSlotKeys || [],
    })),
  };
}

function buildSectionPurpose(title: string) {
  if (/AI综合分析|综合分析/i.test(title)) {
    return {
      purpose: 'Add conservative synthesis and next-step guidance after the evidence sections.',
      evidenceFocus: 'Cross-section patterns, gaps, and business implications.',
      completionMode: 'knowledge-plus-model' as const,
    };
  }
  if (/建议|行动|应答|应对|补货|优先级/i.test(title)) {
    return {
      purpose: 'Turn evidence into a clear next-step recommendation.',
      evidenceFocus: 'High-confidence findings, gaps, and practical actions.',
      completionMode: 'knowledge-plus-model' as const,
    };
  }
  if (/风险|缺口|异常|波动/i.test(title)) {
    return {
      purpose: 'Highlight what can block delivery, understanding, or decision-making.',
      evidenceFocus: 'Risk signals, missing evidence, and unstable areas.',
      completionMode: 'knowledge-first' as const,
    };
  }
  if (/概览|概况|摘要|总览|渠道结构/i.test(title)) {
    return {
      purpose: 'Open with a clear conclusion and scope summary that a client can scan fast.',
      evidenceFocus: 'Library scope, coverage, and dominant signals.',
      completionMode: 'knowledge-plus-model' as const,
    };
  }
  return {
    purpose: 'Organize the matched evidence into a stable, presentation-ready block.',
    evidenceFocus: 'Strongest matched documents, grouped dimensions, and evidence excerpts.',
    completionMode: 'knowledge-first' as const,
  };
}

function buildKnowledgeScope(retrieval: RetrievalResult, libraries: Array<{ key?: string; label?: string }>) {
  const libraryLabels = libraries
    .map((item) => String(item.label || item.key || '').trim())
    .filter(Boolean);
  const detailedCount = retrieval.documents.filter(
    (item) => item.parseStage === 'detailed' || item.detailParseStatus === 'succeeded',
  ).length;
  const dominantTopics = countTopValues(retrieval.documents.flatMap((item) => Array.isArray(item.topicTags) ? item.topicTags : []));
  const dominantSchemas = countTopValues(retrieval.documents.map((item) => String(item.schemaType || item.category || 'generic')));

  return {
    libraryLabels,
    documentCount: retrieval.documents.length,
    detailedCount,
    dominantTopics,
    dominantSchemas,
  };
}

export function buildReportPlan(input: ReportPlannerInput): ReportPlan {
  const knowledgeScope = buildKnowledgeScope(input.retrieval, input.libraries);
  const envelope = resolveBaseEnvelope(input, knowledgeScope.libraryLabels);
  const sections = envelope.pageSections?.map((title) => {
    const sectionPlan = buildSectionPurpose(title);
    return {
      title,
      purpose: sectionPlan.purpose,
      evidenceFocus: sectionPlan.evidenceFocus,
      completionMode: sectionPlan.completionMode,
    };
  }) || [];
  const charts = buildChartPlan(input.templateTaskHint);
  const cards = buildCardPlan(input.templateTaskHint);
  const datavizSlots = buildDatavizSlotPlan(input.templateTaskHint, charts, sections);
  const sectionModules = attachDatavizSlotsToSections(sections, datavizSlots);
  const preferredLayoutVariant = input.selectedTemplates?.[0]?.template.preferredLayoutVariant;

  return {
    audience: 'client',
    templateMode: input.conceptPageMode ? 'concept-page' : 'shared-template',
    objective: buildObjective(input.templateTaskHint, knowledgeScope.libraryLabels),
    envelope,
    stylePriorities: [
      'summary-first and client-facing',
      'evidence-backed instead of decorative',
      'clear cards and sections before detailed prose',
      'conservative model completion with explicit uncertainty',
    ],
    evidenceRules: [
      'Use knowledge-library evidence as the primary source of truth.',
      'Prefer stronger and more recent evidence over broad but weak summarization.',
      'If evidence is missing, show the gap instead of fabricating metrics or facts.',
      'Keep the page readable for direct client or business review.',
      'Treat dataviz slots as planned modules, not decorative add-ons.',
    ],
    completionRules: [
      'The model may improve titles, summaries, and action wording, but it must stay bounded by matched evidence.',
      'Hard numbers, dates, and claims must come from the knowledge evidence or be labeled as uncertain.',
      'Recommendation sections can synthesize, but they must not invent unsupported business conclusions.',
      'When charts are produced, align them to the planned dataviz slots and keep chart semantics stable.',
    ],
    cards,
    charts,
    datavizSlots,
    sections: sectionModules,
    pageSpec: buildPageSpec(input.templateTaskHint, preferredLayoutVariant, cards, sectionModules, datavizSlots),
    knowledgeScope,
  };
}

export function buildReportPlanContextBlock(plan: ReportPlan) {
  return [
    'Report planner:',
    `Audience: ${plan.audience}`,
    `Template mode: ${plan.templateMode}`,
    `Objective: ${plan.objective}`,
    `Page title target: ${plan.envelope.title}`,
    `Knowledge libraries: ${plan.knowledgeScope.libraryLabels.join(' | ') || 'unknown'}`,
    `Evidence coverage: ${plan.knowledgeScope.documentCount} docs, ${plan.knowledgeScope.detailedCount} detailed`,
    plan.knowledgeScope.dominantTopics.length
      ? `Dominant topics: ${plan.knowledgeScope.dominantTopics.join(' | ')}`
      : '',
    plan.knowledgeScope.dominantSchemas.length
      ? `Dominant schemas: ${plan.knowledgeScope.dominantSchemas.join(' | ')}`
      : '',
    `Style priorities: ${plan.stylePriorities.join(' | ')}`,
    'Evidence rules:',
    ...plan.evidenceRules.map((item, index) => `${index + 1}. ${item}`),
    'Completion rules:',
    ...plan.completionRules.map((item, index) => `${index + 1}. ${item}`),
    'Planned cards:',
    ...plan.cards.map((item, index) => `${index + 1}. ${item.label} :: ${item.purpose}`),
    'Planned charts:',
    ...plan.charts.map((item, index) => `${index + 1}. ${item.title} :: ${item.purpose}`),
    'Planned dataviz slots:',
    ...plan.datavizSlots.map((item, index) => (
      `${index + 1}. ${item.title} :: type=${item.preferredChartType} :: placement=${item.placement}${item.sectionTitle ? ` :: section=${item.sectionTitle}` : ''} :: evidence=${item.evidenceFocus} :: items=${item.minItems}-${item.maxItems}`
    )),
    `Page spec layout: ${plan.pageSpec.layoutVariant}`,
    `Page spec hero cards: ${plan.pageSpec.heroCardLabels.join(' | ')}`,
    `Page spec hero dataviz: ${plan.pageSpec.heroDatavizSlotKeys.join(' | ') || '-'}`,
    'Page spec sections:',
    ...plan.pageSpec.sections.map((item, index) => (
      `${index + 1}. ${item.title} :: completion=${item.completionMode} :: dataviz=${item.datavizSlotKeys.join(' | ') || '-'}`
    )),
    'Planned sections:',
    ...plan.sections.map((item, index) => (
      `${index + 1}. ${item.title} :: purpose=${item.purpose} :: evidence=${item.evidenceFocus} :: completion=${item.completionMode} :: dataviz=${item.datavizSlotKeys?.join(' | ') || '-'}`
    )),
  ]
    .filter(Boolean)
    .join('\n');
}
