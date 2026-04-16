import type { DocumentEvidenceMatch } from './document-store.js';
import { collectPromptTokens, containsAny, isResumeCompanyProjectPrompt } from './document-retrieval-heuristics.js';
import type { TemplateTask } from './document-retrieval-template-candidates.js';
import {
  isFootfallTemplateCandidate,
  isHighValueKnowledgeDocument,
  isIotTemplateCandidate,
  isOrderTemplateCandidate,
  isPurePaperCandidate,
  matchesTemplateTask,
} from './document-retrieval-template-candidates.js';
import { normalizeEvidenceChunkText } from './document-retrieval-ranking-scoring-support.js';

export function scoreEvidenceTemplateFit(entry: DocumentEvidenceMatch, prompt: string, templateTask: TemplateTask) {
  let score = entry.score;
  const chunkText = normalizeEvidenceChunkText(entry.chunkText);
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
