import { promises as fs } from 'node:fs';
import path from 'node:path';
import { STORAGE_CONFIG_DIR } from './paths.js';

export type BizCategory = 'paper' | 'contract' | 'daily' | 'invoice' | 'order' | 'service' | 'inventory';

export type ProjectCustomCategory = {
  key: string;
  label: string;
  parent: BizCategory;
  keywords: string[];
  createdAt: string;
};

export type DocumentCategoryConfig = {
  scanRoot: string;
  categories: Record<BizCategory, { label: string; folders: string[] }>;
  customCategories: ProjectCustomCategory[];
  updatedAt: string;
};

const CONFIG_DIR = STORAGE_CONFIG_DIR;
const CONFIG_FILE = path.join(CONFIG_DIR, 'document-categories.json');

function buildDefault(scanRoot: string): DocumentCategoryConfig {
  const now = new Date().toISOString();

  return {
    scanRoot,
    updatedAt: now,
    categories: {
      paper: { label: '学术论文', folders: ['papers', 'paper', '论文', 'study', 'research'] },
      contract: { label: '合同协议', folders: ['contracts', 'contract', '合同', '协议'] },
      daily: { label: '工作日报', folders: ['daily', '日报', '周报', '简报'] },
      invoice: { label: '发票凭据', folders: ['invoice', '发票', '票据', '凭据'] },
      order: { label: '订单分析', folders: ['order', 'orders', '订单', '销售', '回款'] },
      service: { label: '客服采集', folders: ['service', 'customer-service', '客服', '工单', '投诉'] },
      inventory: { label: '库存监控', folders: ['inventory', 'stock', '库存', 'sku', '出入库'] },
    },
    customCategories: [
      {
        key: 'formula',
        label: '奶粉配方',
        parent: 'paper',
        keywords: [
          '奶粉配方',
          '配方',
          '乳粉',
          '婴配粉',
          '婴幼儿配方',
          '配方奶',
          'formula',
          'nutrition',
          'nutritional',
          'infant',
          'children',
          'pediatric',
          'probiotic',
          'prebiotic',
          'synbiotic',
          'lactobacillus',
          'bifidobacterium',
          'hmos',
        ],
        createdAt: now,
      },
      {
        key: 'brain-health',
        label: '脑健康',
        parent: 'paper',
        keywords: ['脑健康', 'brain', '认知', '阿尔茨海默'],
        createdAt: now,
      },
      {
        key: 'gut-health',
        label: '肠道健康',
        parent: 'paper',
        keywords: ['肠道健康', 'gut', '肠道', '菌群', 'intestinal', 'microbiome'],
        createdAt: now,
      },
    ],
  };
}

export async function loadDocumentCategoryConfig(scanRoot: string) {
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<DocumentCategoryConfig>;
    const defaults = buildDefault(scanRoot);
    const parsedCustomCategories = Array.isArray(parsed.customCategories) ? parsed.customCategories : [];
    const mergedCustomCategories = defaults.customCategories.map((defaultItem) => {
      const existing = parsedCustomCategories.find((item) => item.key === defaultItem.key);
      if (!existing) return defaultItem;

      return {
        ...defaultItem,
        ...existing,
        keywords: Array.from(new Set([...(defaultItem.keywords || []), ...((existing.keywords || []).map(String))])),
      };
    });

    for (const item of parsedCustomCategories) {
      if (!mergedCustomCategories.some((existing) => existing.key === item.key)) {
        mergedCustomCategories.push(item);
      }
    }

    return {
      ...defaults,
      ...parsed,
      scanRoot,
      categories: {
        ...defaults.categories,
        ...(parsed.categories || {}),
      },
      customCategories: mergedCustomCategories,
    } satisfies DocumentCategoryConfig;
  } catch {
    return buildDefault(scanRoot);
  }
}

export async function saveDocumentCategoryConfig(scanRoot: string, input: Partial<DocumentCategoryConfig>) {
  const current = await loadDocumentCategoryConfig(scanRoot);
  const next: DocumentCategoryConfig = {
    scanRoot,
    updatedAt: new Date().toISOString(),
    categories: {
      ...current.categories,
      ...(input.categories || {}),
    },
    customCategories: input.customCategories || current.customCategories || [],
  };

  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

export function detectBizCategoryFromConfig(filePath: string, config: DocumentCategoryConfig): BizCategory | null {
  const normalized = filePath.toLowerCase();

  for (const [key, value] of Object.entries(config.categories) as Array<[BizCategory, { label: string; folders: string[] }]>) {
    if (value.folders.some((folder) => folder && normalized.includes(folder.toLowerCase()))) {
      return key;
    }
  }

  return null;
}
