import type { DocumentExtractionProfile } from './document-extraction-governance.js';
import { isLikelyResumePersonName } from './document-schema.js';
import { canonicalizeResumeFields } from './resume-canonicalizer.js';

export const RESUME_HINTS = [
  '简历',
  '履历',
  '候选人',
  '应聘',
  '求职',
  '教育经历',
  '工作经历',
  '项目经历',
  '期望薪资',
  '目标岗位',
  'resume',
  'curriculum vitae',
  'cv',
];

export type StructuredEntity = {
  text: string;
  type: 'ingredient' | 'strain' | 'audience' | 'benefit' | 'dose' | 'organization' | 'metric' | 'identifier' | 'term';
  source: 'rule' | 'uie';
  confidence: number;
  evidenceChunkId?: string;
};

export type StructuredClaim = {
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  evidenceChunkId?: string;
};

export type ResumeFields = {
  candidateName?: string;
  targetRole?: string;
  currentRole?: string;
  yearsOfExperience?: string;
  education?: string;
  major?: string;
  expectedCity?: string;
  expectedSalary?: string;
  latestCompany?: string;
  companies?: string[];
  skills?: string[];
  highlights?: string[];
  projectHighlights?: string[];
  itProjectHighlights?: string[];
};

function normalizeResumeTextValue(value: string) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function inferResumeNameFromTitle(title: string) {
  const normalized = String(title || '')
    .replace(/^\d{10,}-/, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  const fromResumePattern = normalized.match(/简历[-\s(（]*([\u4e00-\u9fff·]{2,12})|([\u4e00-\u9fff·]{2,12})[-\s]*简历/);
  const candidate = fromResumePattern?.[1] || fromResumePattern?.[2] || '';
  if (isLikelyResumePersonName(candidate)) return candidate;
  const chineseName = normalized.match(/[\u4e00-\u9fff·]{2,12}/g)?.find(isLikelyResumePersonName);
  return chineseName || normalized;
}

function cutOffNextResumeLabel(value: string) {
  const normalized = normalizeResumeTextValue(value);
  return normalized.replace(/\s+(?:姓名|Name|候选人|应聘岗位|目标岗位|求职方向|当前职位|职位|岗位|工作经验|学历|专业|期望城市|意向城市|工作城市|地点|期望薪资|薪资要求|期望工资|最近工作经历|最近公司|现任公司|就职公司|核心技能|项目经历)[:：][\s\S]*$/i, '').trim();
}

function extractResumeLabelMap(text: string) {
  const map = new Map<string, string>();
  const lines = String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^([^:：]{1,20})[:：]\s*(.+)$/);
    if (!match) continue;
    map.set(normalizeResumeTextValue(match[1]), cutOffNextResumeLabel(match[2]));
  }

  return map;
}

function extractResumeValue(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1] || match?.[2];
    if (value) return cutOffNextResumeLabel(value);
  }
  return '';
}

function collectResumeSkills(text: string) {
  const keywords = [
    'Java', 'Python', 'Go', 'C++', 'SQL', 'MySQL', 'PostgreSQL', 'Redis', 'Kafka',
    'React', 'Vue', 'Node.js', 'TypeScript', 'JavaScript', 'Spring Boot',
    '产品设计', '需求分析', '用户研究', 'Axure', 'Xmind', '数据分析', '项目管理',
    '微服务', '分布式', '机器学习', '品牌营销', '销售管理', '招聘',
  ];
  return [...new Set(keywords.filter((keyword) => new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text)))].slice(0, 8);
}

function extractResumeHighlights(text: string) {
  const normalized = String(text || '').replace(/\r/g, '');
  const lines = normalized
    .split(/\n+/)
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter((item) => item.length >= 12);

  const priority = lines.filter((line) => /(负责|主导|参与|完成|推动|落地|优化|提升|增长|实现|设计|搭建|管理|项目)/.test(line));
  return [...new Set((priority.length ? priority : lines).slice(0, 4).map((item) => item.slice(0, 80)))];
}

function normalizeResumeCompanyValue(value: string) {
  return normalizeResumeTextValue(value)
    .replace(/^\d{4}[./-]?\d{0,2}\s*(?:至|-|~|—)?\s*\d{4}[./-]?\d{0,2}\s*/, '')
    .replace(/^\d{4}[./-]?\d{0,2}\s*(?:至今|现在|今)?\s*/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function collectResumeCompanies(text: string, latestCompany?: string) {
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

function extractResumeProjectHighlights(text: string) {
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

function extractResumeItProjectHighlights(text: string, skills: string[] = []) {
  const projectHighlights = extractResumeProjectHighlights(text);
  const skillHints = skills.map((item) => item.toLowerCase());
  const filtered = projectHighlights.filter((line) => (
    /(IT|信息化|系统|平台|接口|架构|开发|实施|交付|运维|数据库|微服务|云|网络|安全|ERP|CRM|MES|WMS|IoT|API|Java|Python|Go|Node|React|Vue)/i.test(line)
    || skillHints.some((skill) => line.toLowerCase().includes(skill))
  ));
  return [...new Set((filtered.length ? filtered : projectHighlights).slice(0, 6))];
}

export function extractResumeFields(
  text: string,
  title: string,
  entities: StructuredEntity[] = [],
  claims: StructuredClaim[] = [],
  options?: { force?: boolean },
): ResumeFields | undefined {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  const titleText = String(title || '').trim();
  const evidence = `${titleText} ${normalized}`.toLowerCase();
  const looksLikeResume = RESUME_HINTS.some((hint) => evidence.includes(hint.toLowerCase()));
  if (!looksLikeResume && options?.force !== true) return undefined;
  const labelMap = extractResumeLabelMap(text);
  const byLabel = (...labels: string[]) => {
    for (const label of labels) {
      const value = labelMap.get(label);
      if (value) return value;
    }
    return '';
  };

  const skillsFromEntities = entities
    .filter((item) => item.type === 'ingredient' || item.type === 'term')
    .map((item) => normalizeResumeTextValue(item.text))
    .filter(Boolean);
  const highlightsFromClaims = claims
    .map((claim) => `${claim.subject} ${claim.predicate} ${claim.object}`.trim())
    .filter(Boolean);

  const skills = [...new Set([...collectResumeSkills(normalized), ...skillsFromEntities])].slice(0, 8);
  const latestCompany = byLabel('最近工作经历', '最近公司', '现任公司', '就职公司') || extractResumeValue(normalized, [
    /(?:最近工作经历|最近公司|现任公司|就职公司)[:：]?\s*([^，。；;\n]{2,60})/i,
  ]);
  const projectHighlights = extractResumeProjectHighlights(text);
  const itProjectHighlights = extractResumeItProjectHighlights(text, skills);

  const fields: ResumeFields = {
    candidateName: byLabel('姓名', 'Name', '候选人') || extractResumeValue(normalized, [
      /(?:姓名|name)[:：]?\s*([A-Za-z\u4e00-\u9fff·]{2,20})/i,
      /(?:候选人)[:：]?\s*([A-Za-z\u4e00-\u9fff·]{2,20})/i,
    ]) || inferResumeNameFromTitle(titleText),
    targetRole: byLabel('应聘岗位', '目标岗位', '求职方向') || extractResumeValue(normalized, [
      /(?:应聘岗位|目标岗位|求职方向)[:：]?\s*([^，。；;\n]{2,40})/i,
    ]),
    currentRole: byLabel('当前职位', '现任职位'),
    yearsOfExperience: byLabel('工作经验') || extractResumeValue(normalized, [
      /(\d{1,2}\+?\s*年(?:工作经验)?)/i,
      /(工作经验[^，。；;\n]{0,12}\d{1,2}\+?\s*年)/i,
    ]),
    education: byLabel('学历') || extractResumeValue(normalized, [
      /(博士|硕士|本科|大专|中专|MBA|EMBA|研究生)/i,
    ]),
    major: byLabel('专业') || extractResumeValue(normalized, [
      /(?:专业)[:：]?\s*([^，。；;\n]{2,40})/i,
    ]),
    expectedCity: byLabel('期望城市', '意向城市', '工作城市', '地点') || extractResumeValue(normalized, [
      /(?:期望城市|意向城市|工作城市|地点)[:：]?\s*([^，。；;\n]{2,30})/i,
    ]),
    expectedSalary: byLabel('期望薪资', '薪资要求', '期望工资') || extractResumeValue(normalized, [
      /(?:期望薪资|薪资要求|期望工资)[:：]?\s*([^，。；;\n]{2,30})/i,
    ]),
    latestCompany,
    companies: collectResumeCompanies(text, latestCompany),
    skills,
    highlights: [...new Set([...highlightsFromClaims, ...extractResumeHighlights(text)])].slice(0, 4),
    projectHighlights,
    itProjectHighlights,
  };

  const hasAnyValue = Object.values(fields).some((value) => Array.isArray(value) ? value.length : Boolean(value));
  if (fields.candidateName && !isLikelyResumePersonName(fields.candidateName)) {
    fields.candidateName = inferResumeNameFromTitle(titleText);
  }
  return hasAnyValue
    ? canonicalizeResumeFields(fields, {
      title,
      sourceName: title,
      fullText: text,
    })
    : undefined;
}
