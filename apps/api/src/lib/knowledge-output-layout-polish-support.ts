import type { LayoutPolishDeps } from './knowledge-output-layout-polish-types.js';

const REPORT_TITLE_SIGNAL_PATTERN = /(报告|分析|静态页|驾驶舱|看板|概览|汇总|总览|表格|表|文档|方案|画像|清单|复盘|应答|总结)/u;
const WEAK_GENERATED_TITLE_PATTERN = /^(一个|某个|默认|示例|样例|测试|泛化)/u;
const TITLE_STOPWORDS = new Set([
  '请',
  '基于',
  '使用',
  '对',
  '将',
  '按',
  '生成',
  '输出',
  '一份',
  '一个',
  '知识库',
  '全部',
  '当前',
  '数据',
  '报告',
  '分析',
  '静态页',
  '表格',
  '文档',
  'page',
  'table',
]);

export function ensureSentence(value: unknown, deps: LayoutPolishDeps) {
  const text = deps.sanitizeText(value);
  if (!text) return '';
  return /[。！？.!?]$/.test(text) ? text : `${text}。`;
}

export function includesLayoutSignals(text: string, signals: string[], deps: LayoutPolishDeps) {
  const normalized = deps.normalizeText(text);
  return signals.filter((signal) => normalized.includes(deps.normalizeText(signal))).length;
}

export function looksLikeWeakSectionBody(value: string, deps: LayoutPolishDeps) {
  const text = deps.sanitizeText(value);
  if (!text) return true;
  if (deps.looksLikeJsonEchoText(text)) return true;
  return /^(内容|待补充|说明|暂无|略|详情|文字内容)$/u.test(text) || text.length <= 6;
}

export function looksLikeWeakChartTitle(value: string, deps: LayoutPolishDeps) {
  const title = deps.normalizeText(value);
  if (!title) return true;
  return /^(图表|chart|趋势图|对比图|分布图|数据图|可视化)\s*[-_#]?\s*\d*$/iu.test(title);
}

function extractMeaningfulTitleTokens(value: string, deps: LayoutPolishDeps) {
  return deps.normalizeText(value)
    .split(' ')
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && !TITLE_STOPWORDS.has(item));
}

function countTitleTokenOverlap(left: string, right: string, deps: LayoutPolishDeps) {
  const leftTokens = extractMeaningfulTitleTokens(left, deps);
  const rightTokens = new Set(extractMeaningfulTitleTokens(right, deps));
  if (!leftTokens.length || !rightTokens.size) return 0;
  return leftTokens.filter((token) => rightTokens.has(token)).length;
}

function extractSpecificTitleFragments(value: string, deps: LayoutPolishDeps) {
  return deps.sanitizeText(value)
    .split(/(?:分析报告|分析|报告|报表|静态页|驾驶舱|看板|概览|总览|汇总|清单|方案|文档|画像|订单|库存|补货|客流|商场|多渠道|sku|品类|渠道|平台)/iu)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
}

export function shouldPreferGeneratedTitle(
  input: {
    generatedTitle: string;
    requestText: string;
    fallbackTitle: string;
  },
  deps: LayoutPolishDeps,
) {
  const generatedTitle = deps.sanitizeText(input.generatedTitle);
  if (!generatedTitle || deps.looksLikeJsonEchoText(generatedTitle)) return false;

  const fallbackTitle = deps.sanitizeText(input.fallbackTitle);
  if (!fallbackTitle) return true;
  if (generatedTitle === fallbackTitle) return true;
  if (WEAK_GENERATED_TITLE_PATTERN.test(generatedTitle)) return false;

  const requestOverlap = countTitleTokenOverlap(generatedTitle, input.requestText, deps);
  const fallbackOverlap = countTitleTokenOverlap(fallbackTitle, input.requestText, deps);
  if (requestOverlap > fallbackOverlap) return true;

  const specificGeneratedFragments = extractSpecificTitleFragments(generatedTitle, deps);
  if (specificGeneratedFragments.some((fragment) => (
    input.requestText.includes(fragment)
    && !fallbackTitle.includes(fragment)
  ))) {
    return true;
  }

  if (requestOverlap > 0 && !REPORT_TITLE_SIGNAL_PATTERN.test(fallbackTitle)) return true;
  return false;
}
