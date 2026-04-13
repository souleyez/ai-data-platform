import type { ReportTemplateEnvelope } from './report-center.js';

export type ResumeRequestView = 'generic' | 'company' | 'project' | 'talent' | 'skill' | 'client';

type ResumePageStats = {
  candidateCount: number;
  companyCount: number;
  projectCount: number;
  skillCount: number;
  companies: Array<{ label: string; value: number }>;
  projects: Array<{ label: string; value: number }>;
  skills: Array<{ label: string; value: number }>;
  educations: Array<{ label: string; value: number }>;
  candidateLines: string[];
  companyLines: string[];
  projectLines: string[];
  skillLines: string[];
  salaryLines: string[];
  showcaseCandidateNames: string[];
  showcaseProjectLabels: string[];
};

type ResumePageCopyDeps = {
  normalizeText: (value: string) => string;
  containsAny: (text: string, keywords: string[]) => boolean;
  joinRankedLabels: (items: Array<{ label: string; value: number }>, limit?: number) => string;
};

export function hasExpectedResumeTitle(view: ResumeRequestView, title: string, deps: Pick<ResumePageCopyDeps, 'normalizeText' | 'containsAny'>) {
  const normalized = deps.normalizeText(title);
  if (!normalized) return false;
  if (view === 'client') return deps.containsAny(normalized, ['client', 'customer', '客户', '汇报', '推荐', '匹配']);
  if (view === 'skill') return deps.containsAny(normalized, ['skill', '技能']);
  if (view === 'company') return deps.containsAny(normalized, ['company', '公司']);
  if (view === 'project') return deps.containsAny(normalized, ['project', '项目']);
  return deps.containsAny(normalized, ['talent', 'candidate', '人才', '候选人']);
}

export function buildResumePageTitle(
  view: ResumeRequestView,
  envelope: ReportTemplateEnvelope | null | undefined,
  deps: Pick<ResumePageCopyDeps, 'normalizeText' | 'containsAny'>,
) {
  if (envelope?.title && hasExpectedResumeTitle(view, envelope.title, deps)) return envelope.title;
  if (view === 'client') return '简历客户汇报静态页';
  if (view === 'company') return '简历公司维度 IT 项目静态页';
  if (view === 'project') return '简历项目维度静态页';
  if (view === 'skill') return '简历技能维度静态页';
  return '简历人才维度静态页';
}

export function buildResumePageSummary(
  view: ResumeRequestView,
  documentCount: number,
  stats: ResumePageStats,
  deps: Pick<ResumePageCopyDeps, 'joinRankedLabels'>,
) {
  const shared = `当前基于库内 ${documentCount} 份简历，整理出 ${stats.candidateCount} 位候选人、${stats.companyCount} 家关联公司和 ${stats.projectCount} 条项目线索。`;
  if (view === 'talent') {
    const shortlistText = stats.showcaseCandidateNames.length ? `优先展示 ${stats.showcaseCandidateNames.join('、')} 等 shortlist 候选人。` : '';
    return `${shared} 当前页面采用客户汇报视角，重点展示代表候选人、代表项目、核心技能和匹配建议。${shortlistText}`;
  }
  if (view === 'company') return `${shared} 当前页面按公司维度组织，适合快速查看目标公司的项目经验覆盖和人才结构。`;
  if (view === 'project') return `${shared} 当前页面按项目维度组织，适合对比代表项目、参与候选人和技术方向。`;
  if (view === 'skill') {
    return `当前基于库内 ${documentCount} 份简历，汇总出 ${stats.skillCount} 类核心技能、${stats.candidateCount} 位候选人和 ${stats.projectCount} 条关联项目线索，适合用于技能盘点和招聘筛选。`;
  }
  return `${shared} 当前页面按人才维度组织，适合快速查看候选人背景、项目经历和核心能力。`;
}

export function buildResumePageCards(
  view: ResumeRequestView,
  documentCount: number,
  stats: ResumePageStats,
  deps: Pick<ResumePageCopyDeps, 'joinRankedLabels'>,
) {
  if (view === 'client') {
    return [
      {
        label: '候选人覆盖',
        value: String(stats.candidateCount),
        note: stats.showcaseCandidateNames.length
          ? `优先 shortlist：${stats.showcaseCandidateNames.join('、')}`
          : '进入本页主展示的人才数量',
      },
      {
        label: '公司覆盖',
        value: String(stats.companyCount),
        note: deps.joinRankedLabels(stats.companies, 2) || '可用于客户汇报的企业背景数量',
      },
      {
        label: '项目匹配',
        value: String(stats.projectCount),
        note: stats.showcaseProjectLabels.length
          ? `代表项目：${stats.showcaseProjectLabels.slice(0, 2).join('、')}`
          : '可用于客户沟通的代表项目线索',
      },
      {
        label: '技能热点',
        value: deps.joinRankedLabels(stats.skills, 3) || String(stats.skillCount),
        note: `高频能力主题：${deps.joinRankedLabels(stats.skills, 2) || '待补充'}`,
      },
    ];
  }
  if (view === 'company') {
    return [
      { label: '候选人覆盖', value: String(stats.candidateCount), note: '具备公司或项目线索的候选人数量' },
      { label: '公司覆盖', value: String(stats.companyCount), note: '当前页面涉及的重点公司数量' },
      { label: '项目线索', value: String(stats.projectCount), note: '从简历中归纳出的代表项目线索' },
      { label: '技能热点', value: deps.joinRankedLabels(stats.skills, 3) || '待补充', note: '高频技能方向' },
    ];
  }
  if (view === 'project') {
    return [
      { label: '项目线索', value: String(stats.projectCount), note: '去重后的项目线索数量' },
      { label: '候选人覆盖', value: String(stats.candidateCount), note: '参与项目的候选人数量' },
      { label: '公司覆盖', value: String(stats.companyCount), note: '相关公司或组织数量' },
      { label: '技能热点', value: deps.joinRankedLabels(stats.skills, 3) || '待补充', note: '高频技术方向' },
    ];
  }
  if (view === 'skill') {
    return [
      { label: '技能覆盖', value: String(stats.skillCount), note: '去重后的核心技能数量' },
      { label: '候选人覆盖', value: String(stats.candidateCount), note: '具备技能画像的候选人数量' },
      { label: '公司覆盖', value: String(stats.companyCount), note: '技能来源关联到的公司数量' },
      { label: '关联项目', value: String(stats.projectCount), note: '技能对应的代表项目线索' },
    ];
  }
  return [
    { label: '简历数量', value: String(documentCount), note: '参与本次页面生成的简历数量' },
    { label: '候选人覆盖', value: String(stats.candidateCount), note: '已识别出的候选人数量' },
    { label: '公司覆盖', value: String(stats.companyCount), note: '关联公司或组织数量' },
    { label: '技能覆盖', value: String(stats.skillCount), note: '去重后的核心技能数量' },
  ];
}

export function buildResumeSectionBlueprints(
  view: ResumeRequestView,
  summary: string,
  stats: ResumePageStats,
  deps: Pick<ResumePageCopyDeps, 'joinRankedLabels'>,
) {
  const compensationText = stats.salaryLines.length ? `；期望薪资线索包括 ${stats.salaryLines.slice(0, 3).join('、')}` : '';
  if (view === 'client') {
    return [
        { body: summary, bullets: [`shortlist 候选人：${stats.showcaseCandidateNames.join('、')}`, `重点公司：${deps.joinRankedLabels(stats.companies, 4)}`, `代表项目：${stats.showcaseProjectLabels.join('、') || deps.joinRankedLabels(stats.projects, 3)}`].filter(Boolean) },
        { body: `本页优先展示更适合进入客户首轮沟通的候选人，主要来自 ${deps.joinRankedLabels(stats.companies, 4)} 等企业背景。`, bullets: stats.candidateLines.slice(0, 5) },
        { body: `代表项目聚焦 ${stats.showcaseProjectLabels.join('、') || deps.joinRankedLabels(stats.projects, 5)} 等方向，更适合用于客户场景映射和交付经验说明。`, bullets: stats.projectLines.slice(0, 5) },
        { body: `核心技能以 ${deps.joinRankedLabels(stats.skills, 6)} 为主，覆盖后端交付、平台建设、产品协同等关键能力。`, bullets: stats.skillLines.slice(0, 5) },
        { body: `建议围绕 shortlist 候选人、相似项目场景和高频技能组合三条线做并行筛选${compensationText}。`, bullets: buildResumeClientRecommendationLines(stats, deps) },
        { body: '当前页以知识库证据为主、AI归纳为辅，适合作为客户沟通和内部筛选的第一版展示页。', bullets: ['优先核验代表项目与最近公司是否与目标岗位高度相关', '当证据不足时，以保守描述替代自由补完'] },
      ];
  }
  if (view === 'talent') {
    return [
      { body: summary, bullets: [deps.joinRankedLabels(stats.skills, 4), deps.joinRankedLabels(stats.companies, 4), `代表项目 ${deps.joinRankedLabels(stats.projects, 3)}`].filter(Boolean) },
      { body: `代表候选人主要集中在 ${deps.joinRankedLabels(stats.companies, 4)} 等背景公司，可直接用于客户展示与初筛沟通。`, bullets: stats.candidateLines.slice(0, 5) },
      { body: `代表项目主要覆盖 ${deps.joinRankedLabels(stats.projects, 5)} 等方向，体现了平台搭建、交付实施和业务落地能力。`, bullets: stats.projectLines.slice(0, 5) },
      { body: `核心技能以 ${deps.joinRankedLabels(stats.skills, 6)} 为主，兼顾项目实施、产品规划和业务协同。`, bullets: stats.skillLines.slice(0, 5) },
      { body: `建议优先根据岗位目标从公司背景、项目场景和技能组合三条线并行筛选${compensationText}。`, bullets: ['优先选择项目经历与客户业务场景接近的候选人', '对管理岗重点关注公司背景、团队带领与交付经历', '对技术岗重点关注高频技能组合与代表项目'] },
      { body: '当前页以知识库证据为主、AI归纳为辅，适合作为客户沟通和内部筛选的第一版展示页。', bullets: ['优先核验代表项目与最近公司是否与目标岗位高度相关', '当证据不足时，以保守描述替代自由补完'] },
    ];
  }
  if (view === 'company') {
    return [
      { body: summary, bullets: stats.companyLines.slice(0, 5) },
      { body: `重点项目主要覆盖 ${deps.joinRankedLabels(stats.projects, 5)} 等方向，适合按公司维度查看候选人的项目沉淀。`, bullets: stats.projectLines.slice(0, 5) },
      { body: `当前候选人来源公司较为集中，代表背景包括 ${deps.joinRankedLabels(stats.companies, 5)}。`, bullets: stats.candidateLines.slice(0, 5) },
      { body: `技术关键词主要集中在 ${deps.joinRankedLabels(stats.skills, 6)}，说明候选人更偏平台型、交付型和解决方案型能力。`, bullets: stats.skillLines.slice(0, 5) },
      { body: '从公司维度看，页面适合快速评估候选人的行业贴近度与项目经验密度。', bullets: ['优先识别是否存在目标行业的连续经历', '当项目描述较短时，以项目主题而非业绩数字作为判断依据', '重点关注最近公司和代表项目的组合'] },
      { body: '当前输出以知识库可见的公司、项目与技能线索为依据，避免扩写无法验证的业绩数字。', bullets: ['适合作为公司维度的人才盘点初稿', '如需更细颗粒度判断，可继续下钻到项目维度页面'] },
    ];
  }
  if (view === 'project') {
    return [
      { body: summary, bullets: stats.projectLines.slice(0, 5) },
      { body: `项目所关联的公司主要包括 ${deps.joinRankedLabels(stats.companies, 5)}。`, bullets: stats.companyLines.slice(0, 5) },
      { body: `参与候选人覆盖 ${stats.candidateCount} 位，代表候选人具备 ${deps.joinRankedLabels(stats.skills, 5)} 等能力组合。`, bullets: stats.candidateLines.slice(0, 5) },
      { body: `技术关键词主要集中在 ${deps.joinRankedLabels(stats.skills, 6)}。`, bullets: stats.skillLines.slice(0, 5) },
      { body: '交付信号主要来自简历中的项目主题、岗位角色和最近公司信息，适合用于项目匹配与候选人筛选。', bullets: ['优先关注与目标项目场景一致的候选人', '优先采信明确写出项目主题和角色职责的简历'] },
      { body: '项目维度页面更适合做“项目找人”场景下的第一轮对齐，后续可再结合人才维度细看背景与稳定性。', bullets: ['同一项目主题可继续下钻到技能覆盖和公司背景'] },
    ];
  }
  if (view === 'skill') {
    return [
      { body: summary, bullets: stats.skillLines.slice(0, 5) },
      { body: `高频技能主要集中在 ${deps.joinRankedLabels(stats.skills, 6)}，可直接用于技能盘点和关键词检索。`, bullets: stats.candidateLines.slice(0, 5) },
      { body: `技能来源公司主要包括 ${deps.joinRankedLabels(stats.companies, 5)}。`, bullets: stats.companyLines.slice(0, 5) },
      { body: `技能所关联的代表项目主要包括 ${deps.joinRankedLabels(stats.projects, 5)}。`, bullets: stats.projectLines.slice(0, 5) },
      { body: '技能维度页面更适合回答“某类技能有哪些人、分布在哪些公司、对应哪些项目”。', bullets: ['优先看高频技能与最近公司的组合', '再看技能是否能落到具体项目和场景'] },
      { body: '当前页面只保留知识库可见的技能、公司和项目线索，适合作为技能筛选和岗位匹配的证据层。', bullets: ['不把技能页误写成客户汇报页或人才总览页'] },
    ];
  }
  return [
    { body: summary, bullets: stats.candidateLines.slice(0, 5) },
    { body: `学历与背景主要集中在 ${deps.joinRankedLabels(stats.educations, 4) || '待补充'}，候选人覆盖 ${deps.joinRankedLabels(stats.companies, 4)} 等公司背景${compensationText}。`, bullets: stats.educations.map((item) => `${item.label}：${item.value}`).slice(0, 4) },
    { body: `最近公司主要集中在 ${deps.joinRankedLabels(stats.companies, 5)}。`, bullets: stats.companyLines.slice(0, 5) },
    { body: `代表项目主要覆盖 ${deps.joinRankedLabels(stats.projects, 5)}。`, bullets: stats.projectLines.slice(0, 5) },
    { body: `核心能力主要集中在 ${deps.joinRankedLabels(stats.skills, 6)}。`, bullets: stats.skillLines.slice(0, 5) },
    { body: '人才维度页面适合作为候选人初筛页，优先看最近公司、项目场景与技能组合，再结合薪资和工作年限做匹配判断。', bullets: ['先看候选人背景是否贴近目标行业', '再看代表项目是否与目标岗位高度相关', '最后结合技能与薪资线索做初筛'] },
  ];
}

export function buildResumePageCharts(view: ResumeRequestView, stats: ResumePageStats) {
  if (view === 'company') return [{ title: '公司覆盖分布', items: stats.companies.slice(0, 8) }, { title: '技能热点分布', items: stats.skills.slice(0, 8) }];
  if (view === 'project') return [{ title: '项目覆盖分布', items: stats.projects.slice(0, 8) }, { title: '公司分布', items: stats.companies.slice(0, 8) }];
  if (view === 'skill') return [{ title: '技能覆盖分布', items: stats.skills.slice(0, 8) }, { title: '公司覆盖分布', items: stats.companies.slice(0, 8) }];
  if (view === 'client') return [{ title: '技能热度', items: stats.skills.slice(0, 8) }, { title: '公司背景分布', items: stats.companies.slice(0, 8) }];
  return [{ title: '技能覆盖分布', items: stats.skills.slice(0, 8) }, { title: '公司背景分布', items: stats.companies.slice(0, 8) }];
}

export function hasSuspiciousResumeHardMetrics(view: ResumeRequestView, text: string) {
  if (view !== 'company' && view !== 'project' && view !== 'client') return false;
  return /(?:\d+(?:\.\d+)?%|\d+(?:\.\d+)?(?:亿|万|k|K)|\d+\+)/.test(text);
}

function buildResumeClientRecommendationLines(
  stats: ResumePageStats,
  deps: Pick<ResumePageCopyDeps, 'joinRankedLabels'>,
) {
  const lines: string[] = [];
  const shortlist = stats.showcaseCandidateNames.slice(0, 3);
  if (shortlist.length) {
    lines.push(`首轮 shortlist 可优先沟通 ${shortlist.join('、')}，先做客户场景贴合度验证。`);
  }
  const topProjects = stats.showcaseProjectLabels.slice(0, 2);
  if (topProjects.length) {
    lines.push(`若目标场景接近 ${topProjects.join('、')}，优先核验同类项目中的实际角色、交付范围和协同深度。`);
  }
  const topSkills = deps.joinRankedLabels(stats.skills, 3);
  if (topSkills) {
    lines.push(`技术岗位可先按 ${topSkills} 这组高频技能做交叉筛选，再补充具体业务经验判断。`);
  }
  if (stats.salaryLines.length) {
    lines.push(`进入客户深聊前，建议补齐 ${stats.salaryLines.slice(0, 2).join('、')} 等薪资边界与到岗时间。`);
  } else {
    lines.push('进入客户深聊前，建议补齐到岗时间、城市偏好和薪资边界。');
  }
  return lines.slice(0, 4);
}
