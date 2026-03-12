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
  excerpt: string;
  extractedChars: number;
  riskLevel?: 'low' | 'medium' | 'high';
  topicTags?: string[];
  contractFields?: {
    contractNo?: string;
    amount?: string;
    paymentTerms?: string;
    duration?: string;
  };
};

export function detectCategory(filePath: string) {
  const lower = filePath.toLowerCase();
  if (lower.includes('contract') || lower.includes('合同')) return 'contract';
  if (lower.includes('tech') || lower.includes('技术')) return 'technical';
  if (lower.includes('paper') || lower.includes('论文')) return 'paper';
  return 'general';
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function summarize(text: string, fallback: string) {
  const normalized = normalizeText(text);
  if (!normalized) return fallback;
  return normalized.slice(0, 140) + (normalized.length > 140 ? '…' : '');
}

function excerpt(text: string, fallback: string) {
  const normalized = normalizeText(text);
  if (!normalized) return fallback;
  return normalized.slice(0, 360) + (normalized.length > 360 ? '…' : '');
}

function detectRiskLevel(text: string, category: string): 'low' | 'medium' | 'high' | undefined {
  if (category !== 'contract') return undefined;
  const normalized = text.toLowerCase();
  if (normalized.includes('违约') || normalized.includes('罚则') || normalized.includes('未约定')) return 'high';
  if (normalized.includes('付款') || normalized.includes('账期') || normalized.includes('期限')) return 'medium';
  return 'low';
}

function detectTopicTags(text: string, category: string) {
  if (category !== 'technical') return [];
  const normalized = text.toLowerCase();
  const tagRules: Array<[string, string[]]> = [
    ['设备接入', ['接入', 'device', '协议']],
    ['边缘计算', ['边缘', 'edge']],
    ['数据采集', ['采集', 'collector']],
    ['告警联动', ['告警', '报警']],
    ['部署规范', ['部署', 'install']],
    ['接口设计', ['接口', 'api']],
  ];
  const tags = tagRules.filter(([, keywords]) => keywords.some((keyword) => normalized.includes(keyword)));
  return tags.map(([label]) => label);
}

function extractContractFields(text: string, category: string) {
  if (category !== 'contract') return undefined;
  const normalized = text.replace(/\s+/g, ' ');
  const contractNo = normalized.match(/(合同编号|编号)[:：]?\s*([A-Za-z0-9\-]+)/)?.[2];
  const amount = normalized.match(/(金额|合同金额)[:：]?\s*([¥￥]?[0-9,.]+[万千元]*)/)?.[2];
  const paymentTerms = normalized.match(/(付款方式|付款条款)[:：]?\s*([^。；;]+)/)?.[2];
  const duration = normalized.match(/(期限|服务期|合同期)[:：]?\s*([^。；;]+)/)?.[2];
  return { contractNo, amount, paymentTerms, duration };
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
        excerpt: '当前版本尚未支持该文件类型的内容提取。',
        extractedChars: 0,
        topicTags: [],
      };
    }

    return {
      path: filePath,
      name,
      ext,
      category,
      parseStatus: 'parsed',
      summary: summarize(text, '文档内容为空或暂未提取到文本。'),
      excerpt: excerpt(text, '文档内容为空或暂未提取到文本。'),
      extractedChars: text.length,
      riskLevel: detectRiskLevel(text, category),
      topicTags: detectTopicTags(text, category),
      contractFields: extractContractFields(text, category),
    };
  } catch {
    return {
      path: filePath,
      name,
      ext,
      category,
      parseStatus: 'error',
      summary: '文档解析失败，后续可增加 OCR、编码识别或更稳定的解析链路。',
      excerpt: '文档解析失败，后续可增加 OCR、编码识别或更稳定的解析链路。',
      extractedChars: 0,
      topicTags: [],
    };
  }
}
