import type {
  ReportGroup,
  SharedReportTemplate,
} from './report-center.js';

type KnowledgeOutputKind = 'table' | 'page' | 'pdf' | 'ppt' | 'doc' | 'md';
type KnowledgeTemplateTaskHint =
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

export function mapOutputKindToTemplateType(kind: KnowledgeOutputKind): SharedReportTemplate['type'] {
  if (kind === 'page') return 'static-page';
  if (kind === 'ppt') return 'ppt';
  if (kind === 'pdf' || kind === 'doc' || kind === 'md') return 'document';
  return 'table';
}

export function scoreTemplateForGroup(
  template: SharedReportTemplate,
  group: ReportGroup,
  kind: KnowledgeOutputKind,
) {
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

export function inferTemplateTaskHintForGroup(
  group: ReportGroup | null | undefined,
  kind: KnowledgeOutputKind,
): KnowledgeTemplateTaskHint {
  if (!group) return 'general';

  if (isResumeGroup(group)) return 'resume-comparison';
  if (isBidGroup(group)) return kind === 'page' ? 'bids-static-page' : 'bids-table';
  if (isOrderGroup(group)) return 'order-static-page';
  if (isFootfallGroup(group)) return 'footfall-static-page';
  if (isFormulaGroup(group)) return kind === 'page' ? 'formula-static-page' : 'formula-table';
  if (isPaperGroup(group)) return kind === 'page' ? 'paper-static-page' : 'paper-table';
  if (isContractGroup(group)) return 'contract-risk';
  if (isIotGroup(group)) return kind === 'page' ? 'iot-static-page' : 'iot-table';
  return 'general';
}

export function mentionsCustomTemplateIntent(text: string) {
  return /(自定义模板|我的模板|上传模板|参考模板|按模板|使用模板)/i.test(text);
}

export function matchesTemplateName(requestText: string, template: SharedReportTemplate) {
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
