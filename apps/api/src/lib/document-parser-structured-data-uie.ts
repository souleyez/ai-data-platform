import { extractWithUIEWorker } from './uie-process-client.js';
import { normalizeText } from './document-parser-text-normalization.js';
import type { EvidenceChunk, IntentSlots } from './document-parser-types.js';

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

export async function extractStructuredDataWithUIE(
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
