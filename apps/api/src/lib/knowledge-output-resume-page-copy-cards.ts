import type { ResumePageStats } from './knowledge-output-resume-types.js';
import type { ResumeRequestView } from './knowledge-output-resume-views.js';
import type { ResumePageCopyDeps } from './knowledge-output-resume-page-copy-support.js';

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

export function buildResumePageCharts(view: ResumeRequestView, stats: ResumePageStats) {
  if (view === 'company') return [{ title: '公司覆盖分布', items: stats.companies.slice(0, 8) }, { title: '技能热点分布', items: stats.skills.slice(0, 8) }];
  if (view === 'project') return [{ title: '项目覆盖分布', items: stats.projects.slice(0, 8) }, { title: '公司分布', items: stats.companies.slice(0, 8) }];
  if (view === 'skill') return [{ title: '技能覆盖分布', items: stats.skills.slice(0, 8) }, { title: '公司覆盖分布', items: stats.companies.slice(0, 8) }];
  if (view === 'client') return [{ title: '技能热度', items: stats.skills.slice(0, 8) }, { title: '公司背景分布', items: stats.companies.slice(0, 8) }];
  return [{ title: '技能覆盖分布', items: stats.skills.slice(0, 8) }, { title: '公司背景分布', items: stats.companies.slice(0, 8) }];
}
