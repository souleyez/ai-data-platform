import { normalizeText } from './document-parser-text-normalization.js';
import type {
  EvidenceChunk,
  IntentSlots,
  StructuredClaim,
  StructuredEntity,
} from './document-parser-types.js';
import {
  buildBenefitClaims,
  collectRegexMatches,
  filterSlotValues,
  findChunkIdForText,
  mergeStringArrays,
  uniqEntities,
  uniqStrings,
  isValidStrainCandidate,
} from './document-parser-structured-data-support.js';
import { extractStructuredDataWithUIE } from './document-parser-structured-data-uie.js';

export type {
  EvidenceChunk,
  IntentSlots,
  StructuredClaim,
  StructuredEntity,
} from './document-parser-types.js';

type ContractFields = {
  contractNo?: string;
  amount?: string;
};

export async function extractStructuredData(
  text: string,
  category: string,
  evidenceChunks: EvidenceChunk[],
  topicTags: string[],
  contractFields: ContractFields | undefined,
) {
  const normalized = normalizeText(text);

  const ingredientMatches = uniqStrings(collectRegexMatches(normalized, [
    /\b(?:HMO|HMOs|DHA|ARA|FOS|GOS|MFGM|EPA|DPA)\b/gi,
    /(?:乳铁蛋白|叶黄素|胆碱|牛磺酸|低聚果糖|低聚半乳糖|核苷酸|后生元|益生元|益生菌|蛋白质|钙|铁|锌)/g,
  ]));
  const strainMatches = category === 'contract'
    ? []
    : collectRegexMatches(normalized, [
      /\b[A-Z]{1,5}-\d{1,5}\b/g,
      /\b(?:Lactobacillus|Bifidobacterium|Bacillus|Streptococcus)\s+[A-Za-z-]+\b/gi,
      /(?:鼠李糖乳杆菌|乳双歧杆菌|动物双歧杆菌|副干酪乳杆菌|嗜酸乳杆菌)/g,
    ]).filter(isValidStrainCandidate);
  const audienceMatches = uniqStrings([
    ...collectRegexMatches(normalized, [
      /(?:婴儿|婴幼儿|宝宝|儿童|青少年|成人|中老年|孕妇|老年人|幼猫|成猫|幼犬|成犬)/g,
    ]),
  ]);
  const benefitMatches = uniqStrings([
    ...topicTags,
    ...collectRegexMatches(normalized, [
      /(?:肠道健康|免疫支持|脑健康|认知支持|过敏免疫|体重管理|骨骼健康|睡眠舒缓|抗抑郁|消化吸收|皮毛健康|泌尿道健康)/g,
    ]),
  ]);
  const doseMatches = filterSlotValues(uniqStrings([
    ...collectRegexMatches(normalized, [
      /\b\d+(?:\.\d+)?\s?(?:mg|g|kg|ml|μg|ug|IU|CFU)\b/gi,
      /\b\d+(?:\.\d+)?\s?×\s?10\^?\d+\s?(?:CFU|cfu)\b/g,
      /\b\d+(?:\.\d+)?E[+-]?\d+\b/gi,
    ]),
  ]), 'dose');
  const organizationMatches = uniqStrings([
    ...collectRegexMatches(normalized, [
      /\b(?:WHO|FAO|EFSA|FDA|CDC|PMC|DOAJ|arXiv)\b/g,
      /(?:世界卫生组织|国家卫健委|欧盟食品安全局|美国食品药品监督管理局)/g,
    ]),
  ]);
  const metricMatches = uniqStrings([
    ...collectRegexMatches(normalized, [
      /\b(?:p\s?[<=>]\s?0\.\d+|OR\s?[=:]?\s?\d+(?:\.\d+)?|RR\s?[=:]?\s?\d+(?:\.\d+)?|CI\s?[=:]?\s?\d+(?:\.\d+)?)/gi,
    ]),
  ]);

  const ruleEntities: StructuredEntity[] = [
    ...ingredientMatches.map((item) => ({
      text: item,
      type: 'ingredient' as const,
      source: 'rule' as const,
      confidence: 0.72,
      evidenceChunkId: findChunkIdForText(evidenceChunks, item),
    })),
    ...strainMatches.map((item) => ({
      text: item,
      type: 'strain' as const,
      source: 'rule' as const,
      confidence: 0.8,
      evidenceChunkId: findChunkIdForText(evidenceChunks, item),
    })),
    ...audienceMatches.map((item) => ({
      text: item,
      type: 'audience' as const,
      source: 'rule' as const,
      confidence: 0.76,
      evidenceChunkId: findChunkIdForText(evidenceChunks, item),
    })),
    ...benefitMatches.map((item) => ({
      text: item,
      type: 'benefit' as const,
      source: 'rule' as const,
      confidence: 0.68,
      evidenceChunkId: findChunkIdForText(evidenceChunks, item),
    })),
    ...doseMatches.map((item) => ({
      text: item,
      type: 'dose' as const,
      source: 'rule' as const,
      confidence: 0.74,
      evidenceChunkId: findChunkIdForText(evidenceChunks, item),
    })),
    ...organizationMatches.map((item) => ({
      text: item,
      type: 'organization' as const,
      source: 'rule' as const,
      confidence: 0.7,
      evidenceChunkId: findChunkIdForText(evidenceChunks, item),
    })),
    ...metricMatches.map((item) => ({
      text: item,
      type: 'metric' as const,
      source: 'rule' as const,
      confidence: 0.64,
      evidenceChunkId: findChunkIdForText(evidenceChunks, item),
    })),
    ...(contractFields?.contractNo ? [{
      text: contractFields.contractNo,
      type: 'identifier' as const,
      source: 'rule' as const,
      confidence: 0.9,
      evidenceChunkId: findChunkIdForText(evidenceChunks, contractFields.contractNo),
    }] : []),
  ];

  const claims: StructuredClaim[] = buildBenefitClaims(
    benefitMatches,
    strainMatches,
    ingredientMatches,
    evidenceChunks,
  );

  if (contractFields?.contractNo) {
    claims.push({
      subject: contractFields.contractNo,
      predicate: 'contract_amount',
      object: contractFields.amount || '-',
      confidence: 0.84,
    });
  }

  const rawUieSlots = category === 'paper' || category === 'technical' || category === 'contract'
    ? await extractStructuredDataWithUIE(normalized, category, evidenceChunks)
    : {};
  const uieSlots: IntentSlots = {
    audiences: filterSlotValues(rawUieSlots.audiences, 'audience'),
    ingredients: filterSlotValues(rawUieSlots.ingredients, 'ingredient'),
    strains: filterSlotValues(rawUieSlots.strains, 'strain'),
    benefits: filterSlotValues(rawUieSlots.benefits, 'benefit'),
    doses: filterSlotValues(rawUieSlots.doses, 'dose'),
    organizations: filterSlotValues(rawUieSlots.organizations, 'organization'),
    metrics: filterSlotValues(rawUieSlots.metrics, 'metric'),
  };

  const uieEntities: StructuredEntity[] = [
    ...(uieSlots.audiences || []).map((item) => ({
      text: item,
      type: 'audience' as const,
      source: 'uie' as const,
      confidence: 0.86,
      evidenceChunkId: findChunkIdForText(evidenceChunks, item),
    })),
    ...(uieSlots.ingredients || []).map((item) => ({
      text: item,
      type: 'ingredient' as const,
      source: 'uie' as const,
      confidence: 0.86,
      evidenceChunkId: findChunkIdForText(evidenceChunks, item),
    })),
    ...(uieSlots.strains || []).map((item) => ({
      text: item,
      type: 'strain' as const,
      source: 'uie' as const,
      confidence: 0.88,
      evidenceChunkId: findChunkIdForText(evidenceChunks, item),
    })),
    ...(uieSlots.benefits || []).map((item) => ({
      text: item,
      type: 'benefit' as const,
      source: 'uie' as const,
      confidence: 0.84,
      evidenceChunkId: findChunkIdForText(evidenceChunks, item),
    })),
    ...(uieSlots.doses || []).map((item) => ({
      text: item,
      type: 'dose' as const,
      source: 'uie' as const,
      confidence: 0.82,
      evidenceChunkId: findChunkIdForText(evidenceChunks, item),
    })),
    ...(uieSlots.organizations || []).map((item) => ({
      text: item,
      type: 'organization' as const,
      source: 'uie' as const,
      confidence: 0.82,
      evidenceChunkId: findChunkIdForText(evidenceChunks, item),
    })),
    ...(uieSlots.metrics || []).map((item) => ({
      text: item,
      type: 'metric' as const,
      source: 'uie' as const,
      confidence: 0.8,
      evidenceChunkId: findChunkIdForText(evidenceChunks, item),
    })),
  ];

  return {
    entities: uniqEntities([...uieEntities, ...ruleEntities]).slice(0, 40),
    claims: claims.slice(0, 20),
    intentSlots: {
      audiences: mergeStringArrays(audienceMatches, uieSlots.audiences),
      ingredients: mergeStringArrays(ingredientMatches, uieSlots.ingredients),
      strains: mergeStringArrays(strainMatches, uieSlots.strains),
      benefits: mergeStringArrays(benefitMatches, uieSlots.benefits),
      doses: mergeStringArrays(doseMatches, uieSlots.doses),
      organizations: mergeStringArrays(organizationMatches, uieSlots.organizations),
      metrics: mergeStringArrays(metricMatches, uieSlots.metrics),
    } satisfies IntentSlots,
  };
}
