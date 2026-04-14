import type { ParsedDocument } from './document-parser.js';
import type { DocumentEvidenceMatch } from './document-store.js';
import {
  collectPromptTokens,
  containsAny,
  isResumeCompanyProjectPrompt,
  normalizePrompt,
} from './document-retrieval-heuristics.js';
import {
  type RetrievalIntent,
  type TemplateTask,
  hasFormulaLibraryBias,
  isBidTemplateCandidate,
  isFootfallTemplateCandidate,
  isHighValueKnowledgeDocument,
  isIotTemplateCandidate,
  isOrderTemplateCandidate,
  isPurePaperCandidate,
  isReliableResumeCandidate,
  isStoredKnowledgeDocument,
  matchesTemplateTask,
} from './document-retrieval-template-candidates.js';

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

