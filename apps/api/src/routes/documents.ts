import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';

const DEFAULT_SCAN_DIR = process.env.DOCUMENT_SCAN_DIR || path.resolve(process.cwd(), '../../storage/files');

async function listFilesRecursive(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return listFilesRecursive(fullPath);
      return [fullPath];
    }),
  );
  return nested.flat();
}

function detectCategory(filePath: string) {
  const lower = filePath.toLowerCase();
  if (lower.includes('contract') || lower.includes('合同')) return 'contract';
  if (lower.includes('tech') || lower.includes('技术')) return 'technical';
  if (lower.includes('paper') || lower.includes('论文')) return 'paper';
  return 'general';
}

export async function registerDocumentRoutes(app: FastifyInstance) {
  app.get('/documents', async () => {
    let files: string[] = [];
    let exists = true;

    try {
      files = await listFilesRecursive(DEFAULT_SCAN_DIR);
    } catch {
      exists = false;
    }

    const normalized = files.map((filePath) => ({
      path: filePath,
      name: path.basename(filePath),
      ext: path.extname(filePath).toLowerCase() || 'unknown',
      category: detectCategory(filePath),
    }));

    const byExtension = normalized.reduce<Record<string, number>>((acc, item) => {
      acc[item.ext] = (acc[item.ext] || 0) + 1;
      return acc;
    }, {});

    const byCategory = normalized.reduce<Record<string, number>>((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + 1;
      return acc;
    }, {});

    return {
      mode: 'read-only',
      scanRoot: DEFAULT_SCAN_DIR,
      exists,
      totalFiles: normalized.length,
      byExtension,
      byCategory,
      items: normalized.slice(0, 200),
      capabilities: ['scan', 'summarize', 'classify'],
      lastScanAt: new Date().toISOString(),
    };
  });

  app.post('/documents/scan', async () => {
    let files: string[] = [];
    let exists = true;

    try {
      files = await listFilesRecursive(DEFAULT_SCAN_DIR);
    } catch {
      exists = false;
    }

    return {
      status: exists ? 'completed' : 'missing-directory',
      mode: 'read-only',
      scanRoot: DEFAULT_SCAN_DIR,
      totalFiles: files.length,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      message: exists
        ? '文档扫描任务已完成（当前为文件系统扫描骨架，尚未进入解析/索引阶段）。'
        : '扫描目录不存在，请先创建目录或配置 DOCUMENT_SCAN_DIR。',
    };
  });
}
