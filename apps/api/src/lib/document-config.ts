import { promises as fs } from 'node:fs';
import path from 'node:path';

export type BizCategory = 'technical' | 'contract' | 'report' | 'paper' | 'other';

export type DocumentCategoryConfig = {
  scanRoot: string;
  categories: Record<BizCategory, { label: string; folders: string[] }>;
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
      report: { label: '日报类', folders: ['reports', 'report', '日报', '周报'] },
      paper: { label: '论文类', folders: ['papers', 'paper', '论文'] },
      other: { label: '其他类', folders: [] },
    },
  };
}

export async function loadDocumentCategoryConfig(scanRoot: string) {
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw) as DocumentCategoryConfig;
    return {
      ...parsed,
      scanRoot,
      categories: {
        ...buildDefault(scanRoot).categories,
        ...parsed.categories,
      },
    };
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
