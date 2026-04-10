import { refreshDerivedSchemaProfile, type ParsedDocument } from './document-parser.js';
import { canonicalizeResumeFields } from './resume-canonicalizer.js';
import { loadRetainedDocuments } from './retained-documents.js';

function normalizeLegacyBizCategory(value: ParsedDocument['bizCategory'] | undefined): ParsedDocument['bizCategory'] {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'order' || normalized === 'inventory' || normalized === 'footfall') {
    return normalized as ParsedDocument['bizCategory'];
  }
  return 'general';
}

function uniqStrings(values?: Array<string | undefined>) {
  return [...new Set((values || []).map((item) => String(item || '').trim()).filter(Boolean))];
}

function isValidStrainCandidate(value: string) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (/^IL-\d+$/i.test(text)) return false;
  if (/^(IFN|TNF|TGF)-?[A-Z0-9]+$/i.test(text)) return false;
  if (/\b(?:interleukin|cytokine|transforming growth factor|interferon)\b/i.test(text)) return false;
  if (/\b(?:and|in|on|of|for|strains?)\b/i.test(text) && !/\b(?:Lactobacillus|Bifidobacterium|Bacillus|Streptococcus)\b/i.test(text)) return false;
  if (/\b(?:Lactobacillus|Bifidobacterium|Bacillus|Streptococcus)\s+(?:and|in|on|of|for|strains?)\b/i.test(text)) return false;
  return true;
}

function isStrictDoseCandidate(value: string) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (/^\d+(?:\.\d+)?\s?(?:mg|g|kg|ml|ug|μg|IU)$/i.test(text)) return true;
  if (/^\d+(?:\.\d+)?\s?(?:x|×)\s?10\^?\d+\s?(?:CFU)?$/i.test(text)) return true;
  const scientificMatch = text.match(/^(\d+(?:\.\d+)?)e([+-]?\d{1,2})$/i);
  if (!scientificMatch) return false;
  const mantissa = Number(scientificMatch[1]);
  const exponent = Number(scientificMatch[2]);
  return mantissa > 0 && mantissa <= 20 && exponent >= 6 && exponent <= 12;
}

function normalizeStrainLabel(value: string) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (!text) return '';
  return text.replace(/\b(lactobacillus|bifidobacterium|bacillus|streptococcus)\b/gi, (match) => {
    const lower = match.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  });
}

function normalizeDoseLabel(value: string) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (!text) return '';
  const numberUnit = text.match(/^(\d+(?:\.\d+)?)(mg|g|kg|ml|ug|μg|iu|cfu)$/i);
  if (numberUnit) return `${numberUnit[1]} ${numberUnit[2].toUpperCase()}`;
  const sci = text.match(/^(\d+(?:\.\d+)?)e([+-]?\d{1,2})$/i);
  if (sci) return `${sci[1]}e${sci[2]}`;
  return text.replace(/\bcfu\b/gi, 'CFU').replace(/\biu\b/gi, 'IU');
}

export function sanitizeParsedDocument(item: ParsedDocument): ParsedDocument {
  const allowedStrains = uniqStrings(item.intentSlots?.strains)
    .filter(isValidStrainCandidate)
    .map(normalizeStrainLabel)
    .filter(Boolean);
  const allowedDoses = uniqStrings(item.intentSlots?.doses)
    .filter(isStrictDoseCandidate)
    .map(normalizeDoseLabel)
    .map((value) => value.replace(/^(\d+(?:\.\d+)?)\s*(MG|G|KG|ML|UG|ΜG|IU|CFU)$/i, '$1 $2'))
    .filter(Boolean);
  const allowedStrainSet = new Set(allowedStrains.map((value) => value.toLowerCase()));
  const entityBlocklist = new Set<string>([
    ...uniqStrings(item.intentSlots?.strains)
      .filter((value) => !isValidStrainCandidate(value))
      .map((value) => `strain:${value.toLowerCase()}`),
    ...uniqStrings(item.intentSlots?.doses)
      .filter((value) => !isStrictDoseCandidate(value))
      .map((value) => `dose:${value.toLowerCase()}`),
  ]);

  const lowerPath = String(item.path || '').toLowerCase();
  const lowerName = String(item.name || '').toLowerCase();
  const forceGenericNoise =
    lowerPath.includes('\\ai-data-platform\\docs\\')
    || lowerPath.includes('\\packages\\')
    || lowerPath.includes('\\node_modules\\')
    || lowerName === 'readme.md'
    || lowerName === 'prd.md'
    || /(?:小说|大纲|剧情|设定|人物小传)/.test(item.name || '');
  const schemaType = forceGenericNoise ? 'generic' : item.schemaType;
  const category = forceGenericNoise && (item.category === 'report' || item.category === 'technical' || item.category === 'contract')
    ? 'general'
    : item.category;
  const bizCategory = forceGenericNoise ? 'general' : normalizeLegacyBizCategory(item.bizCategory);

  return refreshDerivedSchemaProfile({
    ...item,
    schemaType,
    category,
    bizCategory,
    claims: (item.claims || [])
      .map((claim) => ({
        ...claim,
        subject: normalizeStrainLabel(claim.subject),
      }))
      .filter((claim) => !claim.subject || !/[A-Za-z]/.test(claim.subject) || allowedStrainSet.has(claim.subject.toLowerCase())),
    entities: (item.entities || [])
      .filter((entity) => !entityBlocklist.has(`${entity.type}:${entity.text.toLowerCase()}`))
      .map((entity) => ({
        ...entity,
        text: entity.type === 'strain'
          ? normalizeStrainLabel(entity.text)
          : entity.type === 'dose'
            ? normalizeDoseLabel(entity.text)
            : entity.text,
      }))
      .filter((entity) => Boolean(entity.text)),
    intentSlots: {
      ...item.intentSlots,
      audiences: uniqStrings(item.intentSlots?.audiences),
      ingredients: uniqStrings(item.intentSlots?.ingredients),
      strains: allowedStrains,
      benefits: uniqStrings(item.intentSlots?.benefits),
      doses: allowedDoses,
      organizations: uniqStrings(item.intentSlots?.organizations),
      metrics: uniqStrings(item.intentSlots?.metrics),
    },
    resumeFields: schemaType === 'resume'
      ? canonicalizeResumeFields(item.resumeFields, {
        title: item.title || item.name,
        sourceName: item.name,
        summary: item.summary,
        excerpt: item.excerpt,
        fullText: item.fullText,
      })
      : undefined,
  });
}

export async function mergeWithRetainedDocuments(items: ParsedDocument[]) {
  const retained = await loadRetainedDocuments();
  if (!retained.length) return items.map(sanitizeParsedDocument);

  const byPath = new Map<string, ParsedDocument>();
  for (const item of items.map(sanitizeParsedDocument)) byPath.set(item.path, item);
  for (const retainedItem of retained) {
    if (!byPath.has(retainedItem.path)) {
      byPath.set(retainedItem.path, sanitizeParsedDocument(retainedItem));
    }
  }

  return Array.from(byPath.values());
}
