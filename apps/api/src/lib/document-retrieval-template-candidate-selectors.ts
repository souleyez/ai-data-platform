import type { ParsedDocument } from './document-parser.js';
import { containsAny, normalizePrompt } from './document-retrieval-heuristics.js';
import type { TemplateTask } from './document-retrieval-template-candidate-types.js';
import {
  isBidTemplateCandidate,
  isFootfallTemplateCandidate,
  isIotTemplateCandidate,
  isOrderTemplateCandidate,
  isPurePaperCandidate,
  isReliableResumeCandidate,
  matchesTemplateTask,
  sortTemplateCandidates,
} from './document-retrieval-template-candidate-support.js';

export function selectTemplateCandidates(items: ParsedDocument[], templateTask: TemplateTask) {
  if (templateTask === 'resume-comparison') {
    return sortTemplateCandidates(items.filter((item) => isReliableResumeCandidate(item)), templateTask);
  }
  if (templateTask === 'formula-table' || templateTask === 'formula-static-page') {
    return sortTemplateCandidates(items.filter((item) => item.schemaType === 'formula'), templateTask);
  }
  if (templateTask === 'paper-summary' || templateTask === 'paper-static-page' || templateTask === 'paper-table') {
    const purePaper = items.filter((item) => isPurePaperCandidate(item));
    if (purePaper.length) return sortTemplateCandidates(purePaper, templateTask);
    return sortTemplateCandidates(items.filter((item) => matchesTemplateTask(item, templateTask)), templateTask);
  }
  if (templateTask === 'technical-summary') {
    return sortTemplateCandidates(
      items.filter((item) => item.schemaType === 'technical' || item.category === 'technical'),
      templateTask,
    );
  }
  if (templateTask === 'order-static-page') {
    return sortTemplateCandidates(items.filter((item) => isOrderTemplateCandidate(item)), templateTask);
  }
  if (templateTask === 'footfall-static-page') {
    return sortTemplateCandidates(items.filter((item) => isFootfallTemplateCandidate(item)), templateTask);
  }
  if (templateTask === 'iot-static-page' || templateTask === 'iot-table') {
    return sortTemplateCandidates(items.filter((item) => isIotTemplateCandidate(item)), templateTask);
  }
  if (templateTask === 'bids-table' || templateTask === 'bids-static-page') {
    return sortTemplateCandidates(items.filter((item) => isBidTemplateCandidate(item)), templateTask);
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
