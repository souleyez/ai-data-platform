import { promises as fs } from 'node:fs';
import path from 'node:path';
import pdfParse from 'pdf-parse';

export type ParsedDocument = {
  path: string;
  name: string;
  ext: string;
  category: string;
  parseStatus: 'parsed' | 'unsupported' | 'error';
  summary: string;
  extractedChars: number;
};

export function detectCategory(filePath: string) {
  const lower = filePath.toLowerCase();
  if (lower.includes('contract') || lower.includes('合同')) return 'contract';
  if (lower.includes('tech') || lower.includes('技术')) return 'technical';
  if (lower.includes('paper') || lower.includes('论文')) return 'paper';
  return 'general';
}

function summarize(text: string, fallback: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  return normalized.slice(0, 140) + (normalized.length > 140 ? '…' : '');
}

async function extractText(filePath: string, ext: string) {
  if (ext === '.txt' || ext === '.md') {
    const content = await fs.readFile(filePath, 'utf8');
    return { status: 'parsed' as const, text: content };
  }

  if (ext === '.pdf') {
    const buffer = await fs.readFile(filePath);
    const result = await pdfParse(buffer);
    return { status: 'parsed' as const, text: result.text || '' };
  }

  return { status: 'unsupported' as const, text: '' };
}

export async function parseDocument(filePath: string): Promise<ParsedDocument> {
  const ext = path.extname(filePath).toLowerCase() || 'unknown';
  const name = path.basename(filePath);
  const category = detectCategory(filePath);

  try {
    const { status, text } = await extractText(filePath, ext);
    if (status === 'unsupported') {
      return {
        path: filePath,
        name,
        ext,
        category,
        parseStatus: 'unsupported',
        summary: '当前版本尚未支持该文件类型的内容提取。',
        extractedChars: 0,
      };
    }

    return {
      path: filePath,
      name,
      ext,
      category,
      parseStatus: 'parsed',
      summary: summarize(text, '文档内容为空或暂未提取到文本。'),
      extractedChars: text.length,
    };
  } catch {
    return {
      path: filePath,
      name,
      ext,
      category,
      parseStatus: 'error',
      summary: '文档解析失败，后续可增加 OCR、编码识别或更稳定的解析链路。',
      extractedChars: 0,
    };
  }
}
