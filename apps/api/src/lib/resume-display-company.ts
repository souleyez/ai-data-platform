const RESUME_ENTERPRISE_SIGNAL_PATTERN =
  /(?:有限责任公司|股份有限公司|股份公司|有限公司|公司|集团|科技|信息|软件|网络|电子|智能|数码|数据|通信|电气|制造|实业|传媒|商贸|供应链|咨询|银行|医院|诊所)$/u;
const RESUME_NON_ENTERPRISE_SIGNAL_PATTERN =
  /(?:联合会|协会|学会|校友会|研究院|研究所|大学|学院|实验室|委员会|基金会|联盟|党校)$/u;
const RESUME_NON_ENTERPRISE_COMPOSITE_PATTERN =
  /(?:联合会|协会|学会|校友会|研究院|研究所|大学|学院|实验室|委员会|基金会|联盟).{0,6}(?:及|与|和|、)/u;

function sanitizeText(value: unknown, maxLength = 120) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength).trim() : text;
}

export function sanitizeResumeDisplayCompany(value: unknown, maxLength = 120) {
  const text = sanitizeText(value, maxLength);
  if (!text) return '';

  const compact = text.replace(/\s+/g, '');
  if (RESUME_ENTERPRISE_SIGNAL_PATTERN.test(compact)) return text;
  if (RESUME_NON_ENTERPRISE_COMPOSITE_PATTERN.test(compact)) return '';
  if (RESUME_NON_ENTERPRISE_SIGNAL_PATTERN.test(compact)) return '';
  return '';
}

export function selectResumeDisplayCompany(values: unknown[], maxLength = 120) {
  for (const value of values) {
    const company = sanitizeResumeDisplayCompany(value, maxLength);
    if (company) return company;
  }
  return '';
}
