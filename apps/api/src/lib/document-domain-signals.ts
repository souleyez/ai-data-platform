import type { ParsedDocument } from './document-parser.js';

type DomainSignalItem = {
  name?: string;
  title?: string;
  summary?: string;
  excerpt?: string;
  category?: string;
  schemaType?: string;
  topicTags?: string[];
  groups?: string[];
  confirmedGroups?: string[];
  structuredProfile?: unknown;
  contractFields?: ParsedDocument['contractFields'];
};

const ORDER_SIGNAL_KEYWORDS = [
  'order',
  'sales',
  'channel',
  'tmall',
  'jd',
  'douyin',
  'amazon',
  'shopify',
  'gmv',
  '订单',
  '销量',
  '渠道',
  '销售',
  '交易额',
];

const INVENTORY_SIGNAL_KEYWORDS = [
  'inventory',
  'stock',
  'replenishment',
  'restock',
  'forecast',
  'safety stock',
  'inventory index',
  '库存',
  '补货',
  '备货',
  '断货',
  '周转',
  '预测',
  '安全库存',
  '库存指数',
];

const FOOTFALL_SIGNAL_KEYWORDS = [
  'footfall',
  'visitor',
  'visitors',
  'mall traffic',
  'mall zone',
  'shopping zone',
  'floor zone',
  'room unit',
  '客流',
  '人流',
  '商场分区',
  '楼层分区',
  '单间',
  '铺位',
];

const IOT_SIGNAL_KEYWORDS = [
  'iot',
  'gateway',
  'device',
  'sensor',
  'platform',
  'module',
  'integration',
  'deployment',
  'api',
  'interface',
  'solution',
  '物联网',
  '网关',
  '设备',
  '传感',
  '模块',
  '集成',
  '部署',
  '接口',
  '解决方案',
];

const PAPER_SIGNAL_KEYWORDS = [
  'paper',
  'study',
  'trial',
  'abstract',
  'methods',
  'results',
  'journal',
  'research',
  '论文',
  '研究',
  '试验',
  '摘要',
  '方法',
  '结果',
  '期刊',
];

const CONTRACT_SIGNAL_KEYWORDS = [
  'contract',
  'clause',
  'payment',
  'breach',
  'legal',
  '合同',
  '条款',
  '付款',
  '回款',
  '违约',
  '法务',
];

function normalizeText(value: unknown) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry || '').trim()).filter(Boolean);
}

export function getStructuredProfileRecord(item: { structuredProfile?: unknown }) {
  return item.structuredProfile && typeof item.structuredProfile === 'object' && !Array.isArray(item.structuredProfile)
    ? item.structuredProfile as Record<string, unknown>
    : {};
}

function getStructuredSignalValues(item: DomainSignalItem) {
  const profile = getStructuredProfileRecord(item);
  const signalKeys = [
    'reportFocus',
    'platforms',
    'platformSignals',
    'categorySignals',
    'metricSignals',
    'keyMetrics',
    'replenishmentSignals',
    'forecastSignals',
    'anomalySignals',
    'operatingSignals',
    'mallZones',
    'topMallZone',
    'aggregationLevel',
    'moduleSignals',
    'integrationSignals',
    'deploymentMode',
    'interfaceType',
    'valueSignals',
    'benefitSignals',
    'organizations',
  ];

  return signalKeys.flatMap((key) => {
    const value = profile[key];
    if (Array.isArray(value)) return toStringArray(value);
    const text = String(value || '').trim();
    return text ? [text] : [];
  });
}

export function getDocumentSignalText(item: DomainSignalItem) {
  return normalizeText([
    item.name,
    item.title,
    item.summary,
    item.excerpt,
    item.category,
    item.schemaType,
    ...(item.confirmedGroups || []),
    ...(item.groups || []),
    ...(item.topicTags || []),
    ...getStructuredSignalValues(item),
  ].join(' '));
}

function hasAnySignal(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

export function getDocumentReportFocus(item: DomainSignalItem) {
  const profile = getStructuredProfileRecord(item);
  return normalizeText(profile.reportFocus);
}

export function isOrderDocumentSignal(item: DomainSignalItem) {
  const category = normalizeText(item.category);
  const schemaType = normalizeText(item.schemaType);
  if (category === 'order') return true;
  if (schemaType === 'order') return true;
  if (getDocumentReportFocus(item) === 'order') return true;
  const text = getDocumentSignalText(item);
  if ((item.confirmedGroups || item.groups || []).some((group) => normalizeText(group).includes('order') || normalizeText(group).includes('订单'))) {
    return true;
  }
  const hasOrderSignal = hasAnySignal(text, ORDER_SIGNAL_KEYWORDS);
  if (!hasOrderSignal) return false;
  if (schemaType !== 'report') return true;
  const hasInventorySignal = hasAnySignal(text, INVENTORY_SIGNAL_KEYWORDS);
  return !hasInventorySignal || hasAnySignal(text, [
    'sales',
    'gmv',
    'net sales',
    'gross profit',
    'order count',
    'units sold',
    '销量',
    '销售',
    '交易额',
    '净销售额',
    '毛利',
  ]);
}

export function isInventoryDocumentSignal(item: DomainSignalItem) {
  if (normalizeText(item.category) === 'inventory') return true;
  if (getDocumentReportFocus(item) === 'inventory') return true;
  const text = getDocumentSignalText(item);
  if ((item.confirmedGroups || item.groups || []).some((group) => normalizeText(group).includes('inventory') || normalizeText(group).includes('库存'))) {
    return true;
  }
  return hasAnySignal(text, INVENTORY_SIGNAL_KEYWORDS);
}

export function isOrderInventoryDocumentSignal(item: DomainSignalItem) {
  return isOrderDocumentSignal(item) || isInventoryDocumentSignal(item);
}

export function isFootfallDocumentSignal(item: DomainSignalItem) {
  if (getDocumentReportFocus(item) === 'footfall') return true;
  const text = getDocumentSignalText(item);
  if ((item.confirmedGroups || item.groups || []).some((group) => {
    const normalized = normalizeText(group);
    return normalized.includes('footfall') || normalized.includes('客流') || normalized.includes('人流');
  })) {
    return true;
  }
  return normalizeText(item.schemaType) === 'report' && hasAnySignal(text, FOOTFALL_SIGNAL_KEYWORDS);
}

export function isContractDocumentSignal(item: DomainSignalItem) {
  if (normalizeText(item.schemaType) === 'contract' || normalizeText(item.category) === 'contract') return true;
  const contractFields = item.contractFields || {};
  if (typeof contractFields === 'object' && !Array.isArray(contractFields) && Object.values(contractFields).some((value) => String(value || '').trim())) {
    return true;
  }
  return hasAnySignal(getDocumentSignalText(item), CONTRACT_SIGNAL_KEYWORDS);
}

export function isPaperDocumentSignal(item: DomainSignalItem) {
  return normalizeText(item.schemaType) === 'paper'
    || normalizeText(item.category) === 'paper'
    || hasAnySignal(getDocumentSignalText(item), PAPER_SIGNAL_KEYWORDS);
}

export function isIotDocumentSignal(item: DomainSignalItem) {
  const schemaType = normalizeText(item.schemaType);
  const category = normalizeText(item.category);
  if (schemaType === 'technical' || category === 'technical') {
    return hasAnySignal(getDocumentSignalText(item), IOT_SIGNAL_KEYWORDS);
  }
  return false;
}

export function resolveDocumentSimilarityScopeKey(item: DomainSignalItem) {
  const groups = [...new Set((item.confirmedGroups?.length ? item.confirmedGroups : item.groups || []).map((group) => normalizeText(group)).filter(Boolean))];
  const schemaType = normalizeText(item.schemaType);
  const category = normalizeText(item.category);
  const reportFocus = getDocumentReportFocus(item);
  const domain =
    (isFootfallDocumentSignal(item) && 'footfall')
    || (isOrderDocumentSignal(item) && 'order')
    || (isInventoryDocumentSignal(item) && 'inventory')
    || (isContractDocumentSignal(item) && 'contract')
    || (isPaperDocumentSignal(item) && 'paper')
    || (isIotDocumentSignal(item) && 'iot')
    || reportFocus
    || schemaType
    || category
    || 'general';

  return [domain, groups[0] || 'ungrouped'].join('|');
}
