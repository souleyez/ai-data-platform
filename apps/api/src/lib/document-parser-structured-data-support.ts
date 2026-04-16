import type {
  EvidenceChunk,
  StructuredClaim,
  StructuredEntity,
} from './document-parser-types.js';

export function isValidStrainCandidate(value: string) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (/^IL-\d+$/i.test(text)) return false;
  if (/^(IFN|TNF|TGF)-?[A-Z0-9]+$/i.test(text)) return false;
  if (/\b(?:interleukin|cytokine|transforming growth factor|interferon)\b/i.test(text)) return false;
  if (/\b(?:and|in|on|of|for)\b/i.test(text) && !/\b(?:Lactobacillus|Bifidobacterium|Bacillus|Streptococcus)\b/i.test(text)) return false;
  return true;
}

export function isStrictDoseCandidate(value: string) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (/^\d+(?:\.\d+)?\s?(?:mg|g|kg|ml|ug|μg|IU)$/i.test(text)) return true;
  if (/^\d+(?:\.\d+)?\s?(?:x|×|脳)\s?10\^?\d+\s?(?:CFU)?$/i.test(text)) return true;
  const scientificMatch = text.match(/^(\d+(?:\.\d+)?)e([+-]?\d{1,2})$/i);
  if (!scientificMatch) return false;
  const mantissa = Number(scientificMatch[1]);
  const exponent = Number(scientificMatch[2]);
  return mantissa > 0 && mantissa <= 20 && exponent >= 6 && exponent <= 12;
}

export function uniqStrings(values: Array<string | undefined>) {
  return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))];
}

export function filterSlotValues(values: string[] | undefined, type: StructuredEntity['type']) {
  const normalized = uniqStrings(values || []);
  if (type === 'strain') return normalized.filter(isValidStrainCandidate);
  if (type === 'dose') return normalized.filter(isStrictDoseCandidate);
  return normalized;
}

export function mergeStringArrays(...groups: Array<string[] | undefined>) {
  return uniqStrings(groups.flatMap((group) => group || []));
}

export function uniqEntities(items: StructuredEntity[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.type}:${item.text.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function findChunkIdForText(evidenceChunks: EvidenceChunk[] | undefined, text: string) {
  if (!text || !evidenceChunks?.length) return undefined;
  const lowered = text.toLowerCase();
  return evidenceChunks.find((chunk) => chunk.text.toLowerCase().includes(lowered))?.id;
}

export function collectRegexMatches(text: string, patterns: RegExp[]) {
  const found = new Set<string>();
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = String(match[0] || '').trim();
      if (value) found.add(value);
    }
  }
  return [...found];
}

export function buildBenefitClaims(
  benefitMatches: string[],
  strainMatches: string[],
  ingredientMatches: string[],
  evidenceChunks: EvidenceChunk[],
) {
  const claims: StructuredClaim[] = [];
  for (const benefit of benefitMatches.slice(0, 6)) {
    if (strainMatches.length) {
      for (const strain of strainMatches.slice(0, 3)) {
        claims.push({
          subject: strain,
          predicate: 'supports',
          object: benefit,
          confidence: 0.66,
          evidenceChunkId: findChunkIdForText(evidenceChunks, strain) || findChunkIdForText(evidenceChunks, benefit),
        });
      }
    } else if (ingredientMatches.length) {
      for (const ingredient of ingredientMatches.slice(0, 3)) {
        claims.push({
          subject: ingredient,
          predicate: 'related_to',
          object: benefit,
          confidence: 0.6,
          evidenceChunkId: findChunkIdForText(evidenceChunks, ingredient) || findChunkIdForText(evidenceChunks, benefit),
        });
      }
    }
  }
  return claims;
}
