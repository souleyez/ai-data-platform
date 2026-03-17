import { promises as fs } from 'node:fs';
import path from 'node:path';
import pdfParse from 'pdf-parse';
import { detectBizCategoryFromConfig, type DocumentCategoryConfig } from './document-config.js';

export type ParsedDocument = {
  path: string;
  name: string;
  ext: string;
  title: string;
  category: string;
  bizCategory: 'technical' | 'contract' | 'report' | 'paper' | 'other';
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

const CATEGORY_HINTS: Record<'contract' | 'technical' | 'paper' | 'report', string[]> = {
  contract: ['contract', '合同', '协议', '条款', '付款', '甲方', '乙方', '采购'],
  technical: ['技术', '方案', '需求', '架构', '系统', '接口', '部署', '采集', '智能化', '白皮书', '知识库'],
  paper: ['paper', 'study', 'research', 'trial', 'randomized', 'placebo', 'abstract', 'introduction', 'methods', 'results', 'conclusion', 'mouse model', 'mice', 'zebrafish', '文献', '研究', '实验', '随机', '双盲'],
  report: ['report', '日报', '周报', '月报', '复盘'],
};

type KeywordRule = string | RegExp;

function stripMarkdownSyntax(text: string) {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/`{1,3}([^`]+)`{1,3}/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
}

function normalizeText(text: string) {
  return stripMarkdownSyntax(text).replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
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

function cleanTitleCandidate(line: string) {
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+[.)、]\s*/, '')
    .replace(/^[（(][^)）]{1,12}[)）]\s*/, '')
    .trim();
}

function inferTitle(text: string, fallbackName: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => cleanTitleCandidate(line.trim()))
    .filter(Boolean);

  const picked = lines.find((line) => line.length >= 4 && line.length <= 160 && !/^[\d\W_]+$/.test(line));
  if (picked) return picked;

  return path.parse(fallbackName).name;
}

function buildEvidence(filePath: string, text = '') {
  const name = path.basename(filePath);
  const normalizedText = normalizeText(text).slice(0, 8000);
  return `${filePath} ${name} ${normalizedText}`.toLowerCase();
}

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesKeyword(text: string, rule: KeywordRule) {
  if (!text) return false;
  if (rule instanceof RegExp) return rule.test(text);

  const normalizedRule = rule.toLowerCase();
  if (!/[a-z]/.test(normalizedRule)) return text.includes(normalizedRule);

  return new RegExp(`\\b${escapeRegex(normalizedRule)}\\b`, 'i').test(text);
}

function scoreHints(evidence: string, hints: string[]) {
  return hints.reduce((score, hint) => score + (matchesKeyword(evidence, hint) ? (hint.length >= 6 ? 3 : 2) : 0), 0);
}

export function detectCategory(filePath: string, text = '') {
  const evidence = buildEvidence(filePath, text);
  const scores = {
    contract: scoreHints(evidence, CATEGORY_HINTS.contract),
    technical: scoreHints(evidence, CATEGORY_HINTS.technical),
    paper: scoreHints(evidence, CATEGORY_HINTS.paper),
    report: scoreHints(evidence, CATEGORY_HINTS.report),
  };

  if (scores.contract >= 4 && scores.contract >= scores.paper) return 'contract';
  if (scores.paper >= 4 && scores.paper >= scores.technical) return 'paper';
  if (scores.report >= 4 && scores.report >= scores.technical) return 'report';
  if (scores.technical >= 3) return 'technical';

  const lower = filePath.toLowerCase();
  if (lower.includes('contract') || lower.includes('合同')) return 'contract';
  if (lower.includes('tech') || lower.includes('技术')) return 'technical';
  if (lower.includes('paper') || lower.includes('论文')) return 'paper';
  if (lower.includes('report') || lower.includes('日报') || lower.includes('周报')) return 'report';
  return 'general';
}

export function detectBizCategory(filePath: string, category: string, text = '', config?: DocumentCategoryConfig): 'technical' | 'contract' | 'report' | 'paper' | 'other' {
  if (config) {
    const matched = detectBizCategoryFromConfig(filePath, config);
    if (matched !== 'other') return matched;
  }

  const evidence = buildEvidence(filePath, text);
  if (category === 'contract' || scoreHints(evidence, CATEGORY_HINTS.contract) >= 4) return 'contract';
  if (category === 'paper' || scoreHints(evidence, CATEGORY_HINTS.paper) >= 4) return 'paper';
  if (category === 'report' || scoreHints(evidence, CATEGORY_HINTS.report) >= 4) return 'report';
  if (category === 'technical' || scoreHints(evidence, CATEGORY_HINTS.technical) >= 3) return 'technical';
  return 'other';
}

function detectRiskLevel(text: string, category: string): 'low' | 'medium' | 'high' | undefined {
  if (category !== 'contract') return undefined;
  const normalized = text.toLowerCase();
  if (normalized.includes('违约') || normalized.includes('罚则') || normalized.includes('未约定')) return 'high';
  if (normalized.includes('付款') || normalized.includes('账期') || normalized.includes('期限')) return 'medium';
  return 'low';
}

function detectTopicTags(text: string, category: string, bizCategory: ParsedDocument['bizCategory']) {
  if (category !== 'technical' && category !== 'paper' && bizCategory !== 'technical' && bizCategory !== 'paper') return [];
  const normalized = text.toLowerCase();
  const tagRules: Array<[string, KeywordRule[]]> = [
    ['设备接入', ['接入', /\bdevice\b/i, '协议']],
    ['边缘计算', ['边缘', /\bedge\b/i]],
    ['数据采集', ['采集', /\bcollector\b/i]],
    ['告警联动', ['告警', '报警']],
    ['部署规范', ['部署', /\binstall\b/i]],
    ['接口设计', ['接口', /\bapi\b/i]],
    ['肠道健康', [/\bgut\b/i, /\bintestinal\b/i, '肠道', /\bibs\b/i, /\bflora\b/i]],
    ['过敏免疫', [/\ballergic\b/i, /\brhinitis\b/i, '过敏', '鼻炎', /\bimmune\b/i]],
    ['脑健康', [/\bbrain\b/i, '脑', '认知', /\balzheimer/i, /aβ/i]],
    ['运动代谢', [/\bexercise\b/i, '减脂', '运动', /\bmetabolism\b/i, /weight loss/i]],
    ['白皮书', [/white\s*book/i, '白皮书']],
    ['随机对照', [/\brandomized\b/i, /\bplacebo\b/i, /double-blind/i, '双盲', '随机']],
  ];
  const tags = tagRules.filter(([, keywords]) => keywords.some((keyword) => matchesKeyword(normalized, keyword)));
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

export async function parseDocument(filePath: string, config?: DocumentCategoryConfig): Promise<ParsedDocument> {
  const ext = path.extname(filePath).toLowerCase() || 'unknown';
  const name = path.basename(filePath);

  try {
    const { status, text } = await extractText(filePath, ext);
    const normalizedText = normalizeText(text);
    const category = detectCategory(filePath, normalizedText);
    const bizCategory = detectBizCategory(filePath, category, normalizedText, config);

    if (status === 'unsupported') {
      return {
        path: filePath,
        name,
        ext,
        title: path.parse(name).name,
        category,
        bizCategory,
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
      title: inferTitle(text, name),
      category,
      bizCategory,
      parseStatus: 'parsed',
      summary: summarize(normalizedText, '文档内容为空或暂未提取到文本。'),
      excerpt: excerpt(normalizedText, '文档内容为空或暂未提取到文本。'),
      extractedChars: normalizedText.length,
      riskLevel: detectRiskLevel(normalizedText, category),
      topicTags: detectTopicTags(normalizedText, category, bizCategory),
      contractFields: extractContractFields(normalizedText, category),
    };
  } catch {
    const category = detectCategory(filePath);
    const bizCategory = detectBizCategory(filePath, category, '', config);
    return {
      path: filePath,
      name,
      ext,
      title: path.parse(name).name,
      category,
      bizCategory,
      parseStatus: 'error',
      summary: '文档解析失败，后续可增加 OCR、编码识别或更稳定的解析链路。',
      excerpt: '文档解析失败，后续可增加 OCR、编码识别或更稳定的解析链路。',
      extractedChars: 0,
      topicTags: [],
    };
  }
}
