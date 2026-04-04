import { retrieveKnowledgeMatches, type RetrievalResult } from './document-retrieval.js';
import {
  documentMatchesLibrary,
  loadDocumentLibraries,
  UNGROUPED_LIBRARY_KEY,
  UNGROUPED_LIBRARY_LABEL,
} from './document-libraries.js';
import { buildDocumentId, loadParsedDocuments } from './document-store.js';
import type { BotDefinition } from './bot-definitions.js';
import { filterDocumentsForBot, filterLibrariesForBot } from './bot-visibility.js';
import {
  buildKnowledgeRetrievalQuery,
  buildLibraryFallbackRetrieval,
  filterDocumentsByContentFocus,
  filterDocumentsByTimeRange,
} from './knowledge-evidence.js';
import { buildPromptForScoring, collectLibraryMatches } from './knowledge-plan.js';
import type { KnowledgeTemplateTaskHint } from './knowledge-template.js';

type ChatHistoryItem = { role: 'user' | 'assistant'; content: string };

export type KnowledgeLibraryRef = { key: string; label: string };

export type KnowledgeScopeState = {
  knowledgeChatHistory: ChatHistoryItem[];
  libraries: KnowledgeLibraryRef[];
  scopedItems: Awaited<ReturnType<typeof loadParsedDocuments>>['items'];
};

export type KnowledgeSupply = {
  knowledgeChatHistory: ChatHistoryItem[];
  libraries: KnowledgeLibraryRef[];
  effectiveRetrieval: RetrievalResult;
};

const IMAGE_DOCUMENT_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);
const RECENT_UPLOAD_SCOPE_PATTERNS = /最近上传|刚上传|新上传|这批文档|这批材料|latest upload|recent upload/i;
const RECENT_ACTIVITY_SCOPE_PATTERNS = /最近解析|最新解析|刚解析|最近扫描|最新扫描|刚扫描|最近更新|最新更新|刚更新|recent parse|recently parsed|latest parsed|recent scan|latest scan|recent update|latest update/i;
const FAILED_PARSE_SCOPE_PATTERNS = /解析失败|扫描失败|OCR失败|ocr失败|重解析|重新解析|重试|failed parse|parse failed|scan failed|ocr failed|reparse|retry/i;
const IMAGE_DETAIL_SCOPE_PATTERNS = /图片|图像|照片|截图|image|photo|picture|screenshot|png|jpg|jpeg|webp|gif|bmp/i;

function countTopValues(values: string[], limit = 6) {
  const counter = new Map<string, number>();
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (!normalized) continue;
    counter.set(normalized, (counter.get(normalized) || 0) + 1);
  }

  return [...counter.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }));
}

function collectStructuredValues(profile: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!profile || typeof profile !== 'object') return [];
  const results: string[] = [];

  for (const key of keys) {
    const value = profile[key];
    if (Array.isArray(value)) {
      results.push(...value.map((entry) => String(entry || '').trim()).filter(Boolean));
      continue;
    }
    const text = String(value || '').trim();
    if (text) results.push(text);
  }

  return results;
}

function detectConceptDimension(requestText: string, templateTaskHint?: KnowledgeTemplateTaskHint | null) {
  const text = String(requestText || '').toLowerCase();
  if (templateTaskHint === 'resume-comparison') {
    if (/company|employer|organization|公司|雇主/.test(text)) return 'company';
    if (/project|projects|system|项目|系统|平台|it/.test(text)) return 'project';
    if (/skill|skills|技术栈|技能|能力/.test(text)) return 'skill';
    return 'talent';
  }
  if (templateTaskHint === 'bids-static-page' || templateTaskHint === 'bids-table') {
    if (/risk|风险|deadline|合规/.test(text)) return 'risk';
    if (/section|chapter|章节|资格/.test(text)) return 'section';
    return 'response';
  }
  if (templateTaskHint === 'paper-static-page' || templateTaskHint === 'paper-table') {
    if (/method|methods|methodology|trial|design|方法|方法学|研究设计|试验设计/.test(text)) return 'method';
    if (/result|results|finding|findings|metric|outcome|结果|发现|指标/.test(text)) return 'result';
    return 'conclusion';
  }
  if (templateTaskHint === 'order-static-page') {
    if (/platform|tmall|jd|douyin|平台|天猫|京东|抖音/.test(text)) return 'platform';
    if (/category|sku|品类|类目/.test(text)) return 'category';
    return 'stock';
  }
  if (templateTaskHint === 'technical-summary' || templateTaskHint === 'iot-static-page' || templateTaskHint === 'iot-table') {
    if (/value|roi|benefit|收益|价值/.test(text)) return 'value';
    if (/module|device|gateway|模块|设备|网关|接口/.test(text)) return 'module';
    return 'scenario';
  }
  if (templateTaskHint === 'formula-static-page') {
    return 'ingredient';
  }
  if (templateTaskHint === 'contract-risk') {
    return 'risk';
  }
  return 'generic';
}

function buildConceptSections(dimension: string, templateTaskHint?: KnowledgeTemplateTaskHint | null) {
  if (templateTaskHint === 'resume-comparison') {
    if (dimension === 'company') return ['公司概览', '重点项目分布', '候选人覆盖', '技术关键词', '风险与机会', 'AI综合分析'];
    if (dimension === 'project') return ['项目概览', '公司分布', '候选人参与', '技术关键词', '交付信号', 'AI综合分析'];
    if (dimension === 'skill') return ['技能概览', '候选人覆盖', '公司分布', '相关项目', '技能风险', 'AI综合分析'];
    return ['人才概览', '学历与背景', '公司经历', '项目经历', '核心能力', 'AI综合分析'];
  }
  if (templateTaskHint === 'bids-static-page' || templateTaskHint === 'bids-table') {
    if (dimension === 'risk') return ['风险概览', '资格风险', '材料缺口', '时间风险', '应答建议', 'AI综合分析'];
    if (dimension === 'section') return ['章节概览', '资格条件', '关键节点', '应答重点', '补充材料', 'AI综合分析'];
    return ['项目概况', '资格条件', '关键时间节点', '应答重点', '风险提醒', 'AI综合分析'];
  }
  if (templateTaskHint === 'paper-static-page' || templateTaskHint === 'paper-table') {
    if (dimension === 'method') return ['研究概览', '研究设计', '研究对象', '关键指标', '证据质量', 'AI综合分析'];
    if (dimension === 'result') return ['研究概览', '核心发现', '结果指标', '证据来源', '局限与风险', 'AI综合分析'];
    return ['研究概览', '研究结论', '适用人群', '证据等级', '局限与建议', 'AI综合分析'];
  }
  if (templateTaskHint === 'order-static-page') {
    if (dimension === 'platform') return ['经营摘要', '平台对比', '品类覆盖', '销量趋势', '库存与备货建议', 'AI综合分析'];
    if (dimension === 'category') return ['经营摘要', '品类对比', '平台覆盖', '销量趋势', '库存与备货建议', 'AI综合分析'];
    return ['经营摘要', '核心指标', '库存与预测', '异常波动', '备货建议', 'AI综合分析'];
  }
  if (templateTaskHint === 'technical-summary' || templateTaskHint === 'iot-static-page' || templateTaskHint === 'iot-table') {
    if (dimension === 'module') return ['模块概览', '设备与网关', '平台能力', '接口集成', '交付关系', 'AI综合分析'];
    if (dimension === 'value') return ['价值概览', '业务收益', '交付稳定性', '关键能力', '风险提示', 'AI综合分析'];
    return ['方案摘要', '场景概览', '模块能力', '集成与部署', '价值与风险', 'AI综合分析'];
  }
  if (templateTaskHint === 'formula-static-page') {
    return ['方案摘要', '核心成分', '适用人群', '作用机制', '证据依据', 'AI综合分析'];
  }
  if (templateTaskHint === 'contract-risk') {
    return ['合同摘要', '关键条款', '付款与交付', '风险提示', '行动建议', 'AI综合分析'];
  }
  return ['摘要', '核心指标', '重点分析', '行动建议', 'AI综合分析'];
}

function buildConceptGroupingHints(
  documents: Awaited<ReturnType<typeof loadParsedDocuments>>['items'],
  dimension: string,
) {
  const values = documents.flatMap((item) => {
    const profile = (item.structuredProfile || {}) as Record<string, unknown>;
    if (dimension === 'company') {
      return collectStructuredValues(profile, ['companies', 'latestCompany', 'organizationSignals']);
    }
    if (dimension === 'project') {
      return collectStructuredValues(profile, ['itProjectHighlights', 'projectHighlights', 'highlights']);
    }
    if (dimension === 'skill') {
      return collectStructuredValues(profile, ['skills', 'coreSkills', 'technologySignals']);
    }
    if (dimension === 'talent') {
      return collectStructuredValues(profile, ['candidateName', 'targetRole', 'currentRole']);
    }
    if (dimension === 'section' || dimension === 'response') {
      return [...collectStructuredValues(profile, ['sectionSignals', 'qualificationSignals']), ...(item.topicTags || [])];
    }
    if (dimension === 'platform') {
      return collectStructuredValues(profile, ['platforms', 'platformSignals']);
    }
    if (dimension === 'category') {
      return collectStructuredValues(profile, ['categorySignals', 'categories']);
    }
    if (dimension === 'stock') {
      return collectStructuredValues(profile, ['forecastSignals', 'inventorySignals', 'replenishmentSignals']);
    }
    if (dimension === 'method') {
      return collectStructuredValues(profile, ['methodology', 'subjectType', 'publicationSignals']);
    }
    if (dimension === 'result') {
      return collectStructuredValues(profile, ['resultSignals', 'metricSignals']);
    }
    if (dimension === 'conclusion') {
      return collectStructuredValues(profile, ['resultSignals', 'publicationSignals', 'subjectType']);
    }
    if (dimension === 'scenario') {
      return [
        ...collectStructuredValues(profile, ['targetScenario', 'industrySignals', 'customerSignals', 'deploymentMode']),
        ...(item.topicTags || []),
      ];
    }
    if (dimension === 'module') {
      return collectStructuredValues(profile, ['moduleSignals', 'interfaceType', 'integrationSignals']);
    }
    if (dimension === 'value') {
      return collectStructuredValues(profile, ['valueSignals', 'metricSignals', 'benefitSignals']);
    }
    if (dimension === 'ingredient') {
      return collectStructuredValues(profile, ['ingredientSignals', 'strainSignals', 'benefitSignals']);
    }
    if (dimension === 'risk') {
      return collectStructuredValues(profile, ['riskSignals', 'contractRiskSignals', 'qualificationSignals']);
    }
    return [...(item.topicTags || []), String(item.schemaType || item.category || '').trim()].filter(Boolean);
  });

  return countTopValues(values);
}

export function buildConceptPageSupplyBlock(input: {
  requestText: string;
  libraries: KnowledgeLibraryRef[];
  retrieval: RetrievalResult;
  timeRange?: string;
  contentFocus?: string;
  templateTaskHint?: KnowledgeTemplateTaskHint | null;
}) {
  const documents = input.retrieval.documents.slice(0, 8);
  if (!documents.length) return '';

  const dimension = detectConceptDimension(input.requestText, input.templateTaskHint);
  const sections = buildConceptSections(dimension, input.templateTaskHint);
  const groupingHints = buildConceptGroupingHints(documents as Awaited<ReturnType<typeof loadParsedDocuments>>['items'], dimension);
  const schemaHints = countTopValues(documents.map((item) => String(item.schemaType || item.category || 'generic')));
  const topicHints = countTopValues(documents.flatMap((item) => Array.isArray(item.topicTags) ? item.topicTags : []));
  const detailedCount = documents.filter((item) => item.parseStage === 'detailed' || item.detailParseStatus === 'succeeded').length;

  const cards = [
    `资料数量=${documents.length}`,
    `进阶解析=${detailedCount}`,
    schemaHints[0]?.label ? `主要类型=${schemaHints[0].label}` : '',
    groupingHints[0]?.label ? `核心维度=${groupingHints[0].label}` : '',
  ].filter(Boolean);

  const charts = [
    schemaHints.length ? `文档类型分布: ${schemaHints.map((item) => `${item.label} ${item.value}`).join(' | ')}` : '',
    groupingHints.length ? `核心维度分布: ${groupingHints.slice(0, 5).map((item) => `${item.label} ${item.value}`).join(' | ')}` : '',
    topicHints.length ? `主题热点: ${topicHints.slice(0, 5).map((item) => `${item.label} ${item.value}`).join(' | ')}` : '',
  ].filter(Boolean);

  return [
    'Concept page supply:',
    `Libraries: ${input.libraries.map((item) => item.label || item.key).join(' | ')}`,
    input.timeRange ? `Time range: ${input.timeRange}` : '',
    input.contentFocus ? `Content focus: ${input.contentFocus}` : '',
    input.templateTaskHint ? `Task hint: ${input.templateTaskHint}` : '',
    `Primary grouping dimension: ${dimension}`,
    `Recommended sections: ${sections.join(' | ')}`,
    cards.length ? `Recommended cards: ${cards.join(' | ')}` : '',
    charts.length ? `Recommended charts: ${charts.join(' || ')}` : '',
    groupingHints.length ? `Grouping hints: ${groupingHints.map((item) => `${item.label} (${item.value})`).join(' | ')}` : '',
    `Recent documents: ${documents.map((item) => item.title || item.name).filter(Boolean).slice(0, 6).join(' | ')}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function tokenizeKnowledgeText(text: string) {
  return String(text || '').toLowerCase().match(/[a-z0-9-]{2,}|[\u4e00-\u9fff]{2,}/g) ?? [];
}

function extractDocumentTimestamp(item: Awaited<ReturnType<typeof loadParsedDocuments>>['items'][number]) {
  const candidates = [
    Date.parse(String(item.detailParsedAt || '')),
    Date.parse(String(item.cloudStructuredAt || '')),
    Date.parse(String(item.retainedAt || '')),
  ].filter((value) => Number.isFinite(value) && value > 0);

  const match = String(item.path || '').match(/(?:^|[\\/])(\d{13})(?:[-_.]|$)/);
  if (match) {
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > 0) {
      candidates.push(value);
    }
  }

  return candidates.length ? Math.max(...candidates) : 0;
}

function prioritizeScopedItems(items: Awaited<ReturnType<typeof loadParsedDocuments>>['items']) {
  return [...items].sort((left, right) => {
    const leftDetailed = left.parseStage === 'detailed' || left.detailParseStatus === 'succeeded' ? 1 : 0;
    const rightDetailed = right.parseStage === 'detailed' || right.detailParseStatus === 'succeeded' ? 1 : 0;
    if (rightDetailed !== leftDetailed) return rightDetailed - leftDetailed;
    return extractDocumentTimestamp(right) - extractDocumentTimestamp(left);
  });
}

function isRecentUploadScopedQuery(text: string) {
  return RECENT_UPLOAD_SCOPE_PATTERNS.test(String(text || ''));
}

function isRecentActivityScopedQuery(text: string) {
  return RECENT_ACTIVITY_SCOPE_PATTERNS.test(String(text || ''));
}

function isFailedParseScopedQuery(text: string) {
  return FAILED_PARSE_SCOPE_PATTERNS.test(String(text || ''));
}

function isImageScopedQuery(text: string) {
  return IMAGE_DETAIL_SCOPE_PATTERNS.test(String(text || ''));
}

function isImageDocumentItem(item: Awaited<ReturnType<typeof loadParsedDocuments>>['items'][number]) {
  return IMAGE_DOCUMENT_EXTENSIONS.has(String(item.ext || '').toLowerCase());
}

function buildFallbackScopedItems(input: {
  requestText: string;
  items: Awaited<ReturnType<typeof loadParsedDocuments>>['items'];
  timeRange?: string;
  contentFocus?: string;
}) {
  const recentUploadQuery = isRecentUploadScopedQuery(input.requestText);
  const recentActivityQuery = isRecentActivityScopedQuery(input.requestText);
  const failedParseQuery = isFailedParseScopedQuery(input.requestText);
  const imageQuery = isImageScopedQuery(input.requestText);
  if (!recentUploadQuery && !recentActivityQuery && !failedParseQuery && !imageQuery) return [];

  let fallbackItems = input.items;

  if (failedParseQuery) {
    const failedItems = input.items.filter((item) => (
      item.parseStatus === 'error' || item.detailParseStatus === 'failed'
    ));
    fallbackItems = failedItems.length ? failedItems : input.items;
  } else if (recentUploadQuery) {
    fallbackItems = filterDocumentsByTimeRange(
      input.items,
      input.timeRange || 'recent-upload',
    );
  } else if (recentActivityQuery) {
    const recentlyDetailedItems = input.items.filter((item) => (
      item.parseStage === 'detailed'
      || item.detailParseStatus === 'succeeded'
      || Boolean(item.detailParsedAt)
    ));
    const recentlyParsedItems = recentlyDetailedItems.length
      ? recentlyDetailedItems
      : input.items.filter((item) => item.parseStatus === 'parsed');
    fallbackItems = filterDocumentsByTimeRange(
      recentlyParsedItems.length ? recentlyParsedItems : input.items,
      input.timeRange,
    );
  } else {
    fallbackItems = filterDocumentsByTimeRange(input.items, input.timeRange);
  }

  if (imageQuery) {
    const imageItems = fallbackItems.filter(isImageDocumentItem);
    fallbackItems = imageItems.length ? imageItems : input.items.filter(isImageDocumentItem);
  }

  fallbackItems = filterDocumentsByContentFocus(fallbackItems, input.contentFocus);
  return prioritizeScopedItems(fallbackItems);
}

function looksLikeOperationalFeedback(text: string) {
  const source = String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!source) return true;

  const noisyTokens = [
    '上传',
    '采集',
    '入库',
    '分组',
    '保存',
    '删除',
    '凭据',
    '数据源',
    '运行记录',
    '云端模型暂时不可用',
    '云端回复暂不可用',
    '知识库分组更新失败',
    '已确认分组',
    '已保存',
    '已删除',
    '已取消',
    'upload',
    'uploaded successfully',
    'ingest',
    'saved',
    'deleted',
    'credential',
    'datasource',
    'run record',
    'cloud model unavailable',
    'cloud reply unavailable',
    'group update failed',
  ];

  return noisyTokens.some((token) => source.includes(token)) && source.length <= 120;
}

export function buildKnowledgeChatHistory(chatHistory: ChatHistoryItem[], requestText: string) {
  const cleaned = chatHistory
    .map((item) => ({
      role: item.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: String(item.content || '').trim(),
    }))
    .filter((item) => item.content)
    .filter((item) => !looksLikeOperationalFeedback(item.content));

  if (!cleaned.length) return [];

  const requestTerms = new Set(tokenizeKnowledgeText(requestText));
  const selectedIndexes = new Set(cleaned.map((_, index) => index).slice(-4));
  const relevantIndexes = cleaned
    .map((item, index) => {
      const overlap = tokenizeKnowledgeText(item.content).filter((token) => requestTerms.has(token)).length;
      return { index, overlap, role: item.role };
    })
    .filter((item) => item.overlap > 0)
    .sort((left, right) => {
      if (right.overlap !== left.overlap) return right.overlap - left.overlap;
      if (left.role !== right.role) return left.role === 'user' ? -1 : 1;
      return right.index - left.index;
    })
    .slice(0, 3)
    .map((item) => item.index);

  for (const index of relevantIndexes) {
    selectedIndexes.add(index);
  }

  return Array.from(selectedIndexes)
    .sort((left, right) => left - right)
    .slice(-6)
    .map((index) => cleaned[index]);
}

export function normalizePreferredLibraries(preferredLibraries?: KnowledgeLibraryRef[]) {
  return Array.isArray(preferredLibraries)
    ? preferredLibraries
        .map((item) => ({ key: String(item?.key || '').trim(), label: String(item?.label || '').trim() }))
        .filter((item) => item.key || item.label)
    : [];
}

async function resolveKnowledgeScope(
  requestText: string,
  chatHistory: ChatHistoryItem[],
  preferredLibraries: KnowledgeLibraryRef[],
  timeRange?: string,
  contentFocus?: string,
  preferredDocumentIds?: string[],
  botDefinition?: BotDefinition | null,
) {
  const [documentLibraries, documentState] = await Promise.all([
    loadDocumentLibraries(),
    loadParsedDocuments(240, false),
  ]);
  const preferredDocumentSet = new Set(
    Array.isArray(preferredDocumentIds)
      ? preferredDocumentIds.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
  );
  const visibleLibraries = botDefinition
    ? filterLibrariesForBot(botDefinition, documentLibraries)
    : documentLibraries;
  const visibleItems = botDefinition
    ? filterDocumentsForBot(botDefinition, documentState.items, documentLibraries)
    : documentState.items;

  const preferredKeys = new Set(preferredLibraries.map((item) => item.key));
  const preferredLabels = new Set(preferredLibraries.map((item) => item.label));
  const scoringPrompt = buildPromptForScoring(requestText, chatHistory);
  const preferredCandidates = preferredKeys.size || preferredLabels.size
    ? documentLibraries
        .filter((library) => preferredKeys.has(library.key) || preferredLabels.has(library.label))
        .map((library, index) => ({ library, score: 100 - index }))
    : [];
  const requestedCandidates = preferredCandidates.length
    ? preferredCandidates
    : collectLibraryMatches(scoringPrompt, documentLibraries);
  const visibleLibraryKeySet = new Set(visibleLibraries.map((library) => library.key));
  const visibleRequestedCandidates = requestedCandidates.filter((item) => visibleLibraryKeySet.has(item.library.key));
  const requestTargetsInvisibleLibraries = requestedCandidates.length > 0 && !visibleRequestedCandidates.length;

  if (requestTargetsInvisibleLibraries) {
    return { libraries: [], scopedItems: [] };
  }

  const scoredCandidates = preferredCandidates.length ? [] : collectLibraryMatches(scoringPrompt, visibleLibraries);
  const candidates = visibleRequestedCandidates.length ? visibleRequestedCandidates : scoredCandidates;
  let libraries = candidates.map((item) => ({ key: item.library.key, label: item.library.label }));
  const preferredScopedItems = preferredDocumentSet.size
    ? visibleItems.filter((item) => preferredDocumentSet.has(buildDocumentId(item.path)))
    : [];

  const libraryScopedItems = candidates.length
    ? visibleItems.filter((item) => candidates.some((candidate) => documentMatchesLibrary(item, candidate.library)))
    : [];
  const preferredItemsByFilters = preferredScopedItems.length
    ? prioritizeScopedItems(
      filterDocumentsByContentFocus(
        filterDocumentsByTimeRange(preferredScopedItems, timeRange),
        contentFocus,
      ),
    )
    : [];
  const baseScopedItems = preferredItemsByFilters.length
    ? preferredItemsByFilters
    : preferredScopedItems.length
      ? prioritizeScopedItems(preferredScopedItems)
      : candidates.length
        ? prioritizeScopedItems(
          filterDocumentsByContentFocus(
            filterDocumentsByTimeRange(libraryScopedItems, timeRange),
            contentFocus,
          ),
        )
        : buildFallbackScopedItems({
          requestText,
          items: visibleItems,
          timeRange,
          contentFocus,
        });

  const scopedItems = baseScopedItems;
  if (!libraries.length && scopedItems.length) {
    const derivedLibraries = documentLibraries
      .filter((library) => visibleLibraries.some((visible) => visible.key === library.key))
      .filter((library) => scopedItems.some((item) => documentMatchesLibrary(item, library)))
      .map((library) => ({ key: library.key, label: library.label }));
    if (derivedLibraries.length) {
      libraries = derivedLibraries;
    }
  }
  if (!libraries.length && scopedItems.length) {
    const ungroupedLibrary = visibleLibraries.find((item) => item.key === UNGROUPED_LIBRARY_KEY);
    if (ungroupedLibrary && scopedItems.some((item) => documentMatchesLibrary(item, ungroupedLibrary))) {
      libraries = [{ key: UNGROUPED_LIBRARY_KEY, label: ungroupedLibrary.label || UNGROUPED_LIBRARY_LABEL }];
    }
  }

  return { libraries, scopedItems };
}

export async function prepareKnowledgeScope(input: {
  requestText: string;
  chatHistory: ChatHistoryItem[];
  preferredLibraries?: KnowledgeLibraryRef[];
  timeRange?: string;
  contentFocus?: string;
  preferredDocumentIds?: string[];
  botDefinition?: BotDefinition | null;
}): Promise<KnowledgeScopeState> {
  const knowledgeChatHistory = buildKnowledgeChatHistory(input.chatHistory, input.requestText);
  const preferredLibraries = normalizePreferredLibraries(input.preferredLibraries);
  const { libraries, scopedItems } = await resolveKnowledgeScope(
    input.requestText,
    knowledgeChatHistory,
    preferredLibraries,
    input.timeRange,
    input.contentFocus,
    input.preferredDocumentIds,
    input.botDefinition,
  );

  return {
    knowledgeChatHistory,
    libraries,
    scopedItems,
  };
}

export async function prepareKnowledgeRetrieval(input: KnowledgeScopeState & {
  requestText: string;
  timeRange?: string;
  contentFocus?: string;
  docLimit: number;
  evidenceLimit: number;
  templateTaskHint?: KnowledgeTemplateTaskHint | null;
  templateSearchHints?: string[];
  preferredDocumentIds?: string[];
}): Promise<KnowledgeSupply> {
  const preferredDocumentIds = Array.isArray(input.preferredDocumentIds)
    ? input.preferredDocumentIds.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const preferredDocumentSet = new Set(preferredDocumentIds);
  const memoryScopedItems = preferredDocumentSet.size
    ? input.scopedItems.filter((item) => preferredDocumentSet.has(buildDocumentId(item.path)))
    : [];
  const retrievalScopedItems = memoryScopedItems.length ? memoryScopedItems : input.scopedItems;

  const retrieval = await retrieveKnowledgeMatches(
    retrievalScopedItems,
    buildKnowledgeRetrievalQuery(input.requestText, input.libraries, {
      timeRange: input.timeRange,
      contentFocus: input.contentFocus,
    }),
    {
      docLimit: input.docLimit,
      evidenceLimit: input.evidenceLimit,
      templateTaskHint: input.templateTaskHint || undefined,
      templateSearchHints: input.templateSearchHints,
    },
  );

  const effectiveRetrieval =
    retrieval.documents.length || retrieval.evidenceMatches.length
      ? retrieval
      : {
          ...(() => {
            const fallback = buildLibraryFallbackRetrieval(retrievalScopedItems);
            return {
              ...fallback,
              evidenceMatches: fallback.evidenceMatches.map((entry, index) => ({
                ...entry,
                chunkId: `fallback-${index + 1}`,
              })),
            };
          })(),
          meta: {
            ...retrieval.meta,
            candidateCount: retrievalScopedItems.length,
            rerankedCount: Math.min(retrievalScopedItems.length, 6),
          },
        };

  return {
    knowledgeChatHistory: input.knowledgeChatHistory,
    libraries: input.libraries,
    effectiveRetrieval,
  };
}

export async function prepareKnowledgeSupply(input: {
  requestText: string;
  chatHistory: ChatHistoryItem[];
  preferredLibraries?: KnowledgeLibraryRef[];
  timeRange?: string;
  contentFocus?: string;
  docLimit: number;
  evidenceLimit: number;
  templateTaskHint?: KnowledgeTemplateTaskHint | null;
  templateSearchHints?: string[];
  preferredDocumentIds?: string[];
  botDefinition?: BotDefinition | null;
}): Promise<KnowledgeSupply> {
  const scopeState = await prepareKnowledgeScope(input);
  return prepareKnowledgeRetrieval({
    requestText: input.requestText,
    timeRange: input.timeRange,
    contentFocus: input.contentFocus,
    docLimit: input.docLimit,
    evidenceLimit: input.evidenceLimit,
    templateTaskHint: input.templateTaskHint,
    templateSearchHints: input.templateSearchHints,
    preferredDocumentIds: input.preferredDocumentIds,
    ...scopeState,
  });
}
