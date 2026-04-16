import {
  isContractDocumentSignal,
  isFootfallDocumentSignal,
  isInventoryDocumentSignal,
  isIotDocumentSignal,
  isOrderDocumentSignal,
  isPaperDocumentSignal,
} from './document-domain-signals.js';
import type { ParsedDocument } from './document-parser.js';
import type { CatalogMemoryDetailLevel } from './openclaw-memory-catalog-types.js';
import { sanitizeFact, sanitizeList, sanitizeText } from './openclaw-memory-catalog-document-support.js';

function buildResumeMemoryFacts(item: ParsedDocument) {
  const fields = item.resumeFields || {};
  const facts = [
    fields.candidateName ? `Candidate: ${sanitizeFact(fields.candidateName)}` : '',
    fields.targetRole ? `Target role: ${sanitizeFact(fields.targetRole)}` : '',
    fields.currentRole ? `Current role: ${sanitizeFact(fields.currentRole)}` : '',
    fields.latestCompany ? `Latest company: ${sanitizeFact(fields.latestCompany)}` : '',
    fields.yearsOfExperience ? `Experience: ${sanitizeFact(fields.yearsOfExperience)}` : '',
    fields.education ? `Education: ${sanitizeFact(fields.education)}` : '',
    fields.skills?.length ? `Skills: ${sanitizeList(fields.skills, 40, 5).join(', ')}` : '',
    fields.projectHighlights?.length ? `Projects: ${sanitizeList(fields.projectHighlights, 60, 3).join(' | ')}` : '',
  ];
  return facts.filter(Boolean);
}

function hasMeaningfulResumeSignals(item: ParsedDocument) {
  const fields = item.resumeFields || {};
  return Boolean(
    sanitizeFact(fields.candidateName)
    || sanitizeFact(fields.targetRole)
    || sanitizeFact(fields.currentRole)
    || sanitizeFact(fields.latestCompany)
    || sanitizeFact(fields.yearsOfExperience)
    || sanitizeFact(fields.education)
    || sanitizeList(fields.skills || [], 40, 3).length
    || sanitizeList(fields.projectHighlights || [], 60, 2).length
    || sanitizeList(fields.itProjectHighlights || [], 60, 2).length
  );
}

function shouldIncludeResumeMemoryFacts(item: ParsedDocument) {
  if (item.category === 'resume') return hasMeaningfulResumeSignals(item);
  if (
    isOrderDocumentSignal(item)
    || isInventoryDocumentSignal(item)
    || isFootfallDocumentSignal(item)
    || isContractDocumentSignal(item)
    || isPaperDocumentSignal(item)
    || isIotDocumentSignal(item)
    || (item.category && item.category !== 'general')
  ) return false;
  return item.schemaType === 'resume' && hasMeaningfulResumeSignals(item);
}

function buildContractMemoryFacts(item: ParsedDocument) {
  const fields = item.contractFields || {};
  const facts = [
    fields.contractNo ? `Contract no: ${sanitizeFact(fields.contractNo)}` : '',
    fields.amount ? `Amount: ${sanitizeFact(fields.amount)}` : '',
    fields.paymentTerms ? `Payment terms: ${sanitizeFact(fields.paymentTerms)}` : '',
    fields.duration ? `Duration: ${sanitizeFact(fields.duration)}` : '',
  ];
  return facts.filter(Boolean);
}

function hasMeaningfulContractSignals(item: ParsedDocument) {
  const fields = item.contractFields || {};
  return Boolean(
    sanitizeFact(fields.contractNo)
    || sanitizeFact(fields.amount)
    || sanitizeFact(fields.paymentTerms)
    || sanitizeFact(fields.duration)
  );
}

function shouldIncludeContractMemoryFacts(item: ParsedDocument) {
  if (isContractDocumentSignal(item)) return hasMeaningfulContractSignals(item);
  return item.schemaType === 'contract' && hasMeaningfulContractSignals(item);
}

function humanizeStructuredProfileKey(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
}

function resolveStructuredProfileKeys(item: ParsedDocument) {
  if (shouldIncludeResumeMemoryFacts(item)) return ['companies', 'skills', 'highlights', 'projectHighlights', 'itProjectHighlights'];
  if (isOrderDocumentSignal(item) || isInventoryDocumentSignal(item)) {
    return ['platforms', 'platformSignals', 'categorySignals', 'metricSignals', 'replenishmentSignals', 'anomalySignals', 'highlights', 'organizations'];
  }
  if (shouldIncludeContractMemoryFacts(item)) return ['organizations', 'metrics', 'highlights'];
  if (item.schemaType === 'report') return ['platforms', 'categorySignals', 'metricSignals', 'anomalySignals', 'highlights', 'organizations'];
  return [
    'platforms',
    'platformSignals',
    'categorySignals',
    'metricSignals',
    'replenishmentSignals',
    'anomalySignals',
    'companies',
    'skills',
    'highlights',
    'projectHighlights',
    'itProjectHighlights',
    'benefits',
    'ingredients',
    'audiences',
    'organizations',
  ];
}

function buildStructuredProfileFacts(item: ParsedDocument) {
  const profile = item.structuredProfile;
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return [];
  const preferredKeys = resolveStructuredProfileKeys(item);
  const facts: string[] = [];
  const focusedAliasFields = (
    (profile as Record<string, unknown>).focusedAliasFields
    && typeof (profile as Record<string, unknown>).focusedAliasFields === 'object'
    && !Array.isArray((profile as Record<string, unknown>).focusedAliasFields)
      ? (profile as Record<string, unknown>).focusedAliasFields as Record<string, unknown>
      : null
  ) || (
    (profile as Record<string, unknown>).aliasFields
    && typeof (profile as Record<string, unknown>).aliasFields === 'object'
    && !Array.isArray((profile as Record<string, unknown>).aliasFields)
      ? (profile as Record<string, unknown>).aliasFields as Record<string, unknown>
      : null
  );

  if (focusedAliasFields) {
    for (const [alias, raw] of Object.entries(focusedAliasFields)) {
      if (facts.length >= 6) break;
      if (Array.isArray(raw)) {
        const values = sanitizeList(raw, 40, 4);
        if (values.length) facts.push(`${sanitizeFact(alias, 40)}: ${values.join(', ')}`);
        continue;
      }
      const text = sanitizeFact(raw, 120);
      if (text) facts.push(`${sanitizeFact(alias, 40)}: ${text}`);
    }
  }

  for (const key of preferredKeys) {
    const raw = (profile as Record<string, unknown>)[key];
    if (Array.isArray(raw)) {
      const values = sanitizeList(raw, 40, 5);
      if (values.length) facts.push(`${humanizeStructuredProfileKey(key)}: ${values.join(', ')}`);
      continue;
    }
    const text = sanitizeFact(raw, 120);
    if (text) facts.push(`${humanizeStructuredProfileKey(key)}: ${text}`);
  }
  return facts;
}

function buildEvidenceHighlights(item: ParsedDocument, limit = 3) {
  const chunks = Array.isArray(item.evidenceChunks) ? item.evidenceChunks : [];
  if (chunks.length) return sanitizeList(chunks.map((chunk) => chunk.text), 140, limit);
  const excerpt = sanitizeText(item.excerpt || item.summary || '', 180);
  return excerpt ? [excerpt] : [];
}

export function buildCatalogMemoryDetail(item: ParsedDocument, detailLevel: CatalogMemoryDetailLevel) {
  const topicTags = sanitizeList(item.topicTags || [], 40, detailLevel === 'deep' ? 8 : 4);
  const typedFacts = [
    ...(shouldIncludeResumeMemoryFacts(item) ? buildResumeMemoryFacts(item) : []),
    ...(shouldIncludeContractMemoryFacts(item) ? buildContractMemoryFacts(item) : []),
  ];
  const allFacts = sanitizeList([...typedFacts, ...buildStructuredProfileFacts(item)], 180, detailLevel === 'deep' ? 8 : detailLevel === 'medium' ? 4 : 0);
  const evidenceHighlights = detailLevel === 'shallow' ? [] : buildEvidenceHighlights(item, detailLevel === 'deep' ? 3 : 1);

  return {
    topicTags,
    keyFacts: allFacts,
    evidenceHighlights,
  };
}
