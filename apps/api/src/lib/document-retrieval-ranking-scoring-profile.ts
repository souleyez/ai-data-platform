import type { ParsedDocument } from './document-parser.js';
import {
  collectPromptTokens,
  isResumeCompanyProjectPrompt,
} from './document-retrieval-heuristics.js';
import type { TemplateTask } from './document-retrieval-template-candidates.js';
import { collectAliasProfileData } from './document-retrieval-ranking-scoring-support.js';

export function scoreProfileFit(item: ParsedDocument, prompt: string, templateTask: TemplateTask) {
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
