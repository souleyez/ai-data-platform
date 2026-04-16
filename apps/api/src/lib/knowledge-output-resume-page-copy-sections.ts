import type { ResumePageStats } from './knowledge-output-resume-types.js';
import type { ResumeRequestView } from './knowledge-output-resume-views.js';
import {
  buildResumeClientRecommendationLines,
  type ResumePageCopyDeps,
} from './knowledge-output-resume-page-copy-support.js';

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
