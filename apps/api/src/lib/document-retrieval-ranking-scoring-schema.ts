import type { ParsedDocument } from './document-parser.js';
import { containsAny, normalizePrompt } from './document-retrieval-heuristics.js';
import type { RetrievalIntent, TemplateTask } from './document-retrieval-template-candidates.js';
import {
  hasFormulaLibraryBias,
  isBidTemplateCandidate,
  isFootfallTemplateCandidate,
  isIotTemplateCandidate,
  isOrderTemplateCandidate,
  isPurePaperCandidate,
} from './document-retrieval-template-candidates.js';

export function scoreSchemaFit(item: ParsedDocument, prompt: string, intent: RetrievalIntent, templateTask: TemplateTask) {
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
