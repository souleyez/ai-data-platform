import type { DocumentCategoryConfig } from './document-config.js';
import { detectBizCategoryFromConfig } from './document-config.js';
import type { DocumentExtractionProfile } from './document-extraction-governance.js';
import { includesAnyText } from './document-schema.js';
import { RESUME_HINTS } from './document-parser-resume-fields.js';
import type { EnterpriseGuidanceFields } from './document-parser-guidance-fields.js';

type KeywordRule = string | RegExp;

const CATEGORY_HINTS: Record<'contract' | 'technical' | 'paper' | 'report', string[]> = {
  contract: ['contract', '合同', '协议', '条款', '付款', '甲方', '乙方', '采购'],
  technical: ['技术', '方案', '需求', '架构', '系统', '接口', '部署', '采集', '智能化', '白皮书', '知识库'],
  paper: ['paper', 'study', 'research', 'trial', 'randomized', 'placebo', 'abstract', 'introduction', 'methods', 'results', 'conclusion', 'mouse model', 'mice', 'zebrafish', '文献', '研究', '实验', '随机', '双盲'],
  report: ['report', '日报', '周报', '月报', '复盘'],
};

export type ParsedBizCategory = 'paper' | 'contract' | 'daily' | 'invoice' | 'order' | 'service' | 'inventory' | 'footfall' | 'general';
export type ParsedSchemaType = 'generic' | 'contract' | 'resume' | 'paper' | 'formula' | 'technical' | 'report' | 'order';

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesKeyword(text: string, rule: KeywordRule) {
  if (!text) return false;
  if (rule instanceof RegExp) return rule.test(text);

  const normalizedRule = rule.toLowerCase();
  if (!/[a-z]/.test(normalizedRule)) return text.includes(normalizedRule);

  return new RegExp(`\\b${escapeRegex(normalizedRule)}\\b`, 'i').test(text);
}

function scoreHints(evidence: string, hints: string[]) {
  return hints.reduce((score, hint) => score + (matchesKeyword(evidence, hint) ? (hint.length >= 6 ? 3 : 2) : 0), 0);
}

function buildEvidence(filePath: string, text = '') {
  const name = filePath.split(/[\\/]/).pop() || filePath;
  const normalizedText = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 8000);
  return `${filePath} ${name} ${normalizedText}`.toLowerCase();
}

export function detectCategory(filePath: string, text = '') {
  const evidence = buildEvidence(filePath, text);
  if (RESUME_HINTS.some((hint) => evidence.includes(hint.toLowerCase()))) return 'resume';
  if (includesAnyText(evidence, ['ioa', '审批', '操作指引', '应用技巧', '预算调整', 'q&a', 'faq'])) {
    return 'technical';
  }
  const scores = {
    contract: scoreHints(evidence, CATEGORY_HINTS.contract),
    technical: scoreHints(evidence, CATEGORY_HINTS.technical),
    paper: scoreHints(evidence, CATEGORY_HINTS.paper),
    report: scoreHints(evidence, CATEGORY_HINTS.report),
  };

  if (scores.contract >= 4 && scores.contract >= scores.paper) return 'contract';
  if (scores.paper >= 4 && scores.paper >= scores.technical) return 'paper';
  if (scores.report >= 4 && scores.report >= scores.technical) return 'report';
  if (scores.technical >= 3) return 'technical';

  const lower = filePath.toLowerCase();
  if (lower.includes('contract') || lower.includes('合同')) return 'contract';
  if (lower.includes('tech') || lower.includes('技术')) return 'technical';
  if (lower.includes('paper') || lower.includes('论文')) return 'paper';
  if (lower.includes('report') || lower.includes('日报') || lower.includes('周报')) return 'report';
  return 'general';
}

export function detectBizCategory(filePath: string, category: string, text = '', config?: DocumentCategoryConfig): ParsedBizCategory {
  if (config) {
    const matched = detectBizCategoryFromConfig(filePath, config);
    if (matched) return matched;
  }

  const evidence = buildEvidence(filePath, text);
  const hasFootfallMetricSignal = /(footfall|visitor_count|visitor count|visitors|traffic_count|entry_count|passenger_flow|客流|人流|到访量|进店客流|进入人数|进场人数|入场人数|离开人数)/i.test(evidence);
  const hasFootfallSpatialSignal = /(mall_zone|mall zone|mall_area|mall partition|shopping_zone|business_zone|floor_zone|floor zone|room_unit|shop_unit|shop_no|商场分区|商场区域|商业分区|楼层分区|楼层区域|楼层|单间|铺位|店铺|区域|位置|点位)/i.test(evidence);
  const hasOrderFieldSignal = /(order_id|order_count|units_sold|net_sales|gross_profit|gross_margin|avg_order_value|refund_total|discount_total|shop_name)/i.test(evidence);
  const hasInventoryFieldSignal = /(inventory_index|days_of_cover|safety_stock|replenishment_priority|risk_flag|platform_focus|warehouse|inbound_7d)/i.test(evidence);
  const hasFootfallPathSignal = /(?:footfall|visitor|traffic|客流|人流)[-_/\\]/i.test(filePath);
  const hasOrderPathSignal = /(?:order|orders|sales)[-_/\\]/i.test(filePath);
  const hasInventoryPathSignal = /(?:inventory|stock|sku)[-_/\\]/i.test(filePath);
  if (category === 'resume' || RESUME_HINTS.some((hint) => evidence.includes(hint.toLowerCase()))) return 'general';
  if (scoreHints(evidence, ['发票', '票据', '凭据', 'invoice']) >= 4) return 'invoice';
  if ((hasFootfallMetricSignal && hasFootfallSpatialSignal) || (hasFootfallPathSignal && hasFootfallMetricSignal)) return 'footfall';
  if (hasOrderFieldSignal) return 'order';
  if (hasInventoryFieldSignal) return 'inventory';
  if (hasInventoryPathSignal) return 'inventory';
  if (hasOrderPathSignal) return 'order';
  if (scoreHints(evidence, ['客流', '人流', '商场分区', '楼层分区', 'visitor', 'footfall']) >= 6) return 'footfall';
  if (scoreHints(evidence, ['订单', '回款', '销售', 'order']) >= 4) return 'order';
  if (scoreHints(evidence, ['客服', '工单', '投诉', 'service']) >= 4) return 'service';
  if (scoreHints(evidence, ['库存', 'sku', '出入库', 'inventory']) >= 4) return 'inventory';
  if (category === 'contract' || scoreHints(evidence, CATEGORY_HINTS.contract) >= 4) return 'contract';
  if (category === 'report' || scoreHints(evidence, CATEGORY_HINTS.report) >= 4) return 'daily';
  if (category === 'paper' || scoreHints(evidence, CATEGORY_HINTS.paper) >= 5) return 'paper';
  return 'general';
}

export function detectRiskLevel(text: string, category: string): 'low' | 'medium' | 'high' | undefined {
  if (category !== 'contract') return undefined;
  const normalized = text.toLowerCase();
  if (normalized.includes('违约') || normalized.includes('罚则') || normalized.includes('未约定')) return 'high';
  if (normalized.includes('付款') || normalized.includes('账期') || normalized.includes('期限')) return 'medium';
  return 'low';
}

export function detectTopicTags(text: string, category: string, bizCategory: ParsedBizCategory) {
  if (category === 'resume') {
    const normalized = text.toLowerCase();
    const tags = ['人才简历'];
    if (/(java|spring|backend|后端)/i.test(normalized)) tags.push('Java后端');
    if (/(产品经理|product manager|axure|xmind)/i.test(normalized)) tags.push('产品经理');
    if (/(算法|machine learning|deep learning)/i.test(normalized)) tags.push('算法工程师');
    if (/(前端|frontend|react|vue)/i.test(normalized)) tags.push('前端开发');
    if (/(技术总监|技术负责人|cto)/i.test(normalized)) tags.push('技术管理');
    return tags;
  }

  if (bizCategory === 'order' || bizCategory === 'inventory') {
    const normalized = text.toLowerCase();
    const tags = [bizCategory === 'inventory' ? '库存监控' : '订单分析'];
    if (/(tmall|jd|douyin|pinduoduo|kuaishou|wechatmall|天猫|京东|抖音|拼多多|快手|小程序)/i.test(normalized)) tags.push('渠道经营');
    if (/(sku|category|品类|类目|耳机|智能穿戴|智能家居|平板周边|手机配件|电脑外设)/i.test(normalized)) tags.push('SKU结构');
    if (/(inventory|stock|inventory_index|days_of_cover|safety_stock|库存|周转|安全库存)/i.test(normalized)) tags.push('库存管理');
    if (/(replenishment|restock|备货|补货|调拨|priority|优先级)/i.test(normalized)) tags.push('备货建议');
    if (/(yoy|mom|forecast|gmv|net_sales|gross_margin|同比|环比|预测|净销售额|毛利)/i.test(normalized)) tags.push('经营复盘');
    if (/(risk_flag|anomaly|warning|异常|风险|波动|overstock|stockout)/i.test(normalized)) tags.push('异常波动');
    return [...new Set(tags)];
  }

  if (bizCategory === 'footfall') {
    const normalized = text.toLowerCase();
    const tags = ['客流分析'];
    if (/(mall_zone|mall area|mall partition|shopping_zone|商场分区|商场区域|商业分区)/i.test(normalized)) tags.push('商场分区');
    if (/(floor_zone|floor area|floor partition|楼层分区|楼层区域|楼层)/i.test(normalized)) tags.push('楼层明细');
    if (/(room_unit|shop_unit|shop_no|单间|店铺|铺位|商户)/i.test(normalized)) tags.push('单间明细');
    if (/(visitor_count|visitors|footfall|traffic_count|entry_count|客流|人流|到访量)/i.test(normalized)) tags.push('客流报表');
    return [...new Set(tags)];
  }

  if (category !== 'technical' && category !== 'paper') return [];

  const normalized = text.toLowerCase();
  const tagRules: Array<[string, KeywordRule[]]> = [
    ['企业规范', ['规范', '制度', '标准', '合规']],
    ['审批流程', ['审批', '流程', '申请', '节点']],
    ['预算调整', ['预算调整', '预算', '调整']],
    ['系统操作', ['操作指引', '应用技巧', '登录', '入口', '路径']],
    ['常见问题', [/\bq&a\b/i, /\bfaq\b/i, '常见问题']],
    ['设备接入', ['接入', /\bdevice\b/i, '协议']],
    ['边缘计算', ['边缘', /\bedge\b/i]],
    ['数据采集', ['采集', /\bcollector\b/i]],
    ['告警联动', ['告警', '报警']],
    ['部署规范', ['部署', /\binstall\b/i]],
    ['接口设计', ['接口', /\bapi\b/i]],
    ['肠道健康', [/\bgut\b/i, /\bintestinal\b/i, '肠道', /\bibs\b/i, /\bflora\b/i, /\bmicrobiome\b/i]],
    ['过敏免疫', [/\ballergic\b/i, /\brhinitis\b/i, '过敏', '鼻炎', /\bimmune\b/i]],
    ['脑健康', [/\bbrain\b/i, '脑', '认知', /\balzheimer/i]],
    ['运动代谢', [/\bexercise\b/i, '减脂', '运动', /\bmetabolism\b/i, /weight loss/i]],
    ['奶粉配方', ['奶粉', '配方', '乳粉', '婴配粉', /\bformula\b/i, /\binfant\b/i, /\bpediatric\b/i]],
    ['益生菌', [/\bprobiotic\b/i, /\bprebiotic\b/i, /\bsynbiotic\b/i, /\blactobacillus\b/i, /\bbifidobacterium\b/i, '益生菌', '益生元', '菌株']],
    ['营养强化', [/\bnutrition\b/i, /\bnutritional\b/i, /\bhmo\b/i, /\bhmos\b/i, '营养', '强化']],
    ['白皮书', [/white\s*paper/i, '白皮书']],
    ['随机对照', [/\brandomized\b/i, /\bplacebo\b/i, /double-blind/i, '双盲', '随机']],
  ];

  return tagRules
    .filter(([, keywords]) => keywords.some((keyword) => matchesKeyword(normalized, keyword)))
    .map(([label]) => label);
}

export function shouldForceExtraction(
  profile: DocumentExtractionProfile | null | undefined,
  fieldSet: DocumentExtractionProfile['fieldSet'],
) {
  return profile?.fieldSet === fieldSet;
}

export function applyGovernedSchemaType(
  inferredSchemaType: ParsedSchemaType | undefined,
  profile: DocumentExtractionProfile | null | undefined,
): ParsedSchemaType | undefined {
  if (!profile?.fallbackSchemaType) return inferredSchemaType;
  if (inferredSchemaType === profile.fallbackSchemaType) return inferredSchemaType;

  if (profile.fallbackSchemaType === 'contract' && inferredSchemaType === 'generic') return 'contract';
  if (profile.fallbackSchemaType === 'resume' && inferredSchemaType === 'generic') return 'resume';
  if (profile.fallbackSchemaType === 'order' && ['generic', 'report'].includes(String(inferredSchemaType))) return 'order';
  if (profile.fallbackSchemaType === 'technical' && inferredSchemaType === 'generic') return 'technical';

  return inferredSchemaType;
}

export function applyGovernedSchemaTypeWithEnterpriseGuidance(
  inferredSchemaType: ParsedSchemaType | undefined,
  profile: DocumentExtractionProfile | null | undefined,
  enterpriseGuidanceFields: EnterpriseGuidanceFields | undefined,
): ParsedSchemaType | undefined {
  const governed = applyGovernedSchemaType(inferredSchemaType, profile);
  if (profile?.fieldSet !== 'enterprise-guidance') return governed;
  if (!enterpriseGuidanceFields) return governed;
  if (governed === 'resume' || governed === 'order') return governed;

  const hasGuidanceSignal = Boolean(
    enterpriseGuidanceFields.businessSystem
    || enterpriseGuidanceFields.documentKind
    || enterpriseGuidanceFields.applicableScope
    || enterpriseGuidanceFields.operationEntry
    || enterpriseGuidanceFields.approvalLevels?.length
    || enterpriseGuidanceFields.policyFocus?.length
    || enterpriseGuidanceFields.contacts?.length
  );

  if (hasGuidanceSignal && ['generic', 'contract', 'paper', 'report', 'technical'].includes(String(governed))) {
    return 'technical';
  }

  return governed;
}

export function mergeGovernedTopicTags(topicTags: string[], profile: DocumentExtractionProfile | null | undefined) {
  if (!profile) return topicTags;

  const governedTags = profile.fieldSet === 'contract'
    ? ['合同']
    : profile.fieldSet === 'resume'
      ? ['人才简历']
      : profile.fieldSet === 'order'
        ? ['订单分析']
        : ['企业规范'];

  return [...new Set([...topicTags, ...governedTags])];
}
