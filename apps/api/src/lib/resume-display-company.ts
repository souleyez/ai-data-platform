const ENTERPRISE_SUFFIX_PATTERN =
  /(?:\u6709\u9650\u8d23\u4efb\u516c\u53f8|\u80a1\u4efd\u6709\u9650\u516c\u53f8|\u80a1\u4efd\u516c\u53f8|\u6709\u9650\u516c\u53f8|\u516c\u53f8|\u96c6\u56e2|\u79d1\u6280|\u4fe1\u606f|\u8f6f\u4ef6|\u7f51\u7edc|\u7535\u5b50|\u667a\u80fd|\u6570\u7801|\u6570\u636e|\u901a\u4fe1|\u7535\u6c14|\u5236\u9020|\u5b9e\u4e1a|\u4f20\u5a92|\u5546\u8d38|\u4f9b\u5e94\u94fe|\u54a8\u8be2|\u94f6\u884c|\u533b\u9662|\u8bca\u6240)$/u;
const NON_ENTERPRISE_SUFFIX_PATTERN =
  /(?:\u8054\u5408\u4f1a|\u534f\u4f1a|\u5b66\u4f1a|\u6821\u53cb\u4f1a|\u7814\u7a76\u9662|\u7814\u7a76\u6240|\u5927\u5b66|\u5b66\u9662|\u5b9e\u9a8c\u5ba4|\u59d4\u5458\u4f1a|\u57fa\u91d1\u4f1a|\u8054\u76df|\u515a\u6821)$/u;
const NON_ENTERPRISE_COMPOSITE_PATTERN =
  /(?:\u8054\u5408\u4f1a|\u534f\u4f1a|\u5b66\u4f1a|\u6821\u53cb\u4f1a|\u7814\u7a76\u9662|\u7814\u7a76\u6240|\u5927\u5b66|\u5b66\u9662|\u5b9e\u9a8c\u5ba4|\u59d4\u5458\u4f1a|\u57fa\u91d1\u4f1a|\u8054\u76df).{0,6}(?:\u53ca|\u4e0e|\u548c|\u3001)/u;
const ENTERPRISE_EXTRACT_PATTERN =
  /([\u4e00-\u9fffA-Za-z0-9\u00b7()（）&\-/]{2,48}(?:\u6709\u9650\u8d23\u4efb\u516c\u53f8|\u80a1\u4efd\u6709\u9650\u516c\u53f8|\u80a1\u4efd\u516c\u53f8|\u6709\u9650\u516c\u53f8|\u516c\u53f8|\u96c6\u56e2|\u79d1\u6280|\u4fe1\u606f|\u8f6f\u4ef6|\u7f51\u7edc|\u7535\u5b50|\u667a\u80fd|\u6570\u7801|\u6570\u636e|\u901a\u4fe1|\u7535\u6c14|\u5236\u9020|\u5b9e\u4e1a|\u4f20\u5a92|\u5546\u8d38|\u4f9b\u5e94\u94fe|\u54a8\u8be2|\u94f6\u884c|\u533b\u9662|\u8bca\u6240))/gu;

function sanitizeText(value: unknown, maxLength = 120) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength).trim() : text;
}

function normalizeCompanyCandidate(value: unknown, maxLength = 120) {
  const text = sanitizeText(value, maxLength);
  if (!text) return '';
  return text
    .replace(/^(?:\u66fe\u4efb|\u5386\u4efb|\u4efb\u804c\u4e8e|\u5165\u804c|\u52a0\u5165|\u5c31\u804c\u4e8e|\u4f9b\u804c\u4e8e)\s*/u, '')
    .split(/[\u3002\uff1b\uff0c,;]|(?:\u8d1f\u8d23|\u4ece\u4e8b|\u62c5\u4efb|\u53c2\u4e0e|\u652f\u6301)/u)[0]
    .trim();
}

export function sanitizeResumeDisplayCompany(value: unknown, maxLength = 120) {
  const text = normalizeCompanyCandidate(value, maxLength);
  if (!text) return '';

  const compact = text.replace(/\s+/g, '');
  if (NON_ENTERPRISE_COMPOSITE_PATTERN.test(compact)) return '';
  if (NON_ENTERPRISE_SUFFIX_PATTERN.test(compact)) return '';
  if (ENTERPRISE_SUFFIX_PATTERN.test(compact)) return text;
  return '';
}

export function extractResumeDisplayCompaniesFromText(value: unknown, maxLength = 120) {
  const text = sanitizeText(value, 2000);
  if (!text) return [];

  const companies: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(ENTERPRISE_EXTRACT_PATTERN)) {
    const company = sanitizeResumeDisplayCompany(match[1], maxLength);
    if (!company) continue;
    if (seen.has(company)) continue;
    seen.add(company);
    companies.push(company);
  }
  return companies;
}

export function selectResumeDisplayCompany(values: unknown[], maxLength = 120) {
  for (const value of values) {
    const company = sanitizeResumeDisplayCompany(value, maxLength);
    if (company) return company;
  }

  for (const value of values) {
    const extracted = extractResumeDisplayCompaniesFromText(value, maxLength);
    if (extracted.length) return extracted[0] || '';
  }

  return '';
}
