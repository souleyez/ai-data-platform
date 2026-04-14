import { extractWithUIEWorker } from './uie-process-client.js';
import { normalizeText } from './document-parser-text-normalization.js';

export type EvidenceChunk = {
  id: string;
  order: number;
  text: string;
  charLength: number;
  page?: number;
  sectionTitle?: string;
  regionHint?: string;
  title?: string;
};

export type StructuredEntity = {
  text: string;
  type: 'ingredient' | 'strain' | 'audience' | 'benefit' | 'dose' | 'organization' | 'metric' | 'identifier' | 'term';
  source: 'rule' | 'uie';
  confidence: number;
  evidenceChunkId?: string;
};

export type StructuredClaim = {
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  evidenceChunkId?: string;
};

export type IntentSlots = {
  audiences?: string[];
  ingredients?: string[];
  strains?: string[];
  benefits?: string[];
  doses?: string[];
  organizations?: string[];
  metrics?: string[];
};

type ContractFields = {
  contractNo?: string;
  amount?: string;
};

const ENABLE_PADDLE_UIE = process.env.ENABLE_PADDLE_UIE === '1' || process.env.ENABLE_PADDLE_UIE_SERVICE === '1';
const UIE_SCHEMA_BASE = ['人群', '成分', '菌株', '功效', '剂量', '机构', '指标'] as const;
const UIE_SCHEMA_TECHNICAL = ['功效', '机构', '指标'] as const;
const UIE_SCHEMA_CONTRACT = ['机构', '指标'] as const;

function getUIESchemaForCategory(category: string) {
  if (category === 'technical') return UIE_SCHEMA_TECHNICAL;
  if (category === 'contract') return UIE_SCHEMA_CONTRACT;
  return UIE_SCHEMA_BASE;
}

function mergeUIESlotMaps(slotMaps: Array<Record<string, string[]>>) {
  const merged = new Map<string, string[]>();

  for (const slotMap of slotMaps) {
    for (const [key, values] of Object.entries(slotMap || {})) {
      const existing = merged.get(key) || [];
      for (const value of values || []) {
        const normalized = String(value || '').trim();
        if (normalized && !existing.includes(normalized)) {
          existing.push(normalized);
        }
      }
      merged.set(key, existing);
    }
  }

  return Object.fromEntries(merged.entries());
}

function isValidStrainCandidate(value: string) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (/^IL-\d+$/i.test(text)) return false;
  if (/^(IFN|TNF|TGF)-?[A-Z0-9]+$/i.test(text)) return false;
  if (/\b(?:interleukin|cytokine|transforming growth factor|interferon)\b/i.test(text)) return false;
  if (/\b(?:and|in|on|of|for)\b/i.test(text) && !/\b(?:Lactobacillus|Bifidobacterium|Bacillus|Streptococcus)\b/i.test(text)) return false;
  return true;
}

function isValidDoseCandidate(value: string) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (/^\d+(?:\.\d+)?\s?(?:mg|g|kg|ml|ug|IU|CFU)$/i.test(text)) return true;
  if (/^\d+(?:\.\d+)?\s?(?:x|×)\s?10\^?\d+\s?(?:CFU)?$/i.test(text)) return true;
  if (/^\d+(?:\.\d+)?e[+-]?\d{1,2}$/i.test(text)) return true;
  return false;
}

function isStrictDoseCandidate(value: string) {
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

function uniqStrings(values: Array<string | undefined>) {
  return [...new Set(values.map((item) => String(item || '').trim()).filter(Boolean))];
}

function filterSlotValues(values: string[] | undefined, type: StructuredEntity['type']) {
  const normalized = uniqStrings(values || []);
  if (type === 'strain') return normalized.filter(isValidStrainCandidate);
  if (type === 'dose') return normalized.filter(isStrictDoseCandidate);
  return normalized;
}

function mergeStringArrays(...groups: Array<string[] | undefined>) {
  return uniqStrings(groups.flatMap((group) => group || []));
}

function uniqEntities(items: StructuredEntity[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.type}:${item.text.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findChunkIdForText(evidenceChunks: EvidenceChunk[] | undefined, text: string) {
  if (!text || !evidenceChunks?.length) return undefined;
  const lowered = text.toLowerCase();
  return evidenceChunks.find((chunk) => chunk.text.toLowerCase().includes(lowered))?.id;
}

function collectRegexMatches(text: string, patterns: RegExp[]) {
  const found = new Set<string>();
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = String(match[0] || '').trim();
      if (value) found.add(value);
    }
  }
  return [...found];
}

async function extractStructuredDataWithUIE(
  text: string,
  category: string,
  evidenceChunks: EvidenceChunk[],
): Promise<Partial<IntentSlots>> {
  if (!ENABLE_PADDLE_UIE) {
    return {};
  }

  try {
    const schema = getUIESchemaForCategory(category);
    const segments = [
      text.slice(0, 1200),
      ...evidenceChunks
        .slice(0, 6)
        .map((chunk) => chunk.text)
        .filter(Boolean),
    ]
      .map((item) => normalizeText(item))
      .filter((item, index, items) => item.length >= 40 && items.indexOf(item) === index);

    if (!segments.length) {
      return {};
    }

    const slotMaps = await Promise.all(
      segments.map((segment) => extractWithUIEWorker({
        text: segment.slice(0, 2000),
        model: process.env.PADDLE_UIE_MODEL || 'uie-base',
        schema,
      })),
    );

    const slots = mergeUIESlotMaps(slotMaps);

    return {
      audiences: slots['人群'] || [],
      ingredients: slots['成分'] || [],
      strains: slots['菌株'] || [],
      benefits: slots['功效'] || [],
      doses: slots['剂量'] || [],
      organizations: slots['机构'] || [],
      metrics: slots['指标'] || [],
    };
  } catch {
    return {};
  }
}

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
