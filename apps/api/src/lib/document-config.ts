import { promises as fs } from 'node:fs';
import path from 'node:path';

export type BizCategory = 'technical' | 'contract' | 'report' | 'paper' | 'general' | 'other';

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

const CONFIG_DIR = path.resolve(process.cwd(), '../../storage/config');
const CONFIG_FILE = path.join(CONFIG_DIR, 'document-categories.json');

function buildDefault(scanRoot: string): DocumentCategoryConfig {
  return {
    scanRoot,
    updatedAt: new Date().toISOString(),
    categories: {
      technical: { label: '技术类', folders: ['tech-docs', 'technical', '技术'] },
      contract: { label: '合同类', folders: ['contracts', 'contract', '合同'] },
      report: { label: '报告类', folders: ['reports', 'report', '日报', '周报', '简报'] },
      paper: { label: '论文类', folders: ['papers', 'paper', '论文'] },
      general: { label: '通用资料', folders: ['general', '资料', '文档'] },
      other: { label: '其他类', folders: [] },
    },
    customCategories: [
      { key: 'daily', label: '工作日报', parent: 'report', keywords: ['日报', '周报', '工作日报'], createdAt: new Date().toISOString() },
      { key: 'invoice', label: '发票凭据', parent: 'general', keywords: ['发票', '票据', '凭据'], createdAt: new Date().toISOString() },
      { key: 'order', label: '订单分析', parent: 'general', keywords: ['订单', '回款', '销售'], createdAt: new Date().toISOString() },
      { key: 'service', label: '客服采集', parent: 'general', keywords: ['客服', '工单', '投诉'], createdAt: new Date().toISOString() },
      { key: 'inventory', label: '库存监控', parent: 'general', keywords: ['库存', 'SKU', '出入库'], createdAt: new Date().toISOString() },
    ],
  };
}

export async function loadDocumentCategoryConfig(scanRoot: string) {
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<DocumentCategoryConfig>;
    return {
      ...buildDefault(scanRoot),
      ...parsed,
      scanRoot,
      categories: {
        ...buildDefault(scanRoot).categories,
        ...(parsed.categories || {}),
      },
      customCategories: Array.isArray(parsed.customCategories) ? parsed.customCategories : [],
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

export function detectBizCategoryFromConfig(filePath: string, config: DocumentCategoryConfig): BizCategory {
  const normalized = filePath.toLowerCase();

  for (const [key, value] of Object.entries(config.categories) as Array<[BizCategory, { label: string; folders: string[] }]>) {
    if (key === 'other') continue;
    if (value.folders.some((folder) => folder && normalized.includes(folder.toLowerCase()))) {
      return key;
    }
  }

  return 'other';
}
