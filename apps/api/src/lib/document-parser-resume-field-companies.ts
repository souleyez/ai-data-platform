import { normalizeResumeTextValue } from './document-parser-resume-field-support.js';

export function normalizeResumeCompanyValue(value: string) {
  return normalizeResumeTextValue(value)
    .replace(/^\d{4}[./-]?\d{0,2}\s*(?:至|-|~|—)?\s*\d{4}[./-]?\d{0,2}\s*/, '')
    .replace(/^\d{4}[./-]?\d{0,2}\s*(?:至今|现在|今)?\s*/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function collectResumeCompanies(text: string, latestCompany?: string) {
  const normalizedLines = String(text || '')
    .replace(/\r/g, '')
    .split(/\n+/)
    .map((item) => normalizeResumeCompanyValue(item))
    .filter((item) => item.length >= 2);

  const companyMatches = new Set<string>();
  const pushCompany = (value?: string) => {
    const normalized = normalizeResumeCompanyValue(String(value || ''));
    if (!normalized) return;
    if (
      /(联系电话|电话|手机|邮箱|email|education|skills|项目经历|工作经历|简历|候选人)/i.test(normalized)
      || /^[\d\-./~\s]+$/.test(normalized)
    ) return;
    if (
      /(?:有限公司|有限责任公司|股份有限公司|集团|科技|信息|网络|软件|电子|通信|银行|医院|研究院|大学|学院|实验室|事务所|公司)$/i.test(normalized)
      || /\b(?:inc|ltd|llc|corp|co\.?)\b/i.test(normalized)
    ) {
      companyMatches.add(normalized);
    }
  };

  pushCompany(latestCompany);

  const companyPattern = /([A-Za-z0-9\u4e00-\u9fff（）()·&\-. ]{2,60}(?:有限公司|有限责任公司|股份有限公司|集团|科技|信息|网络|软件|电子|通信|银行|医院|研究院|大学|学院|实验室|事务所|公司))/g;
  const englishCompanyPattern = /([A-Z][A-Za-z0-9 .,&\-]{2,60}\b(?:Inc|Ltd|LLC|Corp|Co\.?))/g;

  for (const line of normalizedLines) {
    pushCompany(line);
    for (const match of line.matchAll(companyPattern)) {
      pushCompany(match[1]);
    }
    for (const match of line.matchAll(englishCompanyPattern)) {
      pushCompany(match[1]);
    }
  }

  return [...companyMatches].slice(0, 8);
}

export function extractResumeProjectHighlights(text: string) {
  const lines = String(text || '')
    .replace(/\r/g, '')
    .split(/\n+/)
    .map((item) => normalizeResumeTextValue(item))
    .filter((item) => item.length >= 8);

  const projectLike = lines.filter((line) => /(项目|系统|平台|接口|架构|上线|实施|交付|开发|搭建|设计|优化|ERP|CRM|IoT|API|中台|管理系统|数据平台|小程序|App|网站)/i.test(line));
  const actionLike = lines.filter((line) => /(负责|主导|参与|完成|推动|落地|实现|优化|设计|搭建|管理)/.test(line));
  const selected = projectLike.length ? projectLike : actionLike;
  return [...new Set(selected.slice(0, 8).map((item) => item.slice(0, 120)))];
}

export function extractResumeItProjectHighlights(text: string, skills: string[] = []) {
  const projectHighlights = extractResumeProjectHighlights(text);
  const skillHints = skills.map((item) => item.toLowerCase());
  const filtered = projectHighlights.filter((line) => (
    /(IT|信息化|系统|平台|接口|架构|开发|实施|交付|运维|数据库|微服务|云|网络|安全|ERP|CRM|MES|WMS|IoT|API|Java|Python|Go|Node|React|Vue)/i.test(line)
    || skillHints.some((skill) => line.toLowerCase().includes(skill))
  ));
  return [...new Set((filtered.length ? filtered : projectHighlights).slice(0, 6))];
}
