export type ResumeRequestView = 'generic' | 'company' | 'project' | 'talent' | 'skill' | 'client';

type ResumePageEntry = {
  candidateName: string;
  education: string;
  latestCompany: string;
  yearsOfExperience: string;
  skills: string[];
  projectHighlights: string[];
  itProjectHighlights: string[];
  highlights: string[];
  expectedCity: string;
  expectedSalary: string;
  sourceName: string;
  sourceTitle: string;
  summary: string;
};

type ResumeViewDeps = {
  normalizeText: (value: string) => string;
  containsAny: (text: string, keywords: string[]) => boolean;
  sanitizeText: (value: unknown) => string;
  getResumeDisplayName: (entry: ResumePageEntry) => string;
  unknownCompany: string;
};

function hasCompanySignal(text: string, deps: Pick<ResumeViewDeps, 'containsAny'>) {
  return deps.containsAny(text, ['company', 'employer', 'organization', '公司', '雇主']);
}

function hasProjectSignal(text: string, deps: Pick<ResumeViewDeps, 'containsAny'>) {
  return deps.containsAny(text, [
    'project',
    'projects',
    'system',
    'systems',
    'platform',
    'platforms',
    'api',
    'implementation',
    'delivery',
    'architecture',
    '项目',
    '系统',
    '平台',
    '接口',
    '实施',
    '交付',
    '架构',
    'it',
  ]);
}

function hasSkillSignal(text: string, deps: Pick<ResumeViewDeps, 'containsAny'>) {
  return deps.containsAny(text, [
    'skill',
    'skills',
    'ability',
    'abilities',
    'tech stack',
    'technology',
    '技术栈',
    '技能',
    '能力',
    '核心能力',
    '关键技能',
  ]);
}

function hasTalentSignal(text: string, deps: Pick<ResumeViewDeps, 'containsAny'>) {
  return deps.containsAny(text, [
    'talent',
    'candidate',
    'candidates',
    'people',
    'person',
    '人才',
    '候选人',
    '人员',
    '画像',
    '学历',
    '工作经历',
  ]);
}

function hasClientSignal(text: string, deps: Pick<ResumeViewDeps, 'containsAny'>) {
  return deps.containsAny(text, [
    'client',
    'customer',
    'presentation',
    'pitch',
    'report',
    '\u5ba2\u6237',
    '\u6c47\u62a5',
    '\u5c55\u793a',
    '\u63a8\u8350',
    '\u5339\u914d\u5efa\u8bae',
  ]);
}

function detectResumeRequestView(requestText: string, deps: Pick<ResumeViewDeps, 'normalizeText' | 'containsAny'>): ResumeRequestView {
  const text = deps.normalizeText(requestText);

  if (deps.containsAny(text, ['人才维度', '候选人维度', '人才画像', '候选人画像', '按人才', '按候选人'])) {
    return 'talent';
  }
  if (hasSkillSignal(text, deps)) return 'skill';
  if (hasCompanySignal(text, deps) && hasProjectSignal(text, deps)) return 'company';
  if (hasProjectSignal(text, deps)) return 'project';
  if (hasTalentSignal(text, deps)) return 'talent';
  return 'generic';
}

export function resolveResumeRequestView(
  requestText: string,
  deps: Pick<ResumeViewDeps, 'normalizeText' | 'containsAny'>,
): ResumeRequestView {
  const text = deps.normalizeText(requestText);
  if (hasClientSignal(text, deps)) return 'client';
  return detectResumeRequestView(requestText, deps);
}

function extractProjectRole(text: string, deps: Pick<ResumeViewDeps, 'sanitizeText'>) {
  const source = deps.sanitizeText(text);
  const match = source.match(/(负责[^，。；]{2,24}|担任[^，。；]{2,24}|主导[^，。；]{2,24}|参与[^，。；]{2,24}|牵头[^，。；]{2,24})/);
  return match?.[1] || '';
}

function extractProjectTimeline(text: string, deps: Pick<ResumeViewDeps, 'sanitizeText'>) {
  const source = deps.sanitizeText(text);
  const match = source.match(/((?:20\d{2}|19\d{2})[./-]?\d{0,2}(?:\s*[~-]\s*(?:(?:20\d{2})[./-]?\d{0,2}|至今|现在))?)/);
  return match?.[1] || '';
}

function extractTechKeywords(text: string, deps: Pick<ResumeViewDeps, 'sanitizeText'>) {
  const source = deps.sanitizeText(text).toLowerCase();
  const keywords = [
    'sap', 'erp', 'crm', 'mes', 'wms', 'bi', 'api', 'java', 'python', 'go', 'c#', 'sql',
    'mysql', 'oracle', 'postgresql', 'redis', 'kafka', 'docker', 'kubernetes', 'aws', 'azure',
    '阿里云', '腾讯云', '系统', '平台', '接口', '数据中台', '供应链', '实施', '开发', '架构', 'iot',
  ];
  const matches = keywords.filter((keyword) => source.includes(keyword.toLowerCase()));
  return [...new Set(matches)].slice(0, 6).join(' / ');
}

export function buildResumeCompanyProjectRows(entries: ResumePageEntry[], deps: ResumeViewDeps) {
  const rows: Array<Array<string>> = [];

  for (const entry of entries) {
    const candidate = deps.getResumeDisplayName(entry);
    const effectiveCompanies = entry.latestCompany ? [entry.latestCompany] : [deps.unknownCompany];
    const effectiveProjects = entry.itProjectHighlights.length
      ? entry.itProjectHighlights.slice(0, 6)
      : entry.projectHighlights.slice(0, 4);

    if (!effectiveProjects.length) {
      rows.push([
        effectiveCompanies[0],
        candidate,
        '未提取到明确 IT 项目',
        '',
        entry.skills.slice(0, 6).join(' / '),
        '',
        entry.sourceName,
      ]);
      continue;
    }

    for (const company of effectiveCompanies) {
      for (const project of effectiveProjects) {
        rows.push([
          company,
          candidate,
          project,
          extractProjectRole(project, deps),
          extractTechKeywords(project, deps) || entry.skills.slice(0, 6).join(' / '),
          extractProjectTimeline(project, deps),
          entry.sourceName,
        ]);
      }
    }
  }

  const seen = new Set<string>();
  return rows
    .filter((row) => {
      const key = row.join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 36);
}

export function buildResumeProjectRows(entries: ResumePageEntry[], deps: ResumeViewDeps) {
  const rows: Array<Array<string>> = [];
  for (const entry of entries) {
    const candidate = deps.getResumeDisplayName(entry);
    const company = entry.latestCompany || deps.unknownCompany;
    const projects = entry.itProjectHighlights.length ? entry.itProjectHighlights : entry.projectHighlights;
    for (const project of projects.slice(0, 6)) {
      rows.push([
        project,
        company,
        candidate,
        extractProjectRole(project, deps),
        extractTechKeywords(project, deps) || entry.skills.slice(0, 6).join(' / '),
        extractProjectTimeline(project, deps),
        entry.sourceName,
      ]);
    }
  }
  return rows.slice(0, 36);
}

export function buildResumeTalentRows(entries: ResumePageEntry[]) {
  return entries
    .map((entry) => [
      entry.candidateName,
      entry.education,
      entry.latestCompany,
      entry.skills.slice(0, 6).join(' / '),
      '',
      entry.yearsOfExperience,
      (entry.itProjectHighlights.length ? entry.itProjectHighlights : entry.projectHighlights).slice(0, 2).join('；'),
      entry.sourceName,
    ])
    .filter((row) => row.some(Boolean))
    .slice(0, 36);
}

export function buildResumeSkillRows(entries: ResumePageEntry[], deps: ResumeViewDeps) {
  const rows: Array<Array<string>> = [];
  for (const entry of entries) {
    const candidate = deps.getResumeDisplayName(entry);
    const latestCompany = entry.latestCompany || deps.unknownCompany;
    const projects = entry.itProjectHighlights.length ? entry.itProjectHighlights : entry.projectHighlights;
    for (const skill of entry.skills.slice(0, 8)) {
      rows.push([
        skill,
        candidate,
        skill,
        latestCompany,
        projects.slice(0, 2).join('；'),
        entry.sourceName,
      ]);
    }
  }
  return rows.slice(0, 40);
}
