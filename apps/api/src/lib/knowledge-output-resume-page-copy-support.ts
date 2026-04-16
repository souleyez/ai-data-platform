import type { ResumePageStats } from './knowledge-output-resume-types.js';

export type ResumePageCopyDeps = {
  normalizeText: (value: string) => string;
  containsAny: (text: string, keywords: string[]) => boolean;
  joinRankedLabels: (items: Array<{ label: string; value: number }>, limit?: number) => string;
};

export function buildResumeClientRecommendationLines(
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
