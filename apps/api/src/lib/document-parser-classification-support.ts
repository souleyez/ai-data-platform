import { includesAnyText } from './document-schema.js';
import { RESUME_HINTS } from './document-parser-resume-fields.js';

export type KeywordRule = string | RegExp;

export const CATEGORY_HINTS: Record<'contract' | 'technical' | 'paper' | 'report', string[]> = {
  contract: ['contract', '合同', '协议', '条款', '付款', '甲方', '乙方', '采购'],
  technical: ['技术', '方案', '需求', '架构', '系统', '接口', '部署', '采集', '智能化', '白皮书', '知识库'],
  paper: ['paper', 'study', 'research', 'trial', 'randomized', 'placebo', 'abstract', 'introduction', 'methods', 'results', 'conclusion', 'mouse model', 'mice', 'zebrafish', '文献', '研究', '实验', '随机', '双盲'],
  report: ['report', '日报', '周报', '月报', '复盘'],
};

export function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function matchesKeyword(text: string, rule: KeywordRule) {
  if (!text) return false;
  if (rule instanceof RegExp) return rule.test(text);

  const normalizedRule = rule.toLowerCase();
  if (!/[a-z]/.test(normalizedRule)) return text.includes(normalizedRule);

  return new RegExp(`\\b${escapeRegex(normalizedRule)}\\b`, 'i').test(text);
}

export function scoreHints(evidence: string, hints: string[]) {
  return hints.reduce((score, hint) => score + (matchesKeyword(evidence, hint) ? (hint.length >= 6 ? 3 : 2) : 0), 0);
}

export function buildEvidence(filePath: string, text = '') {
  const name = filePath.split(/[\\/]/).pop() || filePath;
  const normalizedText = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 8000);
  return `${filePath} ${name} ${normalizedText}`.toLowerCase();
}

export function detectCategoryByHeuristics(filePath: string, text = '') {
  const evidence = buildEvidence(filePath, text);
  if (RESUME_HINTS.some((hint) => evidence.includes(hint.toLowerCase()))) return 'resume';
  if (includesAnyText(evidence, ['ioa', '审批', '操作指引', '应用技巧', '预算调整', 'q&a', 'faq'])) {
    return 'technical';
  }
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
