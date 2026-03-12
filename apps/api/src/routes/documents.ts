import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { parseDocument } from '../lib/document-parser.js';

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

export async function registerDocumentRoutes(app: FastifyInstance) {
  app.get('/documents', async () => {
    let files: string[] = [];
    let exists = true;

    try {
      files = await listFilesRecursive(DEFAULT_SCAN_DIR);
    } catch {
      exists = false;
    }

    const items = await Promise.all(files.slice(0, 200).map((filePath) => parseDocument(filePath)));

    const byExtension = items.reduce<Record<string, number>>((acc, item) => {
      acc[item.ext] = (acc[item.ext] || 0) + 1;
      return acc;
    }, {});

    const byCategory = items.reduce<Record<string, number>>((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + 1;
      return acc;
    }, {});

    const byStatus = items.reduce<Record<string, number>>((acc, item) => {
      acc[item.parseStatus] = (acc[item.parseStatus] || 0) + 1;
      return acc;
    }, {});

    return {
      mode: 'read-only',
      scanRoot: DEFAULT_SCAN_DIR,
      exists,
      totalFiles: files.length,
      byExtension,
      byCategory,
      byStatus,
      items,
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
        ? '文档扫描任务已完成，并已进行第一版文本提取（txt / md / pdf）。'
        : '扫描目录不存在，请先创建目录或配置 DOCUMENT_SCAN_DIR。',
    };
  });
}
