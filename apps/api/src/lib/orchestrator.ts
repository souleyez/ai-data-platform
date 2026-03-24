import { buildDocumentId, loadParsedDocuments, matchDocumentEvidenceByPrompt, matchDocumentsByPrompt, matchResumeDocuments, type DocumentEvidenceMatch } from './document-store.js';
import { loadDocumentLibraries } from './document-libraries.js';
import { buildBlockedPolicyAnswer, buildGeneralChatSystemPrompt, classifyChatPrompt } from './chat-policy.js';
import { resolveScenario, scenarios, type ScenarioKey } from './mock-data.js';
import { isOpenClawGatewayConfigured, isOpenClawGatewayReachable, runOpenClawChat } from './openclaw-adapter.js';
import type { ParsedDocument } from './document-parser.js';
import { createReportOutput, findReportGroupForPrompt, loadReportCenterState } from './report-center.js';

export type ChatRequestInput = {
  prompt: string;
  sessionUser?: string;
};

type FormulaTable = {
  title: string;
  subtitle: string;
  columns: string[];
  rows: string[][];
  notes?: string[];
  templateLabel?: string;
  groupLabel?: string;
};

type StaticPageCard = {
  label: string;
  value: string;
  note?: string;
};

type StaticPageSection = {
  title: string;
  body: string;
  bullets?: string[];
};

type StaticPageChart = {
  title: string;
  items: Array<{ label: string; value: number }>;
};

type StaticPageOutput = {
  summary: string;
  cards: StaticPageCard[];
  sections: StaticPageSection[];
  charts: StaticPageChart[];
};

type ChatOutput =
  | { type: 'answer'; title?: string; content?: string }
  | { type: 'table'; title: string; content?: string; table: FormulaTable }
  | { type: 'page'; title: string; content?: string; page: StaticPageOutput; format?: 'html' }
  | { type: 'ppt' | 'pdf'; title: string; content?: string; format: 'ppt' | 'pdf'; downloadUrl?: string };

type FormulaSegment =
  | 'human_infant'
  | 'human_child'
  | 'human_teen'
  | 'human_adult'
  | 'human_senior'
  | 'pet_cat_kitten'
  | 'pet_cat_adult'
  | 'pet_dog_puppy'
  | 'pet_dog_adult'
  | 'pet_generic';

type FormulaSegmentDecision = {
  segment: FormulaSegment | null;
  confident: boolean;
  source: 'local' | 'cloud' | 'default';
  notes?: string[];
};

type CloudFormulaAssist = {
  segment?: FormulaSegment;
  notes?: string[];
  summary?: string;
};

type KnowledgeScope = {
  libraryKeys: string[];
  libraryLabels: string[];
  scopedDocs: ParsedDocument[];
  hasScope: boolean;
};

type ResumeCompareRow = {
  candidate: string;
  role: string;
  years: string;
  education: string;
  skills: string;
  highlights: string;
};

const FORMULA_COLUMNS = ['模块', '建议原料', '建议添加量', '核心作用', '配方说明'];
const PET_FORMULA_PATTERN = /(\u5e7c\u732b|kitten|\u6210\u732b|adult cat|\u5e7c\u72ac|puppy|\u6210\u72ac|adult dog|\u5ba0\u7269|pet|\u732b|\u732b\u54aa|cat|\u72d7|\u72ac|\u72d7\u72d7|dog|canine)/i;
const PET_MILK_PATTERN = /(\u4e73\u54c1|\u5976\u5236\u54c1|\u4e73\u5236\u54c1|\u5976\u7c89|\u4e73\u7c89|\u732b\u5976|\u72ac\u5976|\u72d7\u5976|\u7f8a\u5976|\u7f8a\u5976\u7c89|milk|dairy)/i;
const KITTEN_PATTERN = /(\u5e7c\u732b|kitten|\u732b\u5d3d|\u5e7c\u5e74\u732b|\u65ad\u5976\u732b|\u79bb\u4e73\u732b)/i;
const ADULT_CAT_PATTERN = /(\u6210\u732b|\u6210\u5e74\u732b|adult cat)/i;
const PUPPY_PATTERN = /(\u5e7c\u72ac|puppy|\u5e7c\u5e74\u72ac|\u65ad\u5976\u72ac|\u79bb\u4e73\u72ac)/i;
const ADULT_DOG_PATTERN = /(\u6210\u72ac|\u6210\u5e74\u72ac|adult dog)/i;
const CAT_PATTERN = /(\u732b|\u732b\u54aa|cat|feline)/i;
const DOG_PATTERN = /(\u72d7|\u72ac|\u72d7\u72d7|dog|canine)/i;
const PET_PATTERN = /(\u5ba0\u7269|pet|\u4f34\u4fa3\u52a8\u7269)/i;
const MILK_PATTERN = /(\u5976\u7c89|\u4e73\u7c89|\u4e73\u54c1|\u5976\u5236\u54c1|\u4e73\u5236\u54c1|milk powder|milk formula|dairy|\u7f8a\u5976|\u7f8a\u5976\u7c89|\u732b\u5976|\u72ac\u5976|\u72d7\u5976)/i;
const RESUME_COMPARE_PATTERN = /(\u7b80\u5386|resume|cv|\u4eba\u624d|\u5019\u9009\u4eba).*(\u5bf9\u6bd4|\u5bf9\u7167|\u6bd4\u8f83|\u8868\u683c|table)|(\u5bf9\u6bd4|\u5bf9\u7167|\u6bd4\u8f83).*(\u7b80\u5386|resume|cv|\u4eba\u624d|\u5019\u9009\u4eba)/i;

function trimSentence(text: string, limit = 220) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= limit) return normalized;

  const sliced = normalized.slice(0, limit);
  const cut = Math.max(
    sliced.lastIndexOf('。'),
    sliced.lastIndexOf('；'),
    sliced.lastIndexOf('. '),
    sliced.lastIndexOf('! '),
    sliced.lastIndexOf('? '),
  );

  if (cut >= 40) return sliced.slice(0, cut + 1).trim();
  return `${sliced}...`;
}

function extractPromptFocus(prompt: string) {
  const text = prompt.toLowerCase();
  if (text.includes('结论')) return '结论';
  if (text.includes('实验对象') || text.includes('模型')) return '实验对象与模型';
  if (text.includes('价值')) return '主要价值';
  if (text.includes('适用场景')) return '适用场景';
  if (text.includes('区别') || text.includes('对比')) return '主要差异';
  if (text.includes('哪些') || text.includes('分类') || text.includes('分组') || text.includes('主题')) return '主题归纳';
  return '核心内容';
}

function buildPrimaryConclusion(prompt: string, item: ParsedDocument) {
  const focus = extractPromptFocus(prompt);
  const signals = [
    item.summary,
    item.excerpt,
    item.contractFields?.paymentTerms,
    item.contractFields?.duration,
  ].filter(Boolean).map((value) => trimSentence(String(value), 180));

  const main = signals.find(Boolean) || '当前命中文档已返回，但摘要证据仍然不足。';
  return `围绕“${focus}”来看，${item.name} 当前最直接给出的信息是：${main}`;
}

function buildMultiDocTakeaway(prompt: string, items: ParsedDocument[]) {
  const focus = extractPromptFocus(prompt);
  const grouped = items.map((item) => {
    const tags = item.topicTags?.slice(0, 3).join('、') || item.bizCategory;
    return `${item.name}（${tags}）`;
  });

  return `围绕“${focus}”，当前命中的材料主要集中在：${grouped.join('；')}。更细的判断以下方证据为准。`;
}

function buildStructuredReferenceList(item: ParsedDocument) {
  const slots = item.intentSlots || {};
  const normalizeList = (values?: string[]) => {
    const seen = new Set<string>();
    return (values || [])
      .map((value) => String(value || '').trim().replace(/\s+/g, ' ').replace(/^(\d+(?:\.\d+)?)\s*(mg|g|kg|ml|ug|iu|cfu)$/i, (_, n, u) => `${n} ${String(u).toUpperCase()}`))
      .filter((value) => {
        const key = value.toLowerCase();
        if (!value || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  };
  const parts = [
    normalizeList(slots.audiences).length ? `人群：${normalizeList(slots.audiences).slice(0, 3).join('、')}` : '',
    normalizeList(slots.ingredients).length ? `成分：${normalizeList(slots.ingredients).slice(0, 4).join('、')}` : '',
    normalizeList(slots.strains).length ? `菌株：${normalizeList(slots.strains).slice(0, 4).join('、')}` : '',
    normalizeList(slots.benefits).length ? `功效：${normalizeList(slots.benefits).slice(0, 4).join('、')}` : '',
    normalizeList(slots.doses).length ? `剂量：${normalizeList(slots.doses).slice(0, 4).join('、')}` : '',
    normalizeList(slots.organizations).length ? `机构：${normalizeList(slots.organizations).slice(0, 3).join('、')}` : '',
    normalizeList(slots.metrics).length ? `指标：${normalizeList(slots.metrics).slice(0, 4).join('、')}` : '',
  ].filter(Boolean);

  return parts.slice(0, 4);
}

function buildClaimReferenceList(item: ParsedDocument) {
  return (item.claims || [])
    .slice(0, 3)
    .map((claim) => `${claim.subject} ${claim.predicate} ${claim.object}`.trim())
    .filter(Boolean);
}

function formatStructuredHighlights(item: ParsedDocument) {
  return buildStructuredReferenceList(item).join('；');
}

function buildDocumentContext(items: ParsedDocument[]) {
  return items.map((item, index) => {
    const structuredSummary = formatStructuredHighlights(item);
    const extras = [
      `文档名：${item.name}`,
      `业务分类：${item.bizCategory}`,
      `解析分类：${item.category}`,
      `解析状态：${item.parseStatus}`,
      item.riskLevel ? `风险等级：${item.riskLevel}` : '',
      item.topicTags?.length ? `主题标签：${item.topicTags.join('、')}` : '',
      item.contractFields?.contractNo ? `合同编号：${item.contractFields.contractNo}` : '',
      item.contractFields?.amount ? `金额：${item.contractFields.amount}` : '',
      item.contractFields?.paymentTerms ? `付款条款：${item.contractFields.paymentTerms}` : '',
      item.contractFields?.duration ? `期限：${item.contractFields.duration}` : '',
      structuredSummary ? `结构化要点：${structuredSummary}` : '',
      `摘要：${item.summary}`,
      `证据摘录：${item.excerpt}`,
    ].filter(Boolean);

    return `资料 ${index + 1}\n${extras.join('\n')}`;
  });
}

function buildEvidenceContext(matches: DocumentEvidenceMatch[]) {
  return matches.map((match, index) => {
    const item = match.item;
    const structuredSummary = formatStructuredHighlights(item);
    return [
      `证据 ${index + 1}`,
      `文档名：${item.name}`,
      `文档标题：${item.title}`,
      `业务分类：${item.bizCategory}`,
      `解析来源：${item.parseMethod || item.parseStatus}`,
      item.topicTags?.length ? `主题标签：${item.topicTags.join('、')}` : '',
      structuredSummary ? `结构化要点：${structuredSummary}` : '',
      `证据摘录：${trimSentence(match.chunkText, 320)}`,
    ].filter(Boolean).join('\n');
  });
}

function buildReferencePayload(matches: DocumentEvidenceMatch[]) {
  const canonicalName = (value: string) => String(value || '')
    .replace(/^\d{10,}-/, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  const grouped = new Map<string, {
    id: string;
    name: string;
    summary: string;
    category: string;
    parseMethod?: string;
    riskLevel?: string;
    topicTags?: string[];
    structured?: string[];
    claims?: string[];
    evidence: string[];
  }>();

  for (const match of matches) {
    const key = canonicalName(match.item.title || match.item.name);
    const existing = grouped.get(key);
    const snippet = trimSentence(match.chunkText, 220);
    if (existing) {
      if (snippet && !existing.evidence.includes(snippet) && existing.evidence.length < 3) {
        existing.evidence.push(snippet);
      }
      continue;
    }

    grouped.set(key, {
      id: buildDocumentId(match.item.path),
      name: match.item.name,
      summary: match.item.summary,
      category: match.item.category,
      parseMethod: match.item.parseMethod,
      riskLevel: match.item.riskLevel,
      topicTags: match.item.topicTags,
      structured: buildStructuredReferenceList(match.item),
      claims: buildClaimReferenceList(match.item),
      evidence: snippet ? [snippet] : [],
    });
  }

  return [...grouped.values()];
}

function buildCanonicalDocIdentity(item: ParsedDocument | { title?: string; name?: string }) {
  return String(item.title || item.name || '')
    .replace(/^\d{10,}-/, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function dedupeEvidenceMatches(matches: DocumentEvidenceMatch[]) {
  const deduped: DocumentEvidenceMatch[] = [];
  const seen = new Set<string>();
  for (const match of matches) {
    const key = buildCanonicalDocIdentity(match.item);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(match);
  }
  return deduped;
}

function extractReadablePromptFocus(prompt: string) {
  const text = String(prompt || '').toLowerCase();
  if (/(contract|\u5408\u540c|\u6cd5\u52a1|\u6761\u6b3e|\u98ce\u9669)/i.test(text)) return '合同风险概览';
  if (/(formula|\u5976\u7c89|\u914d\u65b9|\u8425\u517b)/i.test(text)) return '配方方案对比';
  if (/(gut|\u80a0\u9053|\u809a\u80a0)/i.test(text)) return '肠道健康分析';
  if (/(brain|\u8111|\u8ba4\u77e5)/i.test(text)) return '脑健康主题分析';
  if (/(allergy|\u8fc7\u654f|\u514d\u75ab)/i.test(text)) return '过敏免疫分析';
  if (text.includes('结论')) return '核心结论';
  if (text.includes('实验对象') || text.includes('模型')) return '实验对象与模型';
  if (text.includes('价值')) return '主要价值';
  if (text.includes('适用场景')) return '适用场景';
  if (text.includes('区别') || text.includes('对比')) return '主要差异';
  if (text.includes('哪些') || text.includes('分类') || text.includes('分组') || text.includes('主题')) return '主题归纳';
  return '核心内容';
}

function buildEvidenceDrivenConclusion(prompt: string, matchedDocs: ParsedDocument[], evidenceMatches: DocumentEvidenceMatch[]) {
  const focus = extractReadablePromptFocus(prompt);
  if (!matchedDocs.length) {
    return '当前没有命中可直接支撑回答的文档资料。';
  }

  if (evidenceMatches.length) {
    const best = [...evidenceMatches].sort((a, b) => scoreConclusionEvidence(b.chunkText) - scoreConclusionEvidence(a.chunkText))[0];
    return `围绕“${focus}”来看，当前最直接的证据来自《${best.item.name}》：${trimSentence(best.chunkText, 180)}`;
  }

  if (matchedDocs.length === 1) {
    return `围绕“${focus}”来看，当前命中的核心资料是《${matchedDocs[0].name}》：${trimSentence(matchedDocs[0].summary || matchedDocs[0].excerpt, 180)}`;
  }

  const names = matchedDocs.slice(0, 3).map((item) => `《${item.name}》`).join('、');
  return `围绕“${focus}”，当前主要参考的资料包括 ${names}，下面按证据摘录给出归纳。`;
}

function scoreConclusionEvidence(text: string) {
  const value = String(text || '').toLowerCase();
  if (!value) return -100;

  let score = 0;
  if (/(abstract|summary|results?|conclusions?|discussion|结论|结果|摘要|研究发现|主要发现)/i.test(value)) score += 12;
  if (/(modulates|improved|reduced|increased|significant|retained|supports?|促进|改善|降低|提高|显著)/i.test(value)) score += 8;
  if (/(introduction|background|author|affiliation|copyright|received|accepted|correspondence|通讯作者|作者单位)/i.test(value)) score -= 10;
  if (/@/.test(value)) score -= 8;
  if ((value.match(/\d/g) || []).length > Math.max(20, value.length * 0.18)) score -= 4;
  return score;
}

function buildStructuredAnswerLines(items: ParsedDocument[]) {
  const primary = items[0];
  if (!primary) return [] as string[];

  const slots = primary.intentSlots || {};
  const claims = (primary.claims || []).slice(0, 3).map((claim) => `${claim.subject} ${claim.predicate} ${claim.object}`.trim());
  const lines = [
    slots.audiences?.length ? `- 适用人群：${slots.audiences.slice(0, 3).join('、')}` : '',
    slots.strains?.length ? `- 关键菌株：${slots.strains.slice(0, 4).join('、')}` : '',
    slots.ingredients?.length ? `- 相关成分：${slots.ingredients.slice(0, 4).join('、')}` : '',
    slots.benefits?.length ? `- 主要功效：${slots.benefits.slice(0, 4).join('、')}` : '',
    slots.doses?.length ? `- 相关剂量/规格：${slots.doses.slice(0, 4).join('、')}` : '',
    claims.length ? `- 抽取关系：${claims.join('；')}` : '',
  ].filter(Boolean);

  return lines.slice(0, 5);
}

function buildEvidenceDrivenAnswer(prompt: string, matchedDocs: ParsedDocument[], evidenceMatches: DocumentEvidenceMatch[] = []) {
  if (!matchedDocs.length) {
    return [
      '当前没有命中可支撑回答的知识库资料。',
      '你可以换一种问法，或者先把相关资料上传到文档中心后再继续提问。',
    ].join('\n');
  }

  const uniqueEvidenceMatches = dedupeEvidenceMatches(evidenceMatches).slice(0, 5);
  const conclusion = buildEvidenceDrivenConclusion(prompt, matchedDocs, uniqueEvidenceMatches);
  const structuredLines = buildStructuredAnswerLines(matchedDocs);
  const evidenceLines = uniqueEvidenceMatches.map((match, index) => {
    const tags = (match.item.topicTags || []).slice(0, 3).join('、');
    return [
      `${index + 1}. ${match.item.name}`,
      `- 证据：${trimSentence(match.chunkText, 220)}`,
      `- 解析来源：${match.item.parseMethod || match.item.parseStatus}`,
      tags ? `- 主题：${tags}` : '',
    ].filter(Boolean).join('\n');
  });

  const fallbackEvidence = !evidenceLines.length
    ? matchedDocs.slice(0, 3).map((item, index) => [
        `${index + 1}. ${item.name}`,
        `- 摘要：${trimSentence(item.summary, 160)}`,
        `- 摘录：${trimSentence(item.excerpt, 220)}`,
      ].join('\n'))
    : [];

  return [
    '已优先依据文档中心资料生成回答。',
    '',
    `结论：${conclusion}`,
    ...(structuredLines.length ? ['', '结构化归纳：', ...structuredLines] : []),
    '',
    '参考证据：',
    ...(evidenceLines.length ? evidenceLines : fallbackEvidence),
  ].join('\n');
}

function getDocumentGroups(item: ParsedDocument) {
  return [...new Set((item.confirmedGroups?.length ? item.confirmedGroups : item.groups || []).filter(Boolean))];
}

function matchLibrariesForPrompt(
  prompt: string,
  libraries: Array<{ key: string; label: string; description?: string }>,
) {
  const text = prompt.toLowerCase();
  return libraries.filter((library) => {
    const candidates = [library.key, library.label, library.description].filter(Boolean).map((value) => String(value).toLowerCase());
    return candidates.some((value) => value && (text.includes(value) || value.includes(text)));
  });
}

function resolveKnowledgeScope(
  prompt: string,
  items: ParsedDocument[],
  matchedDocs: ParsedDocument[],
  libraries: Array<{ key: string; label: string; description?: string }>,
): KnowledgeScope {
  const promptLibraries = matchLibrariesForPrompt(prompt, libraries);
  const groupKeys = new Set<string>(promptLibraries.map((item) => item.key));

  for (const item of matchedDocs) {
    for (const group of getDocumentGroups(item)) groupKeys.add(group);
  }

  let scopedDocs = matchedDocs.filter((item) => getDocumentGroups(item).some((group) => groupKeys.has(group)));
  if (!scopedDocs.length && groupKeys.size) {
    const groupScopedItems = items.filter((item) => getDocumentGroups(item).some((group) => groupKeys.has(group)));
    scopedDocs = matchDocumentsByPrompt(groupScopedItems, prompt);
    if (!scopedDocs.length) scopedDocs = groupScopedItems;
  }

  const libraryMap = new Map(libraries.map((item) => [item.key, item.label]));
  const libraryKeys = [...groupKeys];
  const libraryLabels = libraryKeys.map((key) => libraryMap.get(key) || key);

  return {
    libraryKeys,
    libraryLabels,
    scopedDocs,
    hasScope: libraryKeys.length > 0 && scopedDocs.length > 0,
  };
}

function buildScopeLabel(scope: KnowledgeScope) {
  if (!scope.libraryLabels.length) return '当前知识库';
  return scope.libraryLabels.join('、');
}

function buildKnowledgeScopeGuardAnswer(scope: KnowledgeScope) {
  const label = buildScopeLabel(scope);
  return [
    `当前问题没有稳定命中知识库范围，暂不输出 ${label} 之外的内容。`,
    '请换一种问法，或先在文档中心把相关资料加入合适的知识库分组后再提问。',
  ].join('\n');
}

function extractScopeTokens(prompt: string) {
  const normalized = prompt.toLowerCase();
  const asciiTokens = normalized.match(/[a-z0-9][a-z0-9-]{2,}/g) ?? [];
  const chineseTokens = normalized.match(/[\u4e00-\u9fff]{2,}/g) ?? [];
  return [...new Set([...asciiTokens, ...chineseTokens])];
}

function hasStrongDocumentScope(prompt: string, matchedDocs: ParsedDocument[]) {
  if (!matchedDocs.length) return false;
  const tokens = extractScopeTokens(prompt);
  if (!tokens.length) return false;

  return matchedDocs.some((item) => {
    const haystack = [
      item.name,
      item.title,
      item.summary,
      item.excerpt,
      item.bizCategory,
      item.category,
      ...(item.topicTags || []),
      ...getDocumentGroups(item),
    ]
      .join(' ')
      .toLowerCase();

    const hits = tokens.filter((token) => haystack.includes(token));
    if (hits.length >= 2) return true;
    return hits.length === 1 && hits[0].length >= 4;
  });
}

function buildScopedSystemPrompt(scope: KnowledgeScope, extraLines: string[] = []) {
  const lines = [
    '你是知识库范围内的只读问答助手。',
    `当前允许使用的知识库范围：${buildScopeLabel(scope)}。`,
    '只能基于命中的知识库分组、命中文档和给定上下文回答。',
    '如果用户要求超出知识库范围的建议、执行动作、系统操作、联网调查或其他外部能力，必须拒绝，并明确说明“当前知识库未覆盖”。',
    '如果证据不足，只能回答“当前知识库未覆盖”或“不足以判断”，不要自由发挥，不要补充分组外常识。',
    ...extraLines,
  ];

  return lines.join('\n');
}

function buildMeta(scenarioKey: ScenarioKey, matchedDocs: ParsedDocument[], mode: 'openclaw' | 'fallback') {
  const scenario = scenarios[scenarioKey];
  const parts: string[] = [scenario.source];
  if (matchedDocs.length) parts.push(`命中文档 ${matchedDocs.length} 篇`);
  parts.push(mode === 'openclaw' ? '分析链路：云端模型增强' : '分析链路：本地AI');
  return parts.join(' / ');
}

function buildLibraryPayload(scope: KnowledgeScope) {
  return scope.libraryKeys.map((key, index) => ({
    key,
    label: scope.libraryLabels[index] || key,
  }));
}

function isVisualizationPrompt(prompt: string) {
  return /(\u53ef\u89c6\u5316|\u56fe\u8868|\u4eea\u8868\u76d8|dashboard|chart|visual)/i.test(String(prompt || ''));
}

function isPageReportPrompt(prompt: string) {
  return /(\u62a5\u8868|\u6982\u89c8|\u603b\u7ed3|\u9875\u9762|\u9759\u6001\u9875|page|dashboard)/i.test(String(prompt || ''));
}

function isTableReportPrompt(prompt: string) {
  return /(\u8868\u683c|\u8868\u5355|table|csv|\u6e05\u5355)/i.test(String(prompt || ''));
}

function isKnowledgeReportPrompt(prompt: string) {
  return /(\u77e5\u8bc6\u5e93|\u6587\u6863|\u6587\u732e|\u8d44\u6599|\u89e3\u6790|\u5f52\u7eb3|\u603b\u7ed3|\u62a5\u8868|\u53ef\u89c6\u5316|\u56fe\u8868|\u9759\u6001\u9875|dashboard|report|chart|table|page|pdf|ppt)/i
    .test(String(prompt || ''));
}

function looksLikeEncodingComplaint(content: string) {
  return /(\u4e71\u7801|\u8f93\u5165\u6cd5|\u7528\u82f1\u6587|\u91cd\u65b0\u6253\u5b57|\u622a\u56fe\u53d1\u7ed9\u6211)/i
    .test(String(content || ''));
}

function inferPreferredLibraryKeys(
  prompt: string,
  libraries: Array<{ key: string; label: string; description?: string }>,
) {
  const text = String(prompt || '').toLowerCase();
  const matches = new Set<string>();

  for (const library of libraries) {
    const haystack = `${library.key} ${library.label} ${library.description || ''}`.toLowerCase();
    if (text.includes(library.key.toLowerCase()) || text.includes(library.label.toLowerCase())) {
      matches.add(library.key);
      continue;
    }
    if (/(\u5408\u540c|contract|\u6cd5\u52a1|\u6761\u6b3e|\u98ce\u9669)/i.test(text) && /(\u5408\u540c|contract)/i.test(haystack)) {
      matches.add(library.key);
    }
    if (/(\u5976\u7c89|\u914d\u65b9|formula|\u8425\u517b)/i.test(text) && /(\u5976\u7c89|\u914d\u65b9|formula)/i.test(haystack)) {
      matches.add(library.key);
    }
    if (/(\u80a0\u9053|gut)/i.test(text) && /(gut|\u80a0\u9053)/i.test(haystack)) {
      matches.add(library.key);
    }
    if (/(\u8111|brain|\u8ba4\u77e5)/i.test(text) && /(brain|\u8111)/i.test(haystack)) {
      matches.add(library.key);
    }
  }

  return [...matches];
}

function documentMatchesLibraryKey(item: ParsedDocument, key: string) {
  const haystack = [
    item.name,
    item.title,
    item.summary,
    item.excerpt,
    item.bizCategory,
    item.category,
    ...(item.topicTags || []),
    ...getDocumentGroups(item),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const normalizedKey = String(key || '').toLowerCase();

  if (normalizedKey === 'contract') return /(\u5408\u540c|contract|\u6761\u6b3e|\u6cd5\u52a1)/i.test(haystack);
  if (normalizedKey === '奶粉配方建议') return /(\u5976\u7c89|\u914d\u65b9|formula|\u8425\u517b|\u76ca\u751f\u83cc)/i.test(haystack);
  if (normalizedKey === 'gut-health') return /(\u80a0\u9053|gut)/i.test(haystack);
  if (normalizedKey === 'brain-health') return /(\u8111|brain|\u8ba4\u77e5)/i.test(haystack);

  return haystack.includes(normalizedKey);
}

function documentMatchesAnyLibrary(item: ParsedDocument, libraryKeys: string[]) {
  return libraryKeys.some((key) => documentMatchesLibraryKey(item, key));
}

function buildExpandedKnowledgeScope(
  prompt: string,
  items: ParsedDocument[],
  initialMatchedDocs: ParsedDocument[],
  libraries: Array<{ key: string; label: string; description?: string }>,
  preferredLibraryKeys: string[] = [],
): KnowledgeScope {
  let scopedDocs = initialMatchedDocs.length
    ? initialMatchedDocs
    : matchDocumentsByPrompt(items, prompt).slice(0, 18);

  if (preferredLibraryKeys.length && scopedDocs.length) {
    const filtered = scopedDocs.filter((item) => (
      getDocumentGroups(item).some((group) => preferredLibraryKeys.includes(group)) ||
      documentMatchesAnyLibrary(item, preferredLibraryKeys)
    ));
    if (filtered.length) scopedDocs = filtered;
  }

  if (!scopedDocs.length && preferredLibraryKeys.length) {
    scopedDocs = items
      .filter((item) => (
        getDocumentGroups(item).some((group) => preferredLibraryKeys.includes(group)) ||
        documentMatchesAnyLibrary(item, preferredLibraryKeys)
      ))
      .slice(0, 18);
  }

  if (!scopedDocs.length) {
    scopedDocs = items
      .filter((item) => getDocumentGroups(item).length > 0)
      .slice(0, 18);
  }

  const docGroupKeys = [...new Set(scopedDocs.flatMap((item) => getDocumentGroups(item)).filter(Boolean))];
  const libraryMap = new Map(libraries.map((item) => [item.key, item.label]));
  const libraryKeys = docGroupKeys.length ? docGroupKeys : libraries.map((item) => item.key);
  const libraryLabels = libraryKeys.map((key) => libraryMap.get(key) || key);

  return {
    libraryKeys,
    libraryLabels,
    scopedDocs,
    hasScope: scopedDocs.length > 0,
  };
}

function buildTopicDistribution(items: ParsedDocument[]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const tags = item.topicTags?.length ? item.topicTags.slice(0, 2) : [item.bizCategory || item.category];
    for (const tag of tags) {
      const key = String(tag || '').trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, value]) => ({ label, value }));
}

function buildRiskDistribution(items: ParsedDocument[]) {
  const levels = ['high', 'medium', 'low', 'unknown'];
  return levels
    .map((level) => ({
      label: level === 'high' ? '高风险' : level === 'medium' ? '中风险' : level === 'low' ? '低风险' : '未标注',
      value: items.filter((item) => String(item.riskLevel || 'unknown').toLowerCase() === level).length,
    }))
    .filter((entry) => entry.value > 0);
}

function buildStaticPageOutput(prompt: string, scope: KnowledgeScope, matchedDocs: ParsedDocument[], evidenceMatches: DocumentEvidenceMatch[]): ChatOutput {
  const focus = extractReadablePromptFocus(prompt);
  const topDocs = matchedDocs.slice(0, 4);
  const evidence = dedupeEvidenceMatches(evidenceMatches).slice(0, 4);
  const topicDistribution = buildTopicDistribution(matchedDocs);
  const riskDistribution = buildRiskDistribution(matchedDocs);

  return {
    type: 'page',
    title: `${focus}静态页`,
    format: 'html',
    content: buildEvidenceDrivenConclusion(prompt, matchedDocs, evidenceMatches),
    page: {
      summary: `基于 ${buildScopeLabel(scope)} 内命中的 ${matchedDocs.length} 份文档整理，适合作为可转发的静态分析页。`,
      cards: [
        { label: '命中文档', value: String(matchedDocs.length), note: buildScopeLabel(scope) },
        { label: '知识库', value: String(scope.libraryLabels.length || 1), note: scope.libraryLabels.join('、') || '当前范围' },
        { label: '证据片段', value: String(evidence.length), note: '用于支持本次归纳' },
        { label: '主题数', value: String(topicDistribution.length), note: '按主题聚合' },
      ],
      sections: [
        {
          title: '结论摘要',
          body: buildEvidenceDrivenConclusion(prompt, matchedDocs, evidenceMatches),
          bullets: buildStructuredAnswerLines(matchedDocs),
        },
        {
          title: '重点文档',
          body: '以下文档是当前结论的主要支撑。',
          bullets: topDocs.map((item) => `${item.name}：${trimSentence(item.summary || item.excerpt, 90)}`),
        },
      ],
      charts: [
        { title: '主题分布', items: topicDistribution },
        { title: '风险分布', items: riskDistribution.length ? riskDistribution : [{ label: '未标注', value: matchedDocs.length }] },
      ],
    },
  };
}

function isResumeComparePrompt(prompt: string) {
  return RESUME_COMPARE_PATTERN.test(String(prompt || ''));
}

function extractResumeField(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1] || match?.[2];
    if (value) return String(value).replace(/\s+/g, ' ').trim();
  }
  return '';
}

function pickResumeSkills(text: string) {
  const keywords = [
    'Java', 'Python', 'Go', 'C++', 'SQL', 'MySQL', 'PostgreSQL', 'Redis', 'Kafka',
    'React', 'Vue', 'Node.js', 'Node', 'TypeScript', 'JavaScript', 'Spring Boot',
    '微服务', '分布式', '机器学习', '数据分析', '产品设计', '用户研究', '运营增长',
    '销售管理', '项目管理', '供应链', '财务分析', '品牌营销', '招聘', '绩效管理',
  ];
  const hits = keywords.filter((keyword) => new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text));
  return [...new Set(hits)].slice(0, 6).join(' / ');
}

function inferResumeRole(text: string) {
  const patterns: Array<[RegExp, string]> = [
    [/(java\s*后端|java backend|后端开发)/i, 'Java后端'],
    [/(前端开发|frontend|react|vue)/i, '前端开发'],
    [/(产品经理|product manager)/i, '产品经理'],
    [/(算法工程师|machine learning|深度学习)/i, '算法工程师'],
    [/(数据分析|data analyst|商业分析)/i, '数据分析'],
    [/(运营|growth|增长)/i, '运营'],
    [/(销售|客户成功|business development)/i, '销售/商务'],
    [/(hr|招聘|人力资源)/i, '人力资源'],
    [/(设计师|ui\/ux|视觉设计)/i, '设计'],
  ];
  const found = patterns.find(([pattern]) => pattern.test(text));
  return found?.[1] || '';
}

function looksLikeResumeDocument(item: ParsedDocument) {
  const evidence = `${item.name} ${item.title} ${(item.topicTags || []).join(' ')} ${item.summary}`.toLowerCase();
  return item.category === 'resume'
    || evidence.includes('人才简历')
    || /\b(?:resume|cv)\b/i.test(evidence)
    || evidence.includes('简历')
    || evidence.includes('候选人');
}

function isLikelyPersonName(value: string) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (/@/.test(text) || /\d{5,}/.test(text)) return false;
  if (/联系电话|电话|手机|邮箱|email/i.test(text)) return false;
  if (['我的', '简历', '个人简历', '联系电话'].includes(text)) return false;
  return /^[\u4e00-\u9fff·]{2,12}$/.test(text) || /^[A-Za-z][A-Za-z\s.-]{1,40}$/.test(text);
}

function inferResumeNameFromTitle(value: string) {
  const normalized = String(value || '')
    .replace(/^\d{10,}-/, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  const afterResume = normalized.match(/简历[\s\-_(（]*([\u4e00-\u9fff·]{2,12})/);
  if (afterResume?.[1] && afterResume[1] !== '我的') return afterResume[1];
  const beforeResume = normalized.match(/([\u4e00-\u9fff·]{2,12})[\s\-]*简历/);
  if (beforeResume?.[1] && beforeResume[1] !== '我的') return beforeResume[1];
  const candidates = normalized.match(/[\u4e00-\u9fff·]{2,12}/g) || [];
  return candidates.find((item) => item !== '我的' && item !== '简历') || normalized;
}

function inferResumeNameFromDocument(item: ParsedDocument) {
  const candidates = [item.name, item.title];
  for (const value of candidates) {
    const inferred = inferResumeNameFromTitle(value);
    if (isLikelyPersonName(inferred)) return inferred;
  }
  return '';
}

function inferResumeRoleFromDocument(item: ParsedDocument) {
  const evidence = `${item.name} ${item.title}`;
  const parenMatch = evidence.match(/[（(]([^()（）]{2,40})[)）]/);
  if (parenMatch?.[1]) return parenMatch[1].replace(/^原/, '').trim();
  return inferResumeRole(evidence);
}

function buildResumeHighlights(item: ParsedDocument) {
  return (item.resumeFields?.highlights || []).slice(0, 2).join('；')
    || trimSentence(item.summary || item.excerpt, 80)
    || '待补充';
}

function extractResumeCompareRow(item: ParsedDocument): ResumeCompareRow {
  const resume = item.resumeFields;
  const sourceText = [
    item.title,
    item.summary,
    item.excerpt,
    item.fullText,
    ...(item.topicTags || []),
  ]
    .filter(Boolean)
    .join('\n');
  const compactText = String(sourceText || '').replace(/\s+/g, ' ').trim();
  const normalizedTitle = String(item.name || item.title || '')
    .replace(/^\d{10,}-/, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .trim();

  const rawCandidate = resume?.candidateName || inferResumeNameFromDocument(item) || extractResumeField(compactText, [
    /(?:姓名|name)[:：]?\s*([A-Za-z\u4e00-\u9fff·]{2,20})/i,
    /(?:候选人)[:：]?\s*([A-Za-z\u4e00-\u9fff·]{2,20})/i,
  ]) || inferResumeNameFromTitle(normalizedTitle);
  const candidate = isLikelyPersonName(rawCandidate) ? rawCandidate : (inferResumeNameFromDocument(item) || inferResumeNameFromTitle(normalizedTitle));

  const role = resume?.targetRole || resume?.currentRole || inferResumeRoleFromDocument(item) || extractResumeField(compactText, [
    /(?:应聘岗位|目标岗位|求职方向|当前职位|岗位|职位)[:：]?\s*([^，。；;\n]{2,40})/i,
  ]) || inferResumeRole(compactText) || '待识别';

  const years = resume?.yearsOfExperience || extractResumeField(compactText, [
    /(\d{1,2}\+?\s*年(?:工作经验)?)/i,
    /(工作经验[^，。；;\n]{0,12}\d{1,2}\+?\s*年)/i,
  ]) || '待识别';

  const education = resume?.education || extractResumeField(compactText, [
    /(博士|硕士|本科|大专|中专|MBA|EMBA|研究生)/i,
  ]) || '待识别';

  const skills = (resume?.skills || []).slice(0, 6).join(' / ')
    || pickResumeSkills(compactText)
    || (item.intentSlots?.ingredients || []).slice(0, 6).join(' / ')
    || '待识别';

  const highlights = buildResumeHighlights(item);

  return {
    candidate,
    role,
    years,
    education,
    skills,
    highlights,
  };
}

function buildResumeCompareTable(matchedDocs: ParsedDocument[]) {
  const resumeDocs = matchedDocs
    .filter((item) => item.parseStatus === 'parsed')
    .filter((item) => looksLikeResumeDocument(item))
    .slice(0, 5);
  const rows = resumeDocs.map((item) => {
    const row = extractResumeCompareRow(item);
    return [row.candidate, row.role, row.years, row.education, row.skills, row.highlights];
  });

  return {
    content: rows.length
      ? '已根据当前命中的简历资料生成对比表。'
      : '当前没有命中可用于生成简历对比表的资料。',
    table: {
      title: '人才简历对比表',
      subtitle: `当前纳入对比 ${rows.length} 份资料`,
      columns: ['候选人', '目标岗位', '经验', '学历', '核心技能', '亮点'],
      rows,
      notes: [
        '当前为基础对比表，优先展示岗位、年限、学历、技能和亮点。',
        '如果需要针对某岗位 JD 对比，可继续在对话里补充岗位要求。',
      ],
      templateLabel: '表格',
      groupLabel: '人才简历库',
    },
  };
}

function isFormulaAdvicePrompt(prompt: string) {
  const text = prompt.toLowerCase();
  if (PET_FORMULA_PATTERN.test(prompt) && PET_MILK_PATTERN.test(prompt)) return true;

  const formulaSignals = [
    '奶粉',
    '乳粉',
    '乳品',
    '奶制品',
    '乳制品',
    '配方粉',
    '营养粉',
    '配方',
    '方案',
    'formula',
    'milk powder',
    'milk formula',
    'dairy',
    'goat milk',
    '宠物配方',
    '猫奶粉',
    '犬奶粉',
    '狗奶粉',
    '猫乳品',
    '犬乳品',
    '狗乳品',
    '猫奶',
    '犬奶',
    '狗奶',
    '羊奶粉',
    '羊奶',
  ].filter((keyword) => text.includes(keyword)).length;

  if (formulaSignals >= 2) return true;

  return (
    formulaSignals >= 1
    && [
      '健脑',
      '抗抑郁',
      '抑郁',
      '中老年',
      '成人',
      '婴儿',
      '婴幼儿',
      '宝宝',
      '儿童',
      '小孩',
      '幼儿',
      '青少年',
      '宠物',
      '幼猫',
      '成猫',
      '幼犬',
      '成犬',
      '离乳',
      '断奶',
      '猫咪',
      '狗狗',
      '建议',
      'brain',
      'mood',
      'infant',
      'baby',
      'toddler',
      'child',
      'kids',
      'teen',
      'adult',
      'pet',
      'cat',
      'dog',
      'puppy',
      'kitten',
    ].some((keyword) => text.includes(keyword))
  );
}

function detectLocalFormulaSegment(prompt: string): FormulaSegmentDecision {
  const text = prompt.toLowerCase();
  const mentionsCat = CAT_PATTERN.test(prompt);
  const mentionsDog = DOG_PATTERN.test(prompt);
  const mentionsPet = PET_PATTERN.test(prompt);
  const mentionsMilk = MILK_PATTERN.test(prompt);

  const hasPet = mentionsPet || mentionsCat || mentionsDog || mentionsMilk;
  if (hasPet) {
    if (KITTEN_PATTERN.test(prompt)) {
      return { segment: 'pet_cat_kitten', confident: true, source: 'local' };
    }
    if (ADULT_CAT_PATTERN.test(prompt)) {
      return { segment: 'pet_cat_adult', confident: true, source: 'local' };
    }
    if (PUPPY_PATTERN.test(prompt)) {
      return { segment: 'pet_dog_puppy', confident: true, source: 'local' };
    }
    if (ADULT_DOG_PATTERN.test(prompt)) {
      return { segment: 'pet_dog_adult', confident: true, source: 'local' };
    }
    if (mentionsCat) return { segment: 'pet_cat_adult', confident: true, source: 'local' };
    if (mentionsDog) return { segment: 'pet_dog_adult', confident: true, source: 'local' };
    if (mentionsPet && mentionsMilk) return { segment: 'pet_generic', confident: true, source: 'local' };
    return { segment: 'pet_generic', confident: false, source: 'local' };
  }

  if (['婴儿', '婴幼儿', '宝宝', 'infant', 'baby', 'toddler'].some((keyword) => text.includes(keyword))) {
    return { segment: 'human_infant', confident: true, source: 'local' };
  }
  if (['儿童', '小孩', '学龄', 'child', 'children', 'kids'].some((keyword) => text.includes(keyword))) {
    return { segment: 'human_child', confident: true, source: 'local' };
  }
  if (['青少年', 'teen', 'teenager', '学生'].some((keyword) => text.includes(keyword))) {
    return { segment: 'human_teen', confident: true, source: 'local' };
  }
  if (['成人', 'adult', '白领', '上班族'].some((keyword) => text.includes(keyword))) {
    return { segment: 'human_adult', confident: true, source: 'local' };
  }
  if (['中老年', '老年', '健脑', '抗抑郁', '抑郁', 'brain', 'mood'].some((keyword) => text.includes(keyword))) {
    return { segment: 'human_senior', confident: true, source: 'local' };
  }

  return { segment: null, confident: false, source: 'local' };
}

function extractFirstJsonObject(text: string) {
  const normalized = String(text || '').trim();
  if (!normalized) return null;

  const fenced = normalized.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || normalized;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;

  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeFormulaSegment(value: unknown): FormulaSegment | null {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return null;

  const aliases: Array<[FormulaSegment, string[]]> = [
    ['human_infant', ['human_infant', 'infant', 'baby', '婴儿', '婴幼儿', '宝宝']],
    ['human_child', ['human_child', 'child', 'children', 'kids', '儿童', '学龄儿童', '小孩']],
    ['human_teen', ['human_teen', 'teen', 'teenager', 'adolescent', '青少年', '学生']],
    ['human_adult', ['human_adult', 'adult', '成人', '成年']],
    ['human_senior', ['human_senior', 'senior', 'elderly', 'older adult', '中老年', '老年']],
    ['pet_cat_kitten', ['pet_cat_kitten', 'kitten', '幼猫']],
    ['pet_cat_adult', ['pet_cat_adult', 'adult cat', 'cat', '成猫', '猫']],
    ['pet_dog_puppy', ['pet_dog_puppy', 'puppy', '幼犬']],
    ['pet_dog_adult', ['pet_dog_adult', 'adult dog', 'dog', '成犬', '犬', '狗']],
    ['pet_generic', ['pet_generic', 'pet', '宠物']],
  ];

  for (const [segment, words] of aliases) {
    if (words.some((word) => text === word || text.includes(word))) return segment;
  }

  return null;
}

function splitCloudNotes(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 3);
  }

  return String(value || '')
    .split(/[\n；;•]+/)
    .map((item) => item.replace(/^[-*\d.\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, 3);
}

function inferCloudAssistFromText(text: string): CloudFormulaAssist | null {
  const normalized = String(text || '').trim();
  if (!normalized) return null;

  const segment = normalizeFormulaSegment(normalized);
  const noteMatches = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('{') && !line.startsWith('```'));

  if (!segment && !noteMatches.length) return null;

  return {
    segment: segment || undefined,
    notes: noteMatches.slice(0, 3),
    summary: noteMatches[0],
  };
}

function parseCloudFormulaAssist(text: string): CloudFormulaAssist | null {
  const parsed = extractFirstJsonObject(text) as CloudFormulaAssist | null;
  if (parsed) {
    return {
      segment: normalizeFormulaSegment(parsed.segment) || undefined,
      notes: splitCloudNotes(parsed.notes),
      summary: String(parsed.summary || '').trim() || undefined,
    };
  }

  return inferCloudAssistFromText(text);
}

async function runCloudFormulaAssist(
  prompt: string,
  matchedDocs: ParsedDocument[],
  sessionUser?: string,
  gatewayReachable = false,
): Promise<CloudFormulaAssist | null> {
  if (!isOpenClawGatewayConfigured() || !gatewayReachable) return null;

  const segmentHelp = [
    'human_infant',
    'human_child',
    'human_teen',
    'human_adult',
    'human_senior',
    'pet_cat_kitten',
    'pet_cat_adult',
    'pet_dog_puppy',
    'pet_dog_adult',
    'pet_generic',
  ].join(', ');

  try {
    const result = await runOpenClawChat({
      prompt,
      sessionUser,
      contextBlocks: buildDocumentContext(matchedDocs),
      systemPrompt: [
        '你是知识库模板编排助手。',
        '任务不是直接回答用户，而是帮助本地模板系统判断最合适的输出模板，并补充最多3条简短说明。',
        `可选 segment 只能是：${segmentHelp}。`,
        '请尽量严格返回 JSON，不要返回 Markdown，不要返回额外解释文字。',
        'JSON 格式：{"segment":"human_adult","summary":"一句话概括","notes":["说明1","说明2"]}',
        '如果无法判断，请优先根据上下文推断最可能的人群或物种；仍无法判断时返回 human_adult 或 pet_generic 中更合理的一项。',
      ].join('\n'),
    });

    return parseCloudFormulaAssist(result.content);
  } catch {
    return null;
  }
}

async function resolveFormulaSegment(
  prompt: string,
  matchedDocs: ParsedDocument[],
  sessionUser?: string,
  gatewayReachable = false,
): Promise<FormulaSegmentDecision> {
  const localDecision = detectLocalFormulaSegment(prompt);
  if (localDecision.confident && localDecision.segment) return localDecision;

  const cloudDecision = await runCloudFormulaAssist(prompt, matchedDocs, sessionUser, gatewayReachable);
  if (cloudDecision?.segment) {
    return {
      segment: cloudDecision.segment,
      confident: true,
      source: 'cloud',
      notes: cloudDecision.notes?.slice(0, 3),
    };
  }

  return {
    segment: localDecision.segment || null,
    confident: false,
    source: 'default',
    notes: cloudDecision?.notes?.slice(0, 3),
  };
}

async function runCloudDirectAnswer(
  prompt: string,
  matchedDocs: ParsedDocument[],
  scope: KnowledgeScope,
  sessionUser?: string,
) {
  return runOpenClawChat({
    prompt,
    sessionUser,
    contextBlocks: buildDocumentContext(matchedDocs),
    systemPrompt: buildScopedSystemPrompt(scope, [
      '请优先利用提供的知识库文档、结构化信息和上下文来理解用户问题。',
      '如果问题与奶粉配方、乳品方案、宠物营养方案相关，但无法稳定映射到固定模板，只能在当前知识库范围内直接回答。',
      '回答必须优先使用结构化信息（如人群、成分、菌株、功效、剂量、关系）组织答案，再引用证据摘录支撑。',
      '回答格式固定为三段：1. 结论 2. 结构化归纳 3. 证据依据。',
      '结构化归纳优先输出人群、菌株/成分、功效、剂量或关键关系；没有就跳过该小项。',
      '如果证据不足，要明确说明，不要用常识补齐未提供的信息。',
      '不要输出 JSON，不要假装已经命中某个模板。',
    ]),
  });
}

function buildFormulaAdviceTable(
  matchedDocs: ParsedDocument[],
  decision: FormulaSegmentDecision,
): { content: string; table: FormulaTable } {
  const refs = matchedDocs.map((item) => item.name).slice(0, 3);
  const subtitle = refs.length ? `参考资料：${refs.join('；')}` : '参考逻辑：结合本地知识库文档、结构化知识与模板规则整理';

  const withTable = (title: string, content: string, rows: string[][], notes: string[]) => ({
    content,
    table: {
      title,
      subtitle,
      columns: FORMULA_COLUMNS,
      rows,
      notes: [...notes, ...(decision.notes || [])].slice(0, 6),
    },
  });

  switch (decision.segment) {
    case 'human_infant':
      return withTable(
        '婴儿奶粉配方建议',
        '已按婴儿奶粉方向整理出结构化配方表，重点偏向消化吸收、脑视力发育和配方合规。',
        [
          ['基础蛋白', '乳清蛋白 + 酪蛋白', '按婴配粉分段标准配置', '支持生长发育与氨基酸供给', '优先保证蛋白比例和消化友好性'],
          ['脂肪结构', 'DHA + ARA + 植物油脂体系', 'DHA 80-120 mg/100 g', '支持脑与视力发育', '兼顾脂肪酸平衡与法规范围'],
          ['益生元', 'GOS / FOS', '2-4 g/L 冲调液参考', '支持肠道菌群建立', '优先提升肠道耐受与排便表现'],
          ['可选益生菌', 'Bifidobacterium / Lactobacillus', '1e6-1e8 CFU/100 g', '支持肠道舒适与免疫协同', '优先选稳定株并评估货架期活性'],
          ['碳水来源', '乳糖为主', '以乳糖为主配比', '支持能量供给与钙吸收', '避免无必要的高甜度设计'],
          ['关键微量营养', '胆碱、牛磺酸、核苷酸、铁、锌、钙', '按分段标准', '支持神经、免疫和骨骼发育', '需与目标月龄段法规一致'],
        ],
        [
          '适合强调消化吸收、脑视力发育和配方合规。',
          '不替代婴配粉法规审评和注册资料。',
        ],
      );
    case 'human_child':
      return withTable(
        '儿童奶粉配方建议',
        '已按儿童奶粉方向整理出结构化配方表，重点偏向成长营养、骨骼支持和学习状态支持。',
        [
          ['蛋白营养', '乳清蛋白 + 脱脂乳粉', '16-20 g/100 g', '支持成长发育与组织合成', '兼顾口感和蛋白质量'],
          ['骨骼强化', '钙 + 维生素D3 + 维生素K2', '钙 500-700 mg/100 g', '支持骨骼和牙齿发育', '适合作为儿童成长配方的核心模块'],
          ['脑与视力', 'DHA + 叶黄素 + 胆碱', 'DHA 80-150 mg/100 g', '支持专注、记忆和视力发育', '适合学习场景表达'],
          ['肠道支持', 'GOS / FOS + 益生菌', '益生元 2-4 g/100 g', '支持消化舒适与营养吸收', '优先提升排便和耐受表现'],
          ['免疫支持', '锌 + 维生素C + 乳铁蛋白', '按目标成本和法规平衡', '支持儿童免疫屏障', '适合作为差异化卖点模块'],
          ['口感依从', '低蔗糖或减糖体系', '控制额外添加糖', '提升日常坚持饮用概率', '避免过甜影响长期使用'],
        ],
        [
          '儿童配方更适合强调成长、骨骼、专注和肠道耐受。',
          '如需继续细分，可再拆学龄前和学龄期两版。',
        ],
      );
    case 'human_teen':
      return withTable(
        '青少年营养奶粉配方建议',
        '已按青少年营养奶粉方向整理出结构化配方表，重点偏向骨骼发育、学习状态和运动恢复。',
        [
          ['蛋白基础', '乳清蛋白 + 浓缩牛奶蛋白', '18-24 g/100 g', '支持生长高峰期营养需求', '适合成长和运动场景'],
          ['骨骼强化', '高钙 + 维生素D3 + 镁', '钙 600-800 mg/100 g', '支持骨骼增长与肌肉功能', '适合青春期骨量积累'],
          ['学习支持', 'DHA + 胆碱 + B族维生素', '按成本和法规平衡', '支持注意力和认知表现', '适合考试和学习场景'],
          ['肠道耐受', 'GOS / FOS + 益生菌', '益生元 2-4 g/100 g', '支持吸收和日常肠道舒适', '减少高蛋白配方带来的消化压力'],
          ['能量管理', '低GI碳水 + 适度风味体系', '控制总糖', '兼顾顺口和代谢友好', '避免做成高糖型学生营养粉'],
          ['恢复支持', '锌 + 维生素C + 电解质', '按目标定位调节', '支持高强度学习和运动后的恢复', '适合拓展校园运动版配方'],
        ],
        [
          '适合强调成长冲刺、学习专注和运动恢复。',
          '如果偏增肌或体重管理，可继续拆成两套子模板。',
        ],
      );
    case 'human_adult':
      return withTable(
        '成人营养奶粉配方建议',
        '已按成人营养奶粉方向整理出结构化配方表，重点偏向能量管理、肠道舒适和日常状态维持。',
        [
          ['蛋白基础', '乳清蛋白 + 酪蛋白', '18-24 g/100 g', '支持日常营养与饱腹感', '适合通勤和代餐场景'],
          ['代谢支持', '膳食纤维 + 低GI碳水', '纤维 4-7 g/100 g', '帮助能量平稳释放', '适合久坐人群日常管理'],
          ['肠道舒适', 'GOS / FOS + 益生菌', '益生元 3-5 g/100 g', '支持肠道菌群平衡', '适合办公人群和外卖饮食场景'],
          ['精神状态', 'B族维生素 + 镁 + 锌', '按目标成本平衡', '支持压力场景下的基础状态维持', '适合职场配方表达'],
          ['免疫支持', '维生素C + 维生素D + 硒', '按法规配置', '支持免疫与抗氧化', '可作为全年型卖点'],
          ['口感体系', '轻甜风味 + 控糖设计', '控制额外添加糖', '提升复购和坚持率', '避免做成高甜冲调粉'],
        ],
        [
          '适合强调代谢友好、轻功能和长期复购体验。',
          '若需按女性/男性或体重管理/运动恢复再细分，可继续拆。',
        ],
      );
    case 'pet_cat_kitten':
      return withTable(
        '幼猫营养配方建议',
        '已按幼猫营养方向整理出结构化配方表，重点偏向高消化率蛋白、免疫支持和成长发育。',
        [
          ['动物蛋白', '鸡肉粉 + 鱼粉 + 乳蛋白', '高蛋白结构', '支持幼猫快速生长', '优先确保动物蛋白占比'],
          ['脂肪与DHA', '鱼油 + 鸡脂', '按能量目标配置', '支持神经发育和皮毛状态', '幼猫阶段适合提高能量密度'],
          ['肠道支持', 'MOS / FOS + 益生菌', '适量添加', '支持断奶后肠道耐受', '减少换粮阶段应激'],
          ['免疫支持', '核苷酸 + 牛磺酸 + 维生素E', '按宠物营养标准配置', '支持免疫和心眼健康', '牛磺酸是猫科关键营养点'],
          ['矿物平衡', '钙磷平衡 + 微量元素', '控制Ca/P比例', '支持骨骼发育', '避免矿物比例失衡'],
          ['适口性', '肉香风味体系', '按适口性目标调整', '提升断奶期采食率', '适口性是幼猫配方成败关键'],
        ],
        [
          '幼猫核心是动物蛋白密度、牛磺酸和肠道耐受。',
          '如需猫奶粉而非主粮型营养粉，可继续改成冲调奶粉模板。',
        ],
      );
    case 'pet_cat_adult':
      return withTable(
        '成猫营养配方建议',
        '已按成猫营养方向整理出结构化配方表，重点偏向毛发、泌尿道友好和体态管理。',
        [
          ['动物蛋白', '鸡肉粉 + 鱼粉', '中高蛋白结构', '支持肌肉维持与采食偏好', '优先保证动物性原料占比'],
          ['毛发支持', '鱼油 + 亚麻籽油', '按脂肪目标平衡', '支持皮毛光泽和皮肤健康', '适合做明显体感卖点'],
          ['泌尿道友好', '矿物盐平衡 + DL-蛋氨酸', '控制镁磷水平', '支持泌尿道环境稳定', '成猫配方常见核心关注点'],
          ['肠道支持', '膳食纤维 + 益生元', '适量添加', '支持粪便成型和肠道舒适', '适合室内猫配方场景'],
          ['体重管理', '左旋肉碱 + 控能量设计', '按定位配置', '支持体态控制', '适合绝育猫/室内猫方向'],
          ['关键营养', '牛磺酸 + 维生素B族', '按宠物标准配置', '支持心脏和视觉健康', '牛磺酸需稳定保底'],
        ],
        [
          '成猫适合围绕毛发、泌尿道、绝育后体重管理做表达。',
          '如果要肠胃敏感猫或高蛋白鲜肉猫版本，可以继续拆。',
        ],
      );
    case 'pet_dog_puppy':
      return withTable(
        '幼犬营养配方建议',
        '已按幼犬营养方向整理出结构化配方表，重点偏向成长发育、骨骼支持和肠道耐受。',
        [
          ['动物蛋白', '鸡肉粉 + 乳蛋白 + 鱼粉', '高蛋白结构', '支持幼犬成长发育', '适合高消化率原料组合'],
          ['骨骼支持', '钙磷平衡 + 维生素D3', '控制Ca/P比例', '支持骨骼和牙齿发育', '大型犬尤其要控制骨骼生长节奏'],
          ['脑发育', 'DHA 鱼油', '按能量目标平衡', '支持训练学习和神经发育', '适合幼犬训练配方表达'],
          ['肠道耐受', 'MOS / FOS + 益生菌', '适量添加', '支持换粮期和断奶期肠道稳定', '提升幼犬粪便质量'],
          ['免疫支持', '核苷酸 + 维生素E + 锌', '按宠物标准配置', '支持早期免疫构建', '适合幼龄犬方向'],
          ['适口性', '肉香 + 油脂风味', '按适口性目标调整', '提升采食意愿', '幼犬期适口性和耐受同样重要'],
        ],
        [
          '幼犬配方要特别注意骨骼矿物比例和肠道耐受。',
          '如果你区分大型犬幼犬和小型犬幼犬，可继续拆两版。',
        ],
      );
    case 'pet_dog_adult':
      return withTable(
        '成犬营养配方建议',
        '已按成犬营养方向整理出结构化配方表，重点偏向关节支持、肠道舒适和体重管理。',
        [
          ['蛋白结构', '鸡肉粉 + 牛肉粉 + 植物蛋白辅助', '中高蛋白', '支持肌肉维持', '按目标成本平衡动物蛋白占比'],
          ['关节支持', '葡萄糖胺 + 软骨素 + 胶原', '按定位配置', '支持关节和运动表现', '适合中大型犬卖点'],
          ['肠道支持', '膳食纤维 + 益生元 + 益生菌', '适量添加', '支持粪便质量和肠道稳定', '适合肠胃敏感犬方向'],
          ['皮毛支持', '鱼油 + 锌 + 生物素', '按脂肪目标平衡', '支持毛发和皮肤状态', '适合全犬期通用表达'],
          ['体重管理', '低脂配比 + 左旋肉碱', '按功能型定位调整', '支持绝育犬和室内犬体态管理', '避免能量过高'],
          ['适口性', '肉香风味 + 颗粒适口设计', '按采食性目标', '提升持续食用意愿', '适合做长期喂养型产品'],
        ],
        [
          '成犬更适合强调关节、肠道和体态管理。',
          '如果需要老年犬版本，我可以继续补一张针对关节和认知衰老的配方表。',
        ],
      );
    case 'pet_generic':
      return withTable(
        '宠物营养配方建议',
        '已按宠物营养方向整理出结构化表，当前先给出一个适合继续细分到猫犬的通用框架。',
        [
          ['核心蛋白', '动物蛋白为主', '按目标物种调整', '支持基础营养和适口性', '猫犬都更依赖动物性原料表达'],
          ['脂肪模块', '鱼油 + 动物脂肪', '按能量目标调整', '支持皮毛和能量供给', '不同物种需分别校准'],
          ['肠道模块', '益生元 + 益生菌', '适量添加', '支持肠道舒适和换粮耐受', '适合宠物通用卖点'],
          ['骨骼/关节', '矿物平衡或关节支持模块', '视幼龄/成年阶段调整', '支持成长或运动功能', '猫犬目标不同需进一步拆分'],
          ['免疫模块', '维生素E + 锌 + 核苷酸', '按标准配置', '支持应激和免疫状态', '适合作为基础强化模块'],
          ['适口性设计', '肉香风味体系', '按采食目标调整', '提升长期复购和采食稳定性', '宠物配方落地非常依赖适口性'],
        ],
        [
          '如果明确是猫还是狗，可以立刻切到更细的专用表。',
          '通用宠物模板更适合立项讨论，不建议直接用于量产配方。',
        ],
      );
    default:
      return withTable(
        '中老年健脑抗抑郁奶粉配方建议',
        '已按中老年健脑抗抑郁方向整理出结构化配方表，重点偏向脑健康、情绪支持和肠脑轴协同。',
        [
          ['蛋白基础', '乳清蛋白 + 酪蛋白', '14-18 g/100 g', '提供优质氨基酸基础', '兼顾吸收速度和饱腹感，适合中老年日常营养支持'],
          ['脑营养脂质', 'DHA 藻油粉', '120-200 mg/100 g', '支持认知与神经细胞膜稳定', '作为脑健康核心脂质，建议与磷脂搭配'],
          ['神经递质支持', '磷脂酰丝氨酸 PS', '80-120 mg/100 g', '帮助记忆、专注与情绪稳定', '适合健脑抗压方向的功能强化'],
          ['情绪营养', '色氨酸 + 维生素B6', '色氨酸 180-260 mg / B6 0.8-1.2 mg', '参与血清素合成通路', '用于情绪支持，不宣称治疗抑郁'],
          ['抗氧化保护', '维生素C + 维生素E + 硒', 'C 60-100 mg / E 8-15 mg / 硒 20-35 ug', '降低氧化应激负担', '适合中老年脑健康和免疫协同'],
          ['矿物强化', '镁 + 锌', '镁 60-120 mg / 锌 6-10 mg', '支持神经放松与情绪调节', '对睡眠质量和情绪稳定有辅助价值'],
        ],
        [
          '适合强调脑健康支持、情绪营养支持和肠脑轴协同。',
          '如果面向高血糖人群，需要进一步压低蔗糖并优化碳水结构。',
        ],
      );
  }
}

export function buildFallbackAnswer(
  prompt: string,
  _scenarioKey: ScenarioKey,
  matchedDocs: ParsedDocument[],
  evidenceMatches: DocumentEvidenceMatch[] = [],
) {
  return buildEvidenceDrivenAnswer(prompt, matchedDocs, evidenceMatches);
}

function chooseScenario(prompt: string, matchedDocs: ParsedDocument[]): ScenarioKey {
  if (matchedDocs.length) {
    const contractCount = matchedDocs.filter((item) => item.category === 'contract').length;
    const docCount = matchedDocs.filter((item) => item.category === 'technical' || item.category === 'paper').length;

    if (contractCount > docCount) return 'contract';
    if (docCount > 0) return 'doc';
  }

  return resolveScenario(prompt);
}

export async function runChatOrchestration(input: ChatRequestInput) {
  const prompt = input.prompt.trim();
  const { items } = await loadParsedDocuments();
  const initialEvidenceMatches = matchDocumentEvidenceByPrompt(items, prompt);
  const initialMatchedDocs = initialEvidenceMatches.length
    ? [...new Map(initialEvidenceMatches.map((entry) => [entry.item.path, entry.item])).values()]
    : matchDocumentsByPrompt(items, prompt);
  const libraries = await loadDocumentLibraries();
  const scope = resolveKnowledgeScope(prompt, items, initialMatchedDocs, libraries);
  const reportState = await loadReportCenterState();
  const templateScopedGroup = findReportGroupForPrompt(reportState.groups, prompt);
  const matchedDocs = scope.scopedDocs;
  const scopedEvidenceMatches = matchDocumentEvidenceByPrompt(matchedDocs, prompt);
  const referencePayload = buildReferencePayload(scopedEvidenceMatches);
  const contextBlocks = scopedEvidenceMatches.length ? buildEvidenceContext(scopedEvidenceMatches) : buildDocumentContext(matchedDocs);
  const strongDocScope = hasStrongDocumentScope(prompt, matchedDocs);
  const gatewayReachable = await isOpenClawGatewayReachable();
  const hasKnowledgeScope = (scope.hasScope && strongDocScope) || Boolean(templateScopedGroup);
  const policy = classifyChatPrompt({
    prompt,
    hasKnowledgeScope,
  });

  if (policy.mode === 'blocked') {
    return {
      scenario: 'default' as ScenarioKey,
      traceId: `trace_${Date.now()}`,
      message: {
        role: 'assistant' as const,
        content: buildBlockedPolicyAnswer(policy.reason),
        meta: '受控开放对话 / 已拦截执行型请求',
        references: [],
      },
      panel: scenarios.default,
      sources: [],
      permissions: { mode: 'read-only' },
      orchestration: {
        mode: 'fallback' as const,
        docMatches: 0,
        gatewayConfigured: gatewayReachable,
      },
      latencyMs: 120,
    };
  }

  if (isResumeComparePrompt(prompt)) {
    const resumeDocs = matchResumeDocuments(items, prompt, 30);
    const compareDocs = resumeDocs.length ? resumeDocs : (matchedDocs.length ? matchedDocs : initialMatchedDocs);
    const compareEvidenceMatches = compareDocs.length ? matchDocumentEvidenceByPrompt(compareDocs, prompt) : [];
    const compareEvidence = compareEvidenceMatches.length
      ? buildReferencePayload(compareEvidenceMatches)
      : (matchedDocs.length ? referencePayload : buildReferencePayload(initialEvidenceMatches));
    const compareResult = buildResumeCompareTable(compareDocs);
    return {
      scenario: 'doc' as ScenarioKey,
      traceId: `trace_${Date.now()}`,
      message: {
        role: 'assistant' as const,
        content: compareResult.content,
        table: compareResult.table,
        meta: buildMeta('doc', compareDocs, 'fallback'),
        references: compareEvidence,
      },
      panel: scenarios.doc,
      sources: compareDocs.map((item) => ({ type: 'documents', name: item.name, table: item.path })),
      permissions: { mode: 'read-only' },
      orchestration: {
        mode: 'fallback' as const,
        docMatches: compareDocs.length,
        gatewayConfigured: gatewayReachable,
      },
      latencyMs: 120,
    };
  }

  if (policy.mode === 'general') {
    if (gatewayReachable) {
      try {
        const result = await runOpenClawChat({
          prompt,
          sessionUser: input.sessionUser,
          contextBlocks: [],
          systemPrompt: buildGeneralChatSystemPrompt(),
        });

        return {
          scenario: 'default' as ScenarioKey,
          traceId: `trace_${Date.now()}`,
          message: {
            role: 'assistant' as const,
            content: result.content,
            meta: '受控开放对话 / 云端模型',
            references: [],
          },
          panel: scenarios.default,
          sources: [],
          permissions: { mode: 'read-only' },
          orchestration: {
            mode: 'openclaw' as const,
            docMatches: 0,
            gatewayConfigured: gatewayReachable,
          },
          latencyMs: 120,
        };
      } catch {
        return {
          scenario: 'default' as ScenarioKey,
          traceId: `trace_${Date.now()}`,
          message: {
            role: 'assistant' as const,
            content: '当前云端模型暂不可用。你可以继续进行普通问答和方案讨论，或稍后再试。',
            meta: '受控开放对话 / 本地AI兜底',
            references: [],
          },
          panel: scenarios.default,
          sources: [],
          permissions: { mode: 'read-only' },
          orchestration: {
            mode: 'fallback' as const,
            docMatches: 0,
            gatewayConfigured: gatewayReachable,
          },
          latencyMs: 120,
        };
      }
    }

    return {
      scenario: 'default' as ScenarioKey,
      traceId: `trace_${Date.now()}`,
      message: {
        role: 'assistant' as const,
        content: '当前云端模型暂不可用。你可以继续进行普通问答和方案讨论，或稍后再试。',
        meta: '受控开放对话 / 本地AI兜底',
        references: [],
      },
      panel: scenarios.default,
      sources: [],
      permissions: { mode: 'read-only' },
      orchestration: {
        mode: 'fallback' as const,
        docMatches: 0,
        gatewayConfigured: gatewayReachable,
      },
      latencyMs: 120,
    };
  }

  if ((!scope.hasScope || !strongDocScope) && !templateScopedGroup) {
    return {
      scenario: 'doc' as ScenarioKey,
      traceId: `trace_${Date.now()}`,
      message: {
        role: 'assistant' as const,
        content: buildKnowledgeScopeGuardAnswer(scope),
        meta: '知识库范围保护已生效 / 未命中任何知识库分组或文档',
        references: [],
      },
      panel: scenarios.doc,
      sources: [],
      permissions: { mode: 'read-only' },
      orchestration: {
        mode: 'fallback' as const,
        docMatches: 0,
        gatewayConfigured: gatewayReachable,
      },
      latencyMs: 120,
    };
  }

  if (isFormulaAdvicePrompt(prompt)) {
      const segmentDecision = await resolveFormulaSegment(prompt, matchedDocs, input.sessionUser, gatewayReachable);
      if (!segmentDecision.segment) {
        if (gatewayReachable) {
          try {
            const cloudResult = await runCloudDirectAnswer(prompt, matchedDocs, scope, input.sessionUser);
            return {
              scenario: 'doc' as ScenarioKey,
              traceId: `trace_${Date.now()}`,
              message: {
                role: 'assistant' as const,
                content: cloudResult.content,
                meta: buildMeta('doc', matchedDocs, 'openclaw'),
                references: referencePayload,
              },
              panel: scenarios.doc,
              sources: matchedDocs.map((item) => ({ type: 'documents', name: item.name, table: item.path })),
              permissions: { mode: 'read-only' },
              orchestration: {
                mode: 'openclaw' as const,
                docMatches: matchedDocs.length,
                gatewayConfigured: gatewayReachable,
              },
              latencyMs: 120,
            };
          } catch {
            // fall through to local fallback answer when gateway is reachable but request fails
          }
        }

        const fallbackAnswer = buildFallbackAnswer(prompt, 'doc', matchedDocs, scopedEvidenceMatches);
        return {
          scenario: 'doc' as ScenarioKey,
          traceId: `trace_${Date.now()}`,
          message: {
            role: 'assistant' as const,
            content: fallbackAnswer,
            meta: buildMeta('doc', matchedDocs, 'fallback'),
            references: referencePayload,
          },
          panel: scenarios.doc,
          sources: matchedDocs.map((item) => ({ type: 'documents', name: item.name, table: item.path })),
          permissions: { mode: 'read-only' },
          orchestration: {
            mode: 'fallback' as const,
            docMatches: matchedDocs.length,
            gatewayConfigured: gatewayReachable,
          },
          latencyMs: 120,
        };
      }

      const formulaAdvice = buildFormulaAdviceTable(matchedDocs, segmentDecision);
      const formulaGroup = templateScopedGroup || reportState.groups.find((item) => {
        const text = `${item.label} ${item.key}`.toLowerCase();
        return text.includes('奶粉配方') || text.includes('配方建议') || text.includes('formula');
    });

    if (formulaGroup) {
      const template = formulaGroup.templates.find((item) => item.key === formulaGroup.defaultTemplateKey) || formulaGroup.templates[0];
      formulaAdvice.table.groupLabel = formulaGroup.label;
      formulaAdvice.table.templateLabel = template?.label || '表格';
      formulaAdvice.table.notes = [
        segmentDecision.source === 'cloud'
          ? `本次由云端模型补判命中“${formulaAdvice.table.title}”，再按本地知识库模板输出。`
          : `本次由本地知识库规则直接命中“${formulaAdvice.table.title}”模板输出。`,
        ...(formulaAdvice.table.notes || []),
      ];

      await createReportOutput({
        groupKey: formulaGroup.key,
        templateKey: template?.key,
        title: `${formulaGroup.label}-聊天输出-${new Date().toISOString().slice(0, 10)}`,
        triggerSource: 'chat',
      });
    }

    return {
      scenario: 'doc' as ScenarioKey,
      traceId: `trace_${Date.now()}`,
      message: {
        role: 'assistant' as const,
        content: formulaAdvice.content,
        table: formulaAdvice.table,
        meta: buildMeta('doc', matchedDocs, segmentDecision.source === 'cloud' ? 'openclaw' : 'fallback'),
            references: referencePayload,
      },
      panel: scenarios.doc,
      sources: matchedDocs.map((item) => ({ type: 'documents', name: item.name, table: item.path })),
        permissions: { mode: 'read-only' },
        orchestration: {
          mode: (segmentDecision.source === 'cloud' ? 'openclaw' : 'fallback') as 'openclaw' | 'fallback',
          docMatches: matchedDocs.length,
          gatewayConfigured: gatewayReachable,
        },
        latencyMs: 120,
      };
  }

  const scenarioKey = chooseScenario(prompt, matchedDocs);
  const scenario = scenarios[scenarioKey];

  let answer = '';
  let orchestrationMode: 'openclaw' | 'fallback' = 'fallback';
  let structuredTable: FormulaTable | undefined;

  if (gatewayReachable) {
    try {
      const result = await runOpenClawChat({
        prompt,
        sessionUser: input.sessionUser,
        contextBlocks,
        systemPrompt: buildScopedSystemPrompt(scope, [
          '回答时先给结论，再给简短依据。',
          '不要执行任务，不要给出知识库范围之外的推测性建议。',
        ]),
      });
      answer = result.content;
      orchestrationMode = 'openclaw';
    } catch {
      answer = buildFallbackAnswer(prompt, scenarioKey, matchedDocs, scopedEvidenceMatches);
    }
  } else {
    answer = buildFallbackAnswer(prompt, scenarioKey, matchedDocs, scopedEvidenceMatches);
  }

  return {
    scenario: scenarioKey,
    traceId: `trace_${Date.now()}`,
    message: {
      role: 'assistant' as const,
      content: answer,
      table: structuredTable,
      meta: buildMeta(scenarioKey, matchedDocs, orchestrationMode),
      references: referencePayload,
    },
    panel: scenario,
    sources: [
      ...scenario.sources,
      ...matchedDocs.map((item) => ({ type: 'documents', name: item.name, table: item.path })),
    ],
      permissions: { mode: 'read-only' },
      orchestration: {
        mode: orchestrationMode,
        docMatches: matchedDocs.length,
        gatewayConfigured: gatewayReachable,
      },
      latencyMs: 120,
    };
}

export async function runChatOrchestrationV2(input: ChatRequestInput) {
  const prompt = input.prompt.trim();
  const { items } = await loadParsedDocuments();
  const initialEvidenceMatches = matchDocumentEvidenceByPrompt(items, prompt);
  const initialMatchedDocs = initialEvidenceMatches.length
    ? [...new Map(initialEvidenceMatches.map((entry) => [entry.item.path, entry.item])).values()]
    : matchDocumentsByPrompt(items, prompt);
  const libraries = await loadDocumentLibraries();
  const reportState = await loadReportCenterState();
  const templateScopedGroup = findReportGroupForPrompt(reportState.groups, prompt);
  const baseScope = resolveKnowledgeScope(prompt, items, initialMatchedDocs, libraries);
  const preferredLibraryKeys = [...new Set([...baseScope.libraryKeys, ...inferPreferredLibraryKeys(prompt, libraries)])];
  const forceKnowledgeRoute = isKnowledgeReportPrompt(prompt);
  const scope = forceKnowledgeRoute
    ? buildExpandedKnowledgeScope(prompt, items, initialMatchedDocs, libraries, preferredLibraryKeys)
    : baseScope;
  const matchedDocs = scope.scopedDocs;
  const scopedEvidenceMatches = matchDocumentEvidenceByPrompt(matchedDocs, prompt);
  const referencePayload = buildReferencePayload(scopedEvidenceMatches);
  const contextBlocks = scopedEvidenceMatches.length ? buildEvidenceContext(scopedEvidenceMatches) : buildDocumentContext(matchedDocs);
  const strongDocScope = hasStrongDocumentScope(prompt, matchedDocs);
  const gatewayReachable = await isOpenClawGatewayReachable();
  const hasKnowledgeScope = forceKnowledgeRoute || ((scope.hasScope && strongDocScope) || Boolean(templateScopedGroup));
  const policy = classifyChatPrompt({
    prompt,
    hasKnowledgeScope,
  });
  const libraryPayload = buildLibraryPayload(scope);

  if (policy.mode === 'blocked') {
    const content = buildBlockedPolicyAnswer(policy.reason);
    const output: ChatOutput = { type: 'answer', content };
    return {
      mode: 'fallback' as const,
      intent: 'system_change' as const,
      needsKnowledge: false,
      libraries: [],
      output,
      guard: {
        requiresConfirmation: true,
        reason: policy.reason,
      },
      scenario: 'default' as ScenarioKey,
      traceId: `trace_${Date.now()}`,
      message: {
        role: 'assistant' as const,
        content,
        output,
        meta: '受控开放对话 / 已拦截执行型请求',
        references: [],
      },
      panel: scenarios.default,
      sources: [],
      permissions: { mode: 'read-only' },
      orchestration: {
        mode: 'fallback' as const,
        docMatches: 0,
        gatewayConfigured: gatewayReachable,
      },
      latencyMs: 120,
    };
  }

  if (isResumeComparePrompt(prompt)) {
    const resumeDocs = matchResumeDocuments(items, prompt, 30);
    const compareDocs = resumeDocs.length ? resumeDocs : (matchedDocs.length ? matchedDocs : initialMatchedDocs);
    const compareEvidenceMatches = compareDocs.length ? matchDocumentEvidenceByPrompt(compareDocs, prompt) : [];
    const compareEvidence = compareEvidenceMatches.length
      ? buildReferencePayload(compareEvidenceMatches)
      : (matchedDocs.length ? referencePayload : buildReferencePayload(initialEvidenceMatches));
    const compareResult = buildResumeCompareTable(compareDocs);
    const output: ChatOutput = {
      type: 'table',
      title: compareResult.table.title,
      content: compareResult.content,
      table: compareResult.table,
    };
    return {
      mode: 'fallback' as const,
      intent: 'report' as const,
      needsKnowledge: compareDocs.length > 0,
      libraries: libraryPayload,
      output,
      guard: {
        requiresConfirmation: false,
        reason: '',
      },
      scenario: 'doc' as ScenarioKey,
      traceId: `trace_${Date.now()}`,
      message: {
        role: 'assistant' as const,
        content: compareResult.content,
        table: compareResult.table,
        output,
        meta: buildMeta('doc', compareDocs, 'fallback'),
        references: compareEvidence,
      },
      panel: scenarios.doc,
      sources: compareDocs.map((item) => ({ type: 'documents', name: item.name, table: item.path })),
      permissions: { mode: 'read-only' },
      orchestration: {
        mode: 'fallback' as const,
        docMatches: compareDocs.length,
        gatewayConfigured: gatewayReachable,
      },
      latencyMs: 120,
    };
  }

  if (policy.mode === 'general') {
    let content = '当前云端模型暂不可用。你可以继续进行普通问答和方案讨论，或稍后再试。';
    let mode: 'openclaw' | 'fallback' = 'fallback';

    if (gatewayReachable) {
      try {
        const result = await runOpenClawChat({
          prompt,
          sessionUser: input.sessionUser,
          contextBlocks: [],
          systemPrompt: buildGeneralChatSystemPrompt(),
        });
        content = result.content;
        mode = 'openclaw';
      } catch {
        mode = 'fallback';
      }
    }

    const output: ChatOutput = { type: 'answer', content };
    return {
      mode,
      intent: 'general' as const,
      needsKnowledge: false,
      libraries: [],
      output,
      guard: {
        requiresConfirmation: false,
        reason: '',
      },
      scenario: 'default' as ScenarioKey,
      traceId: `trace_${Date.now()}`,
      message: {
        role: 'assistant' as const,
        content,
        output,
        meta: mode === 'openclaw' ? '受控开放对话 / 云端模型' : '受控开放对话 / 本地AI兜底',
        references: [],
      },
      panel: scenarios.default,
      sources: [],
      permissions: { mode: 'read-only' },
      orchestration: {
        mode,
        docMatches: 0,
        gatewayConfigured: gatewayReachable,
      },
      latencyMs: 120,
    };
  }

  if ((!scope.hasScope || !strongDocScope) && !templateScopedGroup) {
    const content = buildKnowledgeScopeGuardAnswer(scope);
    const output: ChatOutput = { type: 'answer', content };
    return {
      mode: 'fallback' as const,
      intent: 'knowledge_qa' as const,
      needsKnowledge: true,
      libraries: libraryPayload,
      output,
      guard: {
        requiresConfirmation: false,
        reason: 'knowledge_scope_not_matched',
      },
      scenario: 'doc' as ScenarioKey,
      traceId: `trace_${Date.now()}`,
      message: {
        role: 'assistant' as const,
        content,
        output,
        meta: '知识库范围保护已生效 / 未命中任何知识库分组或文档',
        references: [],
      },
      panel: scenarios.doc,
      sources: [],
      permissions: { mode: 'read-only' },
      orchestration: {
        mode: 'fallback' as const,
        docMatches: 0,
        gatewayConfigured: gatewayReachable,
      },
      latencyMs: 120,
    };
  }

  if (isFormulaAdvicePrompt(prompt)) {
    const segmentDecision = await resolveFormulaSegment(prompt, matchedDocs, input.sessionUser, gatewayReachable);

    if (!segmentDecision.segment) {
      let content = buildFallbackAnswer(prompt, 'doc', matchedDocs, scopedEvidenceMatches);
      let mode: 'openclaw' | 'fallback' = 'fallback';

      if (gatewayReachable) {
        try {
          const cloudResult = await runCloudDirectAnswer(prompt, matchedDocs, scope, input.sessionUser);
          content = cloudResult.content;
          mode = 'openclaw';
        } catch {
          mode = 'fallback';
        }
      }

      const output: ChatOutput = { type: 'answer', content };
      return {
        mode,
        intent: 'knowledge_qa' as const,
        needsKnowledge: true,
        libraries: libraryPayload,
        output,
        guard: {
          requiresConfirmation: false,
          reason: '',
        },
        scenario: 'doc' as ScenarioKey,
        traceId: `trace_${Date.now()}`,
        message: {
          role: 'assistant' as const,
          content,
          output,
          meta: buildMeta('doc', matchedDocs, mode),
          references: referencePayload,
        },
        panel: scenarios.doc,
        sources: matchedDocs.map((item) => ({ type: 'documents', name: item.name, table: item.path })),
        permissions: { mode: 'read-only' },
        orchestration: {
          mode,
          docMatches: matchedDocs.length,
          gatewayConfigured: gatewayReachable,
        },
        latencyMs: 120,
      };
    }

    const formulaAdvice = buildFormulaAdviceTable(matchedDocs, segmentDecision);
    const formulaGroup = templateScopedGroup || reportState.groups.find((item) => {
      const text = `${item.label} ${item.key}`.toLowerCase();
      return text.includes('濂剁矇閰嶆柟') || text.includes('閰嶆柟寤鸿') || text.includes('formula');
    });

    if (formulaGroup) {
      const template = formulaGroup.templates.find((item) => item.key === formulaGroup.defaultTemplateKey) || formulaGroup.templates[0];
      formulaAdvice.table.groupLabel = formulaGroup.label;
      formulaAdvice.table.templateLabel = template?.label || '琛ㄦ牸';

      await createReportOutput({
        groupKey: formulaGroup.key,
        templateKey: template?.key,
        title: `${formulaGroup.label}-聊天输出-${new Date().toISOString().slice(0, 10)}`,
        triggerSource: 'chat',
      });
    }

    const mode = (segmentDecision.source === 'cloud' ? 'openclaw' : 'fallback') as 'openclaw' | 'fallback';
    const output: ChatOutput = {
      type: 'table',
      title: formulaAdvice.table.title,
      content: formulaAdvice.content,
      table: formulaAdvice.table,
    };
    return {
      mode,
      intent: 'report' as const,
      needsKnowledge: true,
      libraries: libraryPayload,
      output,
      guard: {
        requiresConfirmation: false,
        reason: '',
      },
      scenario: 'doc' as ScenarioKey,
      traceId: `trace_${Date.now()}`,
      message: {
        role: 'assistant' as const,
        content: formulaAdvice.content,
        table: formulaAdvice.table,
        output,
        meta: buildMeta('doc', matchedDocs, mode),
        references: referencePayload,
      },
      panel: scenarios.doc,
      sources: matchedDocs.map((item) => ({ type: 'documents', name: item.name, table: item.path })),
      permissions: { mode: 'read-only' },
      orchestration: {
        mode,
        docMatches: matchedDocs.length,
        gatewayConfigured: gatewayReachable,
      },
      latencyMs: 120,
    };
  }

  const scenarioKey = chooseScenario(prompt, matchedDocs);
  const scenario = scenarios[scenarioKey];
  let answer = '';
  let orchestrationMode: 'openclaw' | 'fallback' = 'fallback';
  const wantsPageOutput = isVisualizationPrompt(prompt) || isPageReportPrompt(prompt);
  const wantsTableOutput = !wantsPageOutput && isTableReportPrompt(prompt);

  if (gatewayReachable) {
    try {
      const result = await runOpenClawChat({
        prompt,
        sessionUser: input.sessionUser,
        contextBlocks,
        systemPrompt: buildScopedSystemPrompt(scope, [
          '回答时先给结论，再给简短依据。',
          '不要执行任务，不要给出知识库范围之外的推测性建议。',
        ]),
      });
      if (looksLikeEncodingComplaint(result.content)) {
        answer = buildFallbackAnswer(prompt, scenarioKey, matchedDocs, scopedEvidenceMatches);
        orchestrationMode = 'fallback';
      } else {
        answer = result.content;
        orchestrationMode = 'openclaw';
      }
    } catch {
      answer = buildFallbackAnswer(prompt, scenarioKey, matchedDocs, scopedEvidenceMatches);
      orchestrationMode = 'fallback';
    }
  } else {
    answer = buildFallbackAnswer(prompt, scenarioKey, matchedDocs, scopedEvidenceMatches);
  }

  const output: ChatOutput = wantsPageOutput
    ? buildStaticPageOutput(prompt, scope, matchedDocs, scopedEvidenceMatches)
    : wantsTableOutput
      ? {
          type: 'table',
          title: `${extractReadablePromptFocus(prompt)}表格`,
          content: answer,
          table: {
            title: `${extractReadablePromptFocus(prompt)}表格`,
            subtitle: `基于 ${buildScopeLabel(scope)} 内命中的 ${matchedDocs.length} 份文档整理`,
            columns: ['文档', '分类', '要点', '证据'],
            rows: matchedDocs.slice(0, 8).map((item) => [
              item.name,
              item.bizCategory || item.category || '未分类',
              trimSentence(item.summary || item.excerpt, 72) || '待补充',
              trimSentence(item.excerpt, 72) || trimSentence(item.summary, 72) || '待补充',
            ]),
            notes: scopedEvidenceMatches.slice(0, 4).map((match) => trimSentence(match.chunkText, 90)).filter(Boolean),
          },
        }
      : { type: 'answer', content: answer };

  return {
    mode: orchestrationMode,
    intent: (wantsPageOutput || wantsTableOutput) ? 'report' as const : 'knowledge_qa' as const,
    needsKnowledge: true,
    libraries: libraryPayload,
    output,
    guard: {
      requiresConfirmation: false,
      reason: '',
    },
    scenario: scenarioKey,
    traceId: `trace_${Date.now()}`,
    message: {
      role: 'assistant' as const,
      content: output.content || answer,
      table: output.type === 'table' ? output.table : undefined,
      output,
      meta: buildMeta(scenarioKey, matchedDocs, orchestrationMode),
      references: referencePayload,
    },
    panel: scenario,
    sources: [
      ...scenario.sources,
      ...matchedDocs.map((item) => ({ type: 'documents', name: item.name, table: item.path })),
    ],
    permissions: { mode: 'read-only' },
    orchestration: {
      mode: orchestrationMode,
      docMatches: matchedDocs.length,
      gatewayConfigured: gatewayReachable,
    },
    latencyMs: 120,
  };
}
