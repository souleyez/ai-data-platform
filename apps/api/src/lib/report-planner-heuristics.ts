import type { KnowledgeTemplateTaskHint } from './knowledge-template.js';

const RESUME_HINT_KEYWORDS = ['resume', 'cv', '简历', '候选人', '人才'];
const BID_HINT_KEYWORDS = ['bids', 'bid', 'tender', 'rfp', 'proposal', '标书', '招标', '投标'];
const ORDER_HINT_KEYWORDS = ['order', 'orders', '订单', '销售', '销售', '库存', '备货', '电商'];
const FOOTFALL_HINT_KEYWORDS = ['footfall', 'visitor', 'visitors', 'mall traffic', '客流', '人流', '商场分区', '楼层分区', '单间', '铺位', '广州ai'];
const FORMULA_HINT_KEYWORDS = ['formula', '配方', '奶粉', '菌株', '益生菌'];
const PAPER_HINT_KEYWORDS = ['paper', 'papers', 'study', 'studies', 'journal', 'research', '论文', '学术论文', '研究', '期刊'];
const CONTRACT_HINT_KEYWORDS = ['contract', 'contracts', '合同', '条款', '法务'];
const IOT_HINT_KEYWORDS = ['iot', 'internet of things', '物联网', '边缘', '传感', '设备', '网关', '平台', '解决方案'];

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

export function normalizeKeywordText(...values: Array<string | undefined | null>) {
  return values
    .map((value) => String(value || ''))
    .join(' ')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasKeyword(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(normalizeKeywordText(keyword)));
}

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

export function inferReportPlanTaskHintByHeuristics(input: {
  requestText?: string;
  groupKey?: string;
  groupLabel?: string;
  templateKey?: string;
  templateLabel?: string;
  kind?: 'table' | 'page' | 'ppt' | 'pdf' | 'doc' | 'md';
}): KnowledgeTemplateTaskHint | null {
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

export function buildFallbackSections(templateTaskHint?: KnowledgeTemplateTaskHint | null) {
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

export function buildFallbackTitle(
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
