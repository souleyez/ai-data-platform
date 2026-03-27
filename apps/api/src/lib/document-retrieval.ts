import path from 'node:path';
import type { ParsedDocument } from './document-parser.js';
import {
  matchDocumentEvidenceByPrompt,
  matchDocumentsByPrompt,
  type DocumentEvidenceMatch,
} from './document-store.js';
import { searchDocumentVectorIndex } from './document-vector-index.js';
import { STORAGE_FILES_DIR } from './paths.js';

export type RetrievalStage = 'rule' | 'vector' | 'rerank';
export type RetrievalIntent = 'generic' | 'formula' | 'paper' | 'technical' | 'contract' | 'resume';
export type TemplateTask =
  | 'general'
  | 'resume-comparison'
  | 'formula-table'
  | 'formula-static-page'
  | 'bids-table'
  | 'bids-static-page'
  | 'paper-summary'
  | 'technical-summary'
  | 'contract-risk'
  | 'order-static-page'
  | 'static-page';

export type RetrievalResult = {
  documents: ParsedDocument[];
  evidenceMatches: DocumentEvidenceMatch[];
  meta: {
    stages: RetrievalStage[];
    vectorEnabled: boolean;
    candidateCount: number;
    rerankedCount: number;
    intent: RetrievalIntent;
    templateTask: TemplateTask;
  };
};

const VECTOR_RETRIEVAL_ENABLED = process.env.ENABLE_VECTOR_RETRIEVAL !== '0';

function startsWithPath(filePath: string, rootPath: string) {
  const normalizedFile = path.resolve(String(filePath || '')).toLowerCase();
  const normalizedRoot = path.resolve(String(rootPath || '')).toLowerCase();
  return normalizedFile === normalizedRoot || normalizedFile.startsWith(`${normalizedRoot}${path.sep}`.toLowerCase());
}

function normalizePrompt(prompt: string) {
  return String(prompt || '').trim().toLowerCase();
}

function containsAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function collectPromptTokens(prompt: string) {
  const text = normalizePrompt(prompt);
  if (!text) return [];

  const asciiTokens = text
    .split(/[^a-z0-9]+/i)
    .filter((entry) => entry.length >= 2);

  const cjkTokens: string[] = [];
  const compact = text.replace(/\s+/g, '');
  for (let index = 0; index < compact.length - 1; index += 1) {
    const slice = compact.slice(index, index + 2);
    if (/[\u4e00-\u9fff]{2}/.test(slice)) cjkTokens.push(slice);
  }

  return [...new Set([...asciiTokens, ...cjkTokens])].slice(0, 24);
}

function expandPromptBySchema(prompt: string) {
  const normalized = normalizePrompt(prompt);
  const expansions: string[] = [prompt];

  if (containsAny(normalized, ['formula', '配方', '奶粉', '益生菌', '菌株', 'ingredient', 'strain', 'hmo', 'nutrition'])) {
    expansions.push('formula probiotic strain ingredient hmo nutrition audience dosage evidence 配方 奶粉 益生菌 菌株 成分 人群 剂量');
  }
  if (containsAny(normalized, ['paper', '论文', '研究', 'study', 'trial', 'randomized', 'placebo', 'abstract', 'methods', 'results', 'journal'])) {
    expansions.push('paper study randomized placebo abstract methods results journal publication 论文 研究 方法 结果 结论 指标');
  }
  if (containsAny(normalized, ['technical', '技术', 'api', 'sdk', 'deploy', 'deployment', 'architecture', 'integration', '接口', '部署'])) {
    expansions.push('technical api sdk deployment architecture integration technical-summary 技术 接口 部署 架构 集成 模块');
  }
  if (containsAny(normalized, ['contract', '合同', '条款', 'payment', 'breach', 'legal'])) {
    expansions.push('contract clause payment breach obligation legal 合同 条款 付款 回款 违约 法务');
  }
  if (containsAny(normalized, ['resume', 'cv', 'candidate', 'talent', '简历', '候选人'])) {
    expansions.push('resume cv candidate talent education company skills age interview 简历 候选人 第一学历 就职公司 核心能力 年龄');
  }
  if (containsAny(normalized, ['order', '订单', 'sales', '销量', 'inventory', '库存', '备货', '同比', '环比'])) {
    expansions.push('order sales inventory replenishment forecast 同比 环比 预测销量 备货 库存指数 电商平台 品类');
  }
  if (containsAny(normalized, ['bid', 'bids', 'tender', 'rfp', 'proposal', '标书', '招标', '投标'])) {
    expansions.push('bids tender proposal section response risk material evidence 标书 招标 投标 章节 应答 材料 风险 证据');
  }

  return expansions.join(' ');
}

function detectTemplateTask(prompt: string): TemplateTask {
  const text = normalizePrompt(prompt);
  if (!text) return 'general';

  if (containsAny(text, ['resume', 'cv', 'candidate', '简历', '候选人']) && containsAny(text, ['table', 'comparison', '表格', '对比'])) {
    return 'resume-comparison';
  }
  if (containsAny(text, ['bid', 'bids', 'tender', 'rfp', 'proposal', '标书', '招标', '投标']) && containsAny(text, ['static page', 'static-page', 'dashboard', 'summary', '静态页', '摘要'])) {
    return 'bids-static-page';
  }
  if (containsAny(text, ['bid', 'bids', 'tender', 'rfp', 'proposal', '标书', '招标', '投标']) && containsAny(text, ['table', 'response', 'risk', 'section', 'materials', 'report', '表格', '应答'])) {
    return 'bids-table';
  }
  if (containsAny(text, ['formula', '配方', '奶粉', '益生菌', '菌株']) && containsAny(text, ['static page', 'static-page', 'dashboard', '静态页', '可视化页'])) {
    return 'formula-static-page';
  }
  if (containsAny(text, ['formula', '配方', '奶粉', '益生菌', '菌株']) && containsAny(text, ['table', 'report', '表格', '报表'])) {
    return 'formula-table';
  }
  if (containsAny(text, ['order', '订单', 'sales', '销量', 'inventory', '库存', '备货']) && containsAny(text, ['static page', 'static-page', 'dashboard', '静态页', '可视化页'])) {
    return 'order-static-page';
  }
  if (containsAny(text, ['contract', '合同', '条款']) && containsAny(text, ['table', 'risk', '表格', '风险'])) {
    return 'contract-risk';
  }
  if (containsAny(text, ['technical', '技术', 'api', 'sdk', 'deployment', 'architecture', '接口', '部署'])) {
    return 'technical-summary';
  }
  if (containsAny(text, ['paper', 'study', 'journal', '论文', '研究', '方法', '结果'])) {
    return 'paper-summary';
  }
  if (containsAny(text, ['static page', 'static-page', 'dashboard', '静态页', '可视化页'])) {
    return 'static-page';
  }
  return 'general';
}

function detectRetrievalIntent(prompt: string): RetrievalIntent {
  const text = normalizePrompt(prompt);
  const signalScore = {
    formula: containsAny(text, ['formula', '配方', '奶粉', '益生菌', '菌株', 'ingredient', 'strain', 'hmo', 'nutrition']) ? 2 : 0,
    paper: containsAny(text, ['paper', '论文', '研究', 'study', 'trial', 'randomized', 'placebo', 'abstract', 'methods', 'results', 'journal']) ? 2 : 0,
    technical: containsAny(text, ['technical', '技术', 'api', 'sdk', 'deploy', 'deployment', 'architecture', 'integration', '接口', '部署']) ? 2 : 0,
    contract: containsAny(text, ['contract', '合同', 'clause', '条款', 'payment', 'legal']) ? 2 : 0,
    resume: containsAny(text, ['resume', 'cv', 'candidate', 'talent', '简历', '候选人']) ? 2 : 0,
  };

  if (containsAny(text, ['journal', 'publication', 'peer review', 'peer-reviewed', 'abstract', 'methods', 'results', 'conclusion', '期刊', '发表'])) {
    signalScore.paper += 3;
  }
  if (containsAny(text, ['nutrition', 'formula', 'probiotic', 'ingredient', 'strain', 'hmo', '配方', '奶粉'])) {
    signalScore.formula += 3;
  }
  if (containsAny(text, ['api', 'sdk', 'deployment', 'architecture', 'integration', '接口', '部署'])) {
    signalScore.technical += 3;
  }

  const ranked = Object.entries(signalScore).sort((left, right) => right[1] - left[1]);
  if (ranked[0]?.[1] > 0) {
    return ranked[0][0] as RetrievalIntent;
  }
  return 'generic';
}

function hasFormulaLibraryBias(item: ParsedDocument) {
  const text = [
    ...(item.confirmedGroups || []),
    ...(item.groups || []),
    ...(item.topicTags || []),
    item.title || '',
    item.summary || '',
  ]
    .join(' ')
    .toLowerCase();

  return containsAny(text, ['formula', '配方', '奶粉', '益生菌', '菌株', 'ingredient', 'strain', 'hmo', 'gut-health', 'brain-health']);
}

function hasPaperSignals(item: ParsedDocument) {
  const profileText = JSON.stringify(item.structuredProfile || {}).toLowerCase();
  return containsAny(profileText, [
    'methodology',
    'subjecttype',
    'resultsignals',
    'metricsignals',
    'publicationsignals',
  ]);
}

function isCapturedWebArtifact(item: ParsedDocument) {
  const normalizedName = String(item.name || '').toLowerCase();
  const normalizedPath = String(item.path || '').toLowerCase();
  return (
    normalizedName.startsWith('web-')
    || normalizedPath.includes('\\captures\\')
    || normalizedPath.includes('/captures/')
    || normalizedPath.includes('\\web-captures\\')
    || normalizedPath.includes('/web-captures/')
  );
}

function isStoredKnowledgeDocument(item: ParsedDocument) {
  return startsWithPath(item.path, STORAGE_FILES_DIR);
}

function isHighValueKnowledgeDocument(item: ParsedDocument) {
  return Boolean(
    isStoredKnowledgeDocument(item)
    || (item.confirmedGroups?.length || 0) > 0
    || (item.groups?.length || 0) > 0
    || item.cloudStructuredAt
  );
}

function scoreCandidatePreference(item: ParsedDocument, templateTask: TemplateTask) {
  let score = 0;
  if (isStoredKnowledgeDocument(item)) score += 20;
  if (isHighValueKnowledgeDocument(item)) score += 16;
  if (item.cloudStructuredAt) score += 8;
  score += Math.min(item.evidenceChunks?.length || 0, 10);
  score += Math.min(item.claims?.length || 0, 6) * 2;

  if (templateTask === 'technical-summary' && item.schemaType === 'technical') score += 12;
  if (templateTask === 'technical-summary' && isStoredKnowledgeDocument(item)) score += 18;
  if (templateTask === 'paper-summary' && isPurePaperCandidate(item)) score += 12;
  if (templateTask === 'resume-comparison' && item.schemaType === 'resume') score += 12;
  if ((templateTask === 'formula-table' || templateTask === 'formula-static-page') && item.schemaType === 'formula') score += 12;
  if ((templateTask === 'bids-table' || templateTask === 'bids-static-page') && matchesTemplateTask(item, templateTask)) score += 14;

  return score;
}

function isPaperLikeDocument(item: ParsedDocument) {
  return item.schemaType === 'paper' || item.category === 'paper' || item.bizCategory === 'paper';
}

function isPurePaperCandidate(item: ParsedDocument) {
  if (!isPaperLikeDocument(item)) return false;
  if (isCapturedWebArtifact(item)) return false;
  if (hasFormulaLibraryBias(item)) return false;
  return item.schemaType === 'paper' || hasPaperSignals(item) || (item.claims?.length || 0) >= 2;
}

function isReliableResumeCandidate(item: ParsedDocument) {
  if (item.schemaType !== 'resume') return false;
  const evidence = `${item.title || item.name || ''} ${item.summary || ''}`.toLowerCase();
  const hasResumeHint = containsAny(evidence, ['resume', 'cv', 'curriculum vitae', '简历', '候选人', '求职', '应聘']);
  const ext = String(item.ext || '').toLowerCase();
  const isResumeFriendlyFile = ['.pdf', '.doc', '.docx'].includes(ext);
  const fields = (item.resumeFields || {}) as Record<string, unknown>;
  const candidateName = String(fields.candidateName || '').trim();
  const latestCompany = String(fields.latestCompany || '').trim();
  const education = String(fields.education || '').trim();
  const currentRole = String(fields.currentRole || '').trim();
  const targetRole = String(fields.targetRole || '').trim();
  const yearsOfExperience = String(fields.yearsOfExperience || '').trim();
  const skills = Array.isArray(fields.skills) ? fields.skills.map((entry) => String(entry || '').trim()).filter(Boolean) : [];
  const strongFieldCount = [latestCompany, education, currentRole, targetRole, yearsOfExperience].filter(Boolean).length;

  if (!hasResumeHint && !isResumeFriendlyFile) return false;
  if (!candidateName) return false;
  if (/^(admin|root|system|api|json|package)$/i.test(candidateName)) return false;
  if (strongFieldCount >= 2) return true;
  if (strongFieldCount >= 1 && skills.length >= 2) return true;
  return false;
}

function isOrderTemplateCandidate(item: ParsedDocument) {
  const lowerName = String(item.name || '').toLowerCase();
  const lowerPath = String(item.path || '').toLowerCase();
  const isNoise =
    lowerName === 'readme.md'
    || lowerName === 'prd.md'
    || /(小说|大纲|剧情|设定|人物小传)/.test(item.name || '')
    || lowerPath.includes('\\ai-data-platform\\docs\\')
    || lowerPath.includes('\\packages\\')
    || lowerPath.includes('\\node_modules\\');

  if (isNoise) return false;
  if (item.schemaType === 'contract') return false;
  if (!(item.category === 'report' || item.schemaType === 'report')) return false;
  return isStoredKnowledgeDocument(item) || isHighValueKnowledgeDocument(item);
}

function isBidTemplateCandidate(item: ParsedDocument) {
  const text = `${(item.confirmedGroups || []).join(' ')} ${(item.groups || []).join(' ')} ${item.title || ''} ${item.summary || ''}`.toLowerCase();
  return /(bids?|tender|rfp|proposal|标书|招标|投标)/.test(text) && isHighValueKnowledgeDocument(item);
}

function matchesTemplateTask(item: ParsedDocument, templateTask: TemplateTask) {
  if (templateTask === 'resume-comparison') return isReliableResumeCandidate(item);
  if (templateTask === 'formula-table' || templateTask === 'formula-static-page') return item.schemaType === 'formula';
  if (templateTask === 'paper-summary') return isPurePaperCandidate(item);
  if (templateTask === 'technical-summary') return item.schemaType === 'technical';
  if (templateTask === 'contract-risk') return item.schemaType === 'contract';
  if (templateTask === 'order-static-page') return isOrderTemplateCandidate(item);
  if (templateTask === 'bids-table' || templateTask === 'bids-static-page') return isBidTemplateCandidate(item);
  return true;
}

function selectTemplateCandidates(items: ParsedDocument[], templateTask: TemplateTask) {
  if (templateTask === 'resume-comparison') {
    return items.filter((item) => isReliableResumeCandidate(item)).sort((a, b) => scoreCandidatePreference(b, templateTask) - scoreCandidatePreference(a, templateTask));
  }
  if (templateTask === 'formula-table' || templateTask === 'formula-static-page') {
    return items.filter((item) => item.schemaType === 'formula').sort((a, b) => scoreCandidatePreference(b, templateTask) - scoreCandidatePreference(a, templateTask));
  }
  if (templateTask === 'paper-summary') {
    const purePaper = items.filter((item) => isPurePaperCandidate(item));
    if (purePaper.length) return purePaper.sort((a, b) => scoreCandidatePreference(b, templateTask) - scoreCandidatePreference(a, templateTask));
    return items.filter((item) => isPaperLikeDocument(item)).sort((a, b) => scoreCandidatePreference(b, templateTask) - scoreCandidatePreference(a, templateTask));
  }
  if (templateTask === 'technical-summary') {
    return items
      .filter((item) => item.schemaType === 'technical' || item.category === 'technical')
      .sort((a, b) => scoreCandidatePreference(b, templateTask) - scoreCandidatePreference(a, templateTask));
  }
  if (templateTask === 'order-static-page') {
    return items.filter((item) => isOrderTemplateCandidate(item)).sort((a, b) => scoreCandidatePreference(b, templateTask) - scoreCandidatePreference(a, templateTask));
  }
  if (templateTask === 'bids-table' || templateTask === 'bids-static-page') {
    return items.filter((item) => isBidTemplateCandidate(item)).sort((a, b) => scoreCandidatePreference(b, templateTask) - scoreCandidatePreference(a, templateTask));
  }
  return [];
}

function preselectDocumentsByTemplateTask(items: ParsedDocument[], templateTask: TemplateTask, prompt: string) {
  const templateCandidates = selectTemplateCandidates(items, templateTask);
  if (!templateCandidates.length) return items;

  if (
    templateTask === 'resume-comparison'
    || templateTask === 'paper-summary'
    || templateTask === 'technical-summary'
    || templateTask === 'order-static-page'
    || templateTask === 'bids-table'
    || templateTask === 'bids-static-page'
  ) {
    return templateCandidates;
  }

  if (
    (templateTask === 'formula-table' || templateTask === 'formula-static-page')
    && containsAny(normalizePrompt(prompt), ['formula', 'ingredient', 'strain', '配方', '奶粉'])
  ) {
    return templateCandidates;
  }

  return [...templateCandidates, ...items.filter((item) => !templateCandidates.some((candidate) => candidate.path === item.path))];
}

function preselectEvidencePoolByTemplateTask(items: ParsedDocument[], templateTask: TemplateTask) {
  if (templateTask === 'general' || templateTask === 'static-page') return items;
  const filtered = items.filter((item) => matchesTemplateTask(item, templateTask));
  return filtered.length ? filtered : items;
}

function scoreSchemaFit(item: ParsedDocument, prompt: string, intent: RetrievalIntent, templateTask: TemplateTask) {
  const text = normalizePrompt(prompt);
  let score = 0;

  if (item.schemaType === 'resume' && containsAny(text, ['resume', 'cv', 'candidate', 'talent', 'interview', '简历', '候选人'])) score += 14;
  if (item.schemaType === 'contract' && containsAny(text, ['contract', 'clause', 'payment', 'breach', 'legal', '合同', '条款'])) score += 14;
  if (item.schemaType === 'paper' && containsAny(text, ['paper', 'study', 'trial', 'abstract', 'methods', 'results', '论文', '研究'])) score += 12;
  if (item.schemaType === 'technical' && containsAny(text, ['technical', 'api', 'sdk', 'deployment', 'architecture', 'device', '技术', '接口', '部署'])) score += 12;
  if (item.schemaType === 'report' && containsAny(text, ['report', 'dashboard', 'summary', '报表', '看板'])) score += 10;
  if (item.schemaType === 'formula' && containsAny(text, ['formula', 'probiotic', 'gut', 'brain', 'allergy', 'nutrition', '配方', '奶粉', '益生菌'])) score += 14;

  if (intent !== 'generic') {
    if (item.schemaType === intent) score += 22;
    else if (intent === 'paper' && item.schemaType === 'formula') score -= 30;
    else if (intent === 'technical' && item.schemaType === 'formula') score -= 18;
    else if (intent === 'formula' && (item.schemaType === 'paper' || item.schemaType === 'technical')) score -= 10;
    else if (intent === 'contract' && item.schemaType !== 'contract') score -= 10;
    else if (intent === 'resume' && item.schemaType !== 'resume') score -= 12;
  }

  if (intent === 'paper') {
    if (isPurePaperCandidate(item)) score += 16;
    if (containsAny(text, ['journal', 'publication', 'abstract', 'methods', 'results', '期刊', '发表']) && isPurePaperCandidate(item)) score += 12;
    if (hasFormulaLibraryBias(item)) score -= 22;
  }

  if (intent === 'technical') {
    if (item.category === 'technical') score += 10;
    if (containsAny(text, ['api', 'sdk', 'deployment', 'architecture', 'integration', '接口', '部署']) && item.schemaType === 'technical') score += 8;
    if (item.schemaType === 'generic' && item.category !== 'technical') score -= 16;
    if (hasFormulaLibraryBias(item)) score -= 12;
  }

  if (templateTask === 'resume-comparison') {
    score += item.schemaType === 'resume' ? 24 : -24;
  } else if (templateTask === 'formula-table' || templateTask === 'formula-static-page') {
    if (item.schemaType === 'formula') score += 20;
    else if (item.schemaType === 'paper') score -= 8;
  } else if (templateTask === 'order-static-page') {
    score += isOrderTemplateCandidate(item) ? 18 : -8;
  } else if (templateTask === 'technical-summary') {
    if (item.schemaType === 'technical') score += 16;
    else if (item.schemaType === 'formula') score -= 12;
  } else if (templateTask === 'paper-summary') {
    if (isPurePaperCandidate(item)) score += 18;
    else if (hasFormulaLibraryBias(item)) score -= 16;
  } else if (templateTask === 'bids-table' || templateTask === 'bids-static-page') {
    score += isBidTemplateCandidate(item) ? 22 : -14;
  }

  return score;
}

function scoreProfileFit(item: ParsedDocument, prompt: string, templateTask: TemplateTask) {
  const profile = item.structuredProfile || {};
  const haystack = JSON.stringify(profile).toLowerCase();
  const tokens = collectPromptTokens(prompt);
  if (!haystack || !tokens.length) return 0;

  let score = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) score += token.length >= 4 ? 4 : 2;
  }

  const profileText = JSON.stringify(profile);
  if (templateTask === 'resume-comparison' && /(education|latestcompany|skills|yearsofexperience|candidatename)/i.test(profileText)) score += 12;
  if ((templateTask === 'formula-table' || templateTask === 'formula-static-page') && /(ingredientsignals|strainsignals|targetscenario|intendedaudience|productform)/i.test(profileText)) score += 10;
  if (templateTask === 'order-static-page') {
    if (/(platformsignals|categorysignals|metricsignals|replenishmentsignals|salescyclesignals|forecastsignals|anomalysignals|operatingsignals|keymetrics|platforms)/i.test(profileText)) score += 14;
    if (/(forecast|inventory|sales|replenishment|restock|yoy|mom|inventory-index|platform|gmv|sell-through)/i.test(profileText)) score += 10;
  }
  if (templateTask === 'technical-summary' && /(interfacetype|deploymentmode|integrationsignals|modulesignals|metricsignals)/i.test(profileText)) score += 10;
  if (templateTask === 'paper-summary' && /(methodology|subjecttype|resultsignals|metricsignals|publicationsignals)/i.test(profileText)) score += 10;
  return score;
}

function scoreEvidenceTemplateFit(entry: DocumentEvidenceMatch, prompt: string, templateTask: TemplateTask) {
  let score = entry.score;
  const chunkText = (typeof entry.chunkText === 'string'
    ? entry.chunkText
    : typeof (entry.chunkText as any)?.text === 'string'
      ? (entry.chunkText as any).text
      : String(entry.chunkText || '')).toLowerCase();
  const item = entry.item;

  if (templateTask === 'resume-comparison') {
    score += item.schemaType === 'resume' ? 10 : -20;
    if (containsAny(chunkText, ['education', 'company', 'skill', 'experience', '学历', '公司', '能力'])) score += 8;
  } else if (templateTask === 'paper-summary') {
    score += isPurePaperCandidate(item) ? 10 : -12;
    if (containsAny(chunkText, ['method', 'result', 'conclusion', 'abstract', '方法', '结果', '结论'])) score += 8;
  } else if (templateTask === 'technical-summary') {
    score += item.schemaType === 'technical' ? 8 : -8;
    if (containsAny(chunkText, ['api', 'deployment', 'integration', 'module', '接口', '部署', '集成', '模块'])) score += 8;
    if (isHighValueKnowledgeDocument(item)) score += 4;
  } else if (templateTask === 'bids-table' || templateTask === 'bids-static-page') {
    score += matchesTemplateTask(item, templateTask) ? 12 : -16;
    if (containsAny(chunkText, ['section', 'chapter', 'requirement', 'response', 'material', 'qualification', 'risk', 'deadline', '应答', '材料', '风险'])) score += 10;
  } else if (templateTask === 'formula-table' || templateTask === 'formula-static-page') {
    score += item.schemaType === 'formula' ? 8 : -8;
    if (containsAny(chunkText, ['strain', 'ingredient', 'dose', 'audience', '菌株', '成分', '剂量', '人群'])) score += 8;
  } else if (templateTask === 'order-static-page') {
    score += isOrderTemplateCandidate(item) ? 8 : -10;
    if (containsAny(chunkText, ['sales', 'inventory', 'forecast', 'replenishment', 'restock', 'platform', 'category', 'gmv', 'yoy', 'mom', 'sell-through', 'stock cover', 'safety stock'])) score += 12;
    if (containsAny(chunkText, ['tmall', 'jd', 'douyin', 'pinduoduo', 'amazon', 'shopify'])) score += 8;
  }

  if (!prompt) return score;
  for (const token of collectPromptTokens(prompt)) {
    if (chunkText.includes(token)) score += token.length >= 4 ? 2 : 1;
  }
  return score;
}

function buildFallbackEvidenceFromDocuments(documents: ParsedDocument[], templateTask: TemplateTask, evidenceLimit: number): DocumentEvidenceMatch[] {
  return documents
    .flatMap((item) =>
      (item.evidenceChunks || []).map((chunk, index) => ({
        item,
        chunkId: chunk.id,
        chunkText: String(chunk.text || '').trim(),
        score: Math.max(1, (item.evidenceChunks?.length || 0) - index),
      })),
    )
    .filter((entry) => entry.chunkText)
    .sort((a, b) => scoreEvidenceTemplateFit(b, '', templateTask) - scoreEvidenceTemplateFit(a, '', templateTask))
    .slice(0, evidenceLimit);
}

function rerankDocuments(
  documents: ParsedDocument[],
  evidenceMatches: DocumentEvidenceMatch[],
  prompt: string,
  intent: RetrievalIntent,
  templateTask: TemplateTask,
  limit: number,
  vectorScores?: Map<string, number>,
) {
  const evidenceScoreByPath = new Map<string, number>();
  for (const match of evidenceMatches) {
    evidenceScoreByPath.set(match.item.path, Math.max(evidenceScoreByPath.get(match.item.path) || 0, match.score));
  }

  return [...documents]
    .map((item) => ({
      item,
      score:
        (evidenceScoreByPath.get(item.path) || 0) * 2.2
        + (vectorScores?.get(item.path) || 0) * 1.6
        + scoreSchemaFit(item, prompt, intent, templateTask)
        + scoreProfileFit(item, prompt, templateTask)
        + (item.parseStage === 'detailed' ? 6 : 0)
        + ((item.evidenceChunks?.length || 0) > 0 ? 2 : 0),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((entry) => entry.item);
}

function finalizeDocuments(documents: ParsedDocument[], intent: RetrievalIntent, templateTask: TemplateTask, limit: number) {
  if (templateTask === 'resume-comparison') {
    const resumes = documents.filter((item) => isReliableResumeCandidate(item));
    return (resumes.length ? resumes : documents).slice(0, limit);
  }
  if (templateTask === 'technical-summary') {
    const stored = documents.filter((item) => item.schemaType === 'technical' && isStoredKnowledgeDocument(item));
    const reliable = documents.filter((item) => item.schemaType === 'technical');
    return (stored.length ? stored : reliable.length ? reliable : documents).slice(0, limit);
  }
  if (templateTask === 'order-static-page') {
    const orderDocs = documents.filter((item) => isOrderTemplateCandidate(item));
    return orderDocs.slice(0, limit);
  }
  if (templateTask === 'bids-table' || templateTask === 'bids-static-page') {
    const bidDocs = documents.filter((item) => isBidTemplateCandidate(item));
    return bidDocs.slice(0, limit);
  }
  if (templateTask === 'paper-summary') {
    const papers = documents.filter((item) => isPurePaperCandidate(item));
    return (papers.length ? papers : documents).slice(0, limit);
  }
  if (intent === 'paper') {
    const papers = documents.filter((item) => isPurePaperCandidate(item));
    return (papers.length ? papers : documents).slice(0, limit);
  }
  return documents.slice(0, limit);
}

export async function retrieveKnowledgeMatches(
  items: ParsedDocument[],
  prompt: string,
  options?: { docLimit?: number; evidenceLimit?: number; templateTaskHint?: TemplateTask; templateSearchHints?: string[] },
): Promise<RetrievalResult> {
  const templateHintPrompt = (options?.templateSearchHints || []).slice(0, 24).join(' ');
  const expandedPrompt = expandPromptBySchema([prompt, templateHintPrompt].filter(Boolean).join(' '));
  const intent = detectRetrievalIntent(expandedPrompt);
  const templateTask = options?.templateTaskHint || detectTemplateTask(expandedPrompt);
  const docLimit = options?.docLimit || 18;
  const evidenceLimit = options?.evidenceLimit || 24;

  const preselectedItems = preselectDocumentsByTemplateTask(items, templateTask, expandedPrompt);
  const evidencePool = preselectEvidencePoolByTemplateTask(preselectedItems, templateTask);

  const ruleDocuments = matchDocumentsByPrompt(preselectedItems, expandedPrompt, Math.max(docLimit, 24));
  const ruleEvidence = matchDocumentEvidenceByPrompt(evidencePool, expandedPrompt, Math.max(evidenceLimit, 32));
  const templateDocuments = selectTemplateCandidates(preselectedItems, templateTask).slice(0, Math.max(docLimit, 24));

  const vectorHits = VECTOR_RETRIEVAL_ENABLED
    ? await searchDocumentVectorIndex(expandedPrompt, Math.max(docLimit, 24), { intent, templateTask })
    : [];

  const itemByPath = new Map(preselectedItems.map((item) => [item.path, item]));
  const vectorDocuments = vectorHits
    .map((hit) => itemByPath.get(hit.documentPath))
    .filter((item): item is ParsedDocument => Boolean(item));
  const vectorScores = new Map(vectorHits.map((hit) => [hit.documentPath, hit.score]));

  const combinedDocuments = [
    ...new Map([...ruleDocuments, ...templateDocuments, ...vectorDocuments].map((item) => [item.path, item])).values(),
  ];

  const rerankedDocuments = rerankDocuments(
    combinedDocuments,
    ruleEvidence,
    expandedPrompt,
    intent,
    templateTask,
    Math.max(docLimit, 24),
    vectorScores,
  );
  const finalDocuments = finalizeDocuments(rerankedDocuments, intent, templateTask, docLimit);

  const rerankedPathSet = new Set(finalDocuments.map((item) => item.path));
  let rerankedEvidence = ruleEvidence
    .filter((entry) => rerankedPathSet.has(entry.item.path))
    .filter((entry) => (templateTask === 'general' ? true : matchesTemplateTask(entry.item, templateTask)))
    .sort((left, right) => scoreEvidenceTemplateFit(right, expandedPrompt, templateTask) - scoreEvidenceTemplateFit(left, expandedPrompt, templateTask))
    .slice(0, evidenceLimit);

  if (!rerankedEvidence.length && finalDocuments.length) {
    rerankedEvidence = buildFallbackEvidenceFromDocuments(finalDocuments, templateTask, evidenceLimit);
  }

  rerankedEvidence = rerankedEvidence.map((entry) => ({
    ...entry,
    chunkText: typeof entry.chunkText === 'string'
      ? entry.chunkText
      : typeof (entry.chunkText as any)?.text === 'string'
        ? (entry.chunkText as any).text
        : String(entry.chunkText || ''),
  }));

  return {
    documents: finalDocuments,
    evidenceMatches: rerankedEvidence,
    meta: {
      stages: VECTOR_RETRIEVAL_ENABLED ? ['rule', 'vector', 'rerank'] : ['rule', 'rerank'],
      vectorEnabled: VECTOR_RETRIEVAL_ENABLED,
      candidateCount: combinedDocuments.length,
      rerankedCount: finalDocuments.length,
      intent,
      templateTask,
    },
  };
}
