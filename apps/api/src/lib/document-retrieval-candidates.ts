import path from 'node:path';
import type { ParsedDocument } from './document-parser.js';
import {
  isFootfallDocumentSignal,
  isIotDocumentSignal,
  isPaperDocumentSignal,
} from './document-domain-signals.js';
import type { DocumentEvidenceMatch } from './document-store.js';
import { STORAGE_FILES_DIR } from './paths.js';
import {
  collectPromptTokens,
  containsAny,
  isResumeCompanyProjectPrompt,
  normalizePrompt,
} from './document-retrieval-heuristics.js';

type RetrievalIntent = 'generic' | 'formula' | 'paper' | 'technical' | 'contract' | 'resume' | 'iot' | 'footfall';
type TemplateTask =
  | 'general'
  | 'resume-comparison'
  | 'formula-table'
  | 'formula-static-page'
  | 'bids-table'
  | 'bids-static-page'
  | 'footfall-static-page'
  | 'paper-table'
  | 'paper-static-page'
  | 'paper-summary'
  | 'technical-summary'
  | 'contract-risk'
  | 'order-static-page'
  | 'iot-table'
  | 'iot-static-page'
  | 'static-page';

function startsWithPath(filePath: string, rootPath: string) {
  const normalizedFile = path.resolve(String(filePath || '')).toLowerCase();
  const normalizedRoot = path.resolve(String(rootPath || '')).toLowerCase();
  return normalizedFile === normalizedRoot || normalizedFile.startsWith(`${normalizedRoot}${path.sep}`.toLowerCase());
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
    || item.cloudStructuredAt,
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
  if ((templateTask === 'paper-summary' || templateTask === 'paper-static-page' || templateTask === 'paper-table') && isPurePaperCandidate(item)) score += 12;
  if (templateTask === 'resume-comparison' && item.schemaType === 'resume') score += 12;
  if ((templateTask === 'formula-table' || templateTask === 'formula-static-page') && item.schemaType === 'formula') score += 12;
  if ((templateTask === 'bids-table' || templateTask === 'bids-static-page') && matchesTemplateTask(item, templateTask)) score += 14;
  if ((templateTask === 'iot-static-page' || templateTask === 'iot-table') && isIotTemplateCandidate(item)) score += 14;
  if (templateTask === 'footfall-static-page' && isFootfallTemplateCandidate(item)) score += 16;

  return score;
}

function isPaperLikeDocument(item: ParsedDocument) {
  return isPaperDocumentSignal(item);
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

function isFootfallTemplateCandidate(item: ParsedDocument) {
  const profileText = JSON.stringify(item.structuredProfile || {}).toLowerCase();
  const summaryText = `${item.title || ''} ${item.summary || ''} ${(item.topicTags || []).join(' ')}`.toLowerCase();
  return (
    isFootfallDocumentSignal(item)
    || (
      String(item.schemaType || '').toLowerCase() === 'report'
      && /(footfall|visitor|客流|人流|商场分区|mall zone|shopping zone)/.test(`${summaryText} ${profileText}`)
      && isHighValueKnowledgeDocument(item)
    )
  );
}

function isIotTemplateCandidate(item: ParsedDocument) {
  const text = `${(item.confirmedGroups || []).join(' ')} ${(item.groups || []).join(' ')} ${item.title || ''} ${item.summary || ''}`.toLowerCase();
  return (
    isIotDocumentSignal(item)
    && /(iot|物联网|设备|网关|传感|平台|解决方案)/.test(text)
    && isHighValueKnowledgeDocument(item)
  );
}

function isBidTemplateCandidate(item: ParsedDocument) {
  const text = `${(item.confirmedGroups || []).join(' ')} ${(item.groups || []).join(' ')} ${item.title || ''} ${item.summary || ''}`.toLowerCase();
  return /(bids?|tender|rfp|proposal|标书|招标|投标)/.test(text) && isHighValueKnowledgeDocument(item);
}

export function matchesTemplateTask(item: ParsedDocument, templateTask: TemplateTask) {
  if (templateTask === 'resume-comparison') return isReliableResumeCandidate(item);
  if (templateTask === 'formula-table' || templateTask === 'formula-static-page') return item.schemaType === 'formula';
  if (templateTask === 'paper-summary' || templateTask === 'paper-static-page' || templateTask === 'paper-table') return isPurePaperCandidate(item);
  if (templateTask === 'technical-summary') return item.schemaType === 'technical';
  if (templateTask === 'contract-risk') return item.schemaType === 'contract';
  if (templateTask === 'order-static-page') return isOrderTemplateCandidate(item);
  if (templateTask === 'footfall-static-page') return isFootfallTemplateCandidate(item);
  if (templateTask === 'iot-static-page' || templateTask === 'iot-table') return isIotTemplateCandidate(item);
  if (templateTask === 'bids-table' || templateTask === 'bids-static-page') return isBidTemplateCandidate(item);
  return true;
}

export function selectTemplateCandidates(items: ParsedDocument[], templateTask: TemplateTask) {
  if (templateTask === 'resume-comparison') {
    return items.filter((item) => isReliableResumeCandidate(item)).sort((a, b) => scoreCandidatePreference(b, templateTask) - scoreCandidatePreference(a, templateTask));
  }
  if (templateTask === 'formula-table' || templateTask === 'formula-static-page') {
    return items.filter((item) => item.schemaType === 'formula').sort((a, b) => scoreCandidatePreference(b, templateTask) - scoreCandidatePreference(a, templateTask));
  }
  if (templateTask === 'paper-summary' || templateTask === 'paper-static-page' || templateTask === 'paper-table') {
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
  if (templateTask === 'footfall-static-page') {
    return items.filter((item) => isFootfallTemplateCandidate(item)).sort((a, b) => scoreCandidatePreference(b, templateTask) - scoreCandidatePreference(a, templateTask));
  }
  if (templateTask === 'iot-static-page' || templateTask === 'iot-table') {
    return items.filter((item) => isIotTemplateCandidate(item)).sort((a, b) => scoreCandidatePreference(b, templateTask) - scoreCandidatePreference(a, templateTask));
  }
  if (templateTask === 'bids-table' || templateTask === 'bids-static-page') {
    return items.filter((item) => isBidTemplateCandidate(item)).sort((a, b) => scoreCandidatePreference(b, templateTask) - scoreCandidatePreference(a, templateTask));
  }
  return [];
}

export function preselectDocumentsByTemplateTask(items: ParsedDocument[], templateTask: TemplateTask, prompt: string) {
  const templateCandidates = selectTemplateCandidates(items, templateTask);
  if (!templateCandidates.length) return items;

  if (
    templateTask === 'resume-comparison'
    || templateTask === 'paper-summary'
    || templateTask === 'paper-static-page'
    || templateTask === 'paper-table'
    || templateTask === 'technical-summary'
    || templateTask === 'order-static-page'
    || templateTask === 'footfall-static-page'
    || templateTask === 'iot-static-page'
    || templateTask === 'iot-table'
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

export function preselectEvidencePoolByTemplateTask(items: ParsedDocument[], templateTask: TemplateTask) {
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
  if (
    item.schemaType === 'report'
    && containsAny(text, ['footfall', 'visitor', 'visitors', 'mall traffic', '客流', '人流', '商场分区', '楼层分区'])
    && isFootfallTemplateCandidate(item)
  ) {
    score += 16;
  }

  if (intent !== 'generic') {
    if (item.schemaType === intent) score += 22;
    else if (intent === 'paper' && item.schemaType === 'formula') score -= 30;
    else if (intent === 'iot' && !isIotTemplateCandidate(item) && item.schemaType !== 'technical') score -= 14;
    else if (intent === 'footfall' && !isFootfallTemplateCandidate(item)) score -= 14;
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

  if (intent === 'iot') {
    if (isIotTemplateCandidate(item)) score += 16;
    if (containsAny(text, ['iot', '物联网', 'device', 'gateway', 'sensor', '设备', '网关', '传感', '平台']) && isIotTemplateCandidate(item)) score += 10;
    if (item.schemaType === 'formula') score -= 12;
  }
  if (intent === 'footfall') {
    if (isFootfallTemplateCandidate(item)) score += 18;
    if (containsAny(text, ['footfall', 'visitor', 'visitors', 'mall traffic', '客流', '人流', '商场分区', '楼层分区']) && isFootfallTemplateCandidate(item)) score += 10;
  }

  if (templateTask === 'resume-comparison') {
    score += item.schemaType === 'resume' ? 24 : -24;
  } else if (templateTask === 'formula-table' || templateTask === 'formula-static-page') {
    if (item.schemaType === 'formula') score += 20;
    else if (item.schemaType === 'paper') score -= 8;
  } else if (templateTask === 'order-static-page') {
    score += isOrderTemplateCandidate(item) ? 18 : -8;
  } else if (templateTask === 'footfall-static-page') {
    score += isFootfallTemplateCandidate(item) ? 22 : -10;
  } else if (templateTask === 'technical-summary') {
    if (item.schemaType === 'technical') score += 16;
    else if (item.schemaType === 'formula') score -= 12;
  } else if (templateTask === 'paper-summary' || templateTask === 'paper-static-page' || templateTask === 'paper-table') {
    if (isPurePaperCandidate(item)) score += 18;
    else if (hasFormulaLibraryBias(item)) score -= 16;
  } else if (templateTask === 'iot-static-page' || templateTask === 'iot-table') {
    if (isIotTemplateCandidate(item)) score += 18;
    else if (item.schemaType === 'formula') score -= 14;
  } else if (templateTask === 'bids-table' || templateTask === 'bids-static-page') {
    score += isBidTemplateCandidate(item) ? 22 : -14;
  }

  return score;
}

function collectAliasProfileData(profile: Record<string, unknown>) {
  const fieldTemplate =
    profile.fieldTemplate && typeof profile.fieldTemplate === 'object'
      ? (profile.fieldTemplate as Record<string, unknown>)
      : null;
  const fieldAliases =
    fieldTemplate?.fieldAliases && typeof fieldTemplate.fieldAliases === 'object'
      ? (fieldTemplate.fieldAliases as Record<string, unknown>)
      : null;
  const aliasMaps = [profile.focusedAliasFields, profile.aliasFields]
    .filter((entry) => entry && typeof entry === 'object') as Array<Record<string, unknown>>;

  const aliasNames = new Set<string>();
  const aliasValues = new Set<string>();

  for (const [canonicalField, aliasValue] of Object.entries(fieldAliases || {})) {
    const normalizedAliasName = String(aliasValue || '').trim();
    if (normalizedAliasName) aliasNames.add(normalizedAliasName.toLowerCase());

    const canonicalValue = String(profile[canonicalField] || '').trim();
    if (canonicalValue) aliasValues.add(canonicalValue.toLowerCase());
  }

  for (const aliasMap of aliasMaps) {
    for (const [aliasName, aliasValue] of Object.entries(aliasMap)) {
      const normalizedAliasName = String(aliasName || '').trim();
      const normalizedAliasValue = String(aliasValue || '').trim();
      if (normalizedAliasName) aliasNames.add(normalizedAliasName.toLowerCase());
      if (normalizedAliasValue) aliasValues.add(normalizedAliasValue.toLowerCase());
    }
  }

  return {
    aliasNamesText: [...aliasNames].join(' '),
    aliasValuesText: [...aliasValues].join(' '),
  };
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

  const { aliasNamesText, aliasValuesText } = collectAliasProfileData(profile as Record<string, unknown>);
  if (aliasNamesText || aliasValuesText) {
    for (const token of tokens) {
      if (aliasNamesText.includes(token)) score += token.length >= 4 ? 8 : 4;
      if (aliasValuesText.includes(token)) score += token.length >= 4 ? 5 : 3;
    }
  }

  const profileText = JSON.stringify(profile);
  if (templateTask === 'resume-comparison' && /(education|latestcompany|skills|yearsofexperience|candidatename)/i.test(profileText)) score += 12;
  if (templateTask === 'resume-comparison' && isResumeCompanyProjectPrompt(prompt)) {
    if (/(companies|latestcompany)/i.test(profileText)) score += 14;
    if (/(projecthighlights)/i.test(profileText)) score += 16;
    if (/(itprojecthighlights)/i.test(profileText)) score += 20;
    if (/(skills)/i.test(profileText)) score += 6;
  }
  if ((templateTask === 'formula-table' || templateTask === 'formula-static-page') && /(ingredientsignals|strainsignals|targetscenario|intendedaudience|productform)/i.test(profileText)) score += 10;
  if (templateTask === 'order-static-page') {
    if (/(platformsignals|categorysignals|metricsignals|replenishmentsignals|salescyclesignals|forecastsignals|anomalysignals|operatingsignals|keymetrics|platforms)/i.test(profileText)) score += 14;
    if (/(forecast|inventory|sales|replenishment|restock|yoy|mom|inventory-index|platform|gmv|sell-through)/i.test(profileText)) score += 10;
  }
  if (templateTask === 'footfall-static-page') {
    if (/(reportfocus|totalfootfall|topmallzone|mallzonecount|aggregationlevel|mallzones)/i.test(profileText)) score += 14;
    if (/(footfall|visitor|客流|人流|mall zone|shopping zone|商场分区)/i.test(profileText)) score += 10;
  }
  if (templateTask === 'technical-summary' && /(interfacetype|deploymentmode|integrationsignals|modulesignals|metricsignals)/i.test(profileText)) score += 10;
  if ((templateTask === 'paper-summary' || templateTask === 'paper-static-page' || templateTask === 'paper-table') && /(methodology|subjecttype|resultsignals|metricsignals|publicationsignals)/i.test(profileText)) score += 10;
  if ((templateTask === 'iot-static-page' || templateTask === 'iot-table') && /(interfacetype|deploymentmode|integrationsignals|modulesignals|metricsignals|valuesignals|benefitsignals)/i.test(profileText)) score += 12;
  return score;
}

export function scoreEvidenceTemplateFit(entry: DocumentEvidenceMatch, prompt: string, templateTask: TemplateTask) {
  let score = entry.score;
  const chunkText = (typeof entry.chunkText === 'string'
    ? entry.chunkText
    : typeof (entry.chunkText as any)?.text === 'string'
      ? (entry.chunkText as any).text
      : String(entry.chunkText || '')).toLowerCase();
  const item = entry.item;

  if (templateTask === 'resume-comparison') {
    score += item.schemaType === 'resume' ? 10 : -20;
    if (isResumeCompanyProjectPrompt(prompt) && containsAny(chunkText, ['company', 'project', 'system', 'platform', 'api', 'implementation', 'development', 'architecture', '技术', '项目', '系统', '平台', '接口', '开发', '实施', '架构'])) score += 14;
    if (containsAny(chunkText, ['education', 'company', 'skill', 'experience', '学历', '公司', '能力'])) score += 8;
  } else if (templateTask === 'paper-summary' || templateTask === 'paper-static-page' || templateTask === 'paper-table') {
    score += isPurePaperCandidate(item) ? 10 : -12;
    if (containsAny(chunkText, ['method', 'result', 'conclusion', 'abstract', '方法', '结果', '结论'])) score += 8;
  } else if (templateTask === 'iot-static-page' || templateTask === 'iot-table') {
    score += isIotTemplateCandidate(item) ? 10 : -12;
    if (containsAny(chunkText, ['iot', '物联网', 'device', 'gateway', 'sensor', 'module', 'platform', 'api', 'integration', '场景', '模块', '网关', '设备', '平台', '接口', '集成'])) score += 10;
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
  } else if (templateTask === 'footfall-static-page') {
    score += isFootfallTemplateCandidate(item) ? 10 : -12;
    if (containsAny(chunkText, ['footfall', 'visitor', 'visitors', 'mall traffic', '客流', '人流', 'mall zone', 'shopping zone', '商场分区'])) score += 12;
    if (containsAny(chunkText, ['floor zone', 'room unit', '楼层分区', '单间', '铺位'])) score += 4;
  }

  if (!prompt) return score;
  for (const token of collectPromptTokens(prompt)) {
    if (chunkText.includes(token)) score += token.length >= 4 ? 2 : 1;
  }
  return score;
}

export function buildFallbackEvidenceFromDocuments(documents: ParsedDocument[], templateTask: TemplateTask, evidenceLimit: number): DocumentEvidenceMatch[] {
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

export function rerankDocuments(
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

export function finalizeDocuments(documents: ParsedDocument[], intent: RetrievalIntent, templateTask: TemplateTask, limit: number) {
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
  if (templateTask === 'footfall-static-page') {
    const footfallDocs = documents.filter((item) => isFootfallTemplateCandidate(item));
    return (footfallDocs.length ? footfallDocs : documents).slice(0, limit);
  }
  if (templateTask === 'iot-static-page' || templateTask === 'iot-table') {
    const iotDocs = documents.filter((item) => isIotTemplateCandidate(item));
    return (iotDocs.length ? iotDocs : documents).slice(0, limit);
  }
  if (templateTask === 'bids-table' || templateTask === 'bids-static-page') {
    const bidDocs = documents.filter((item) => isBidTemplateCandidate(item));
    return bidDocs.slice(0, limit);
  }
  if (templateTask === 'paper-summary' || templateTask === 'paper-static-page' || templateTask === 'paper-table') {
    const papers = documents.filter((item) => isPurePaperCandidate(item));
    return (papers.length ? papers : documents).slice(0, limit);
  }
  if (intent === 'paper') {
    const papers = documents.filter((item) => isPurePaperCandidate(item));
    return (papers.length ? papers : documents).slice(0, limit);
  }
  return documents.slice(0, limit);
}
