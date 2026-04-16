import { isLikelyResumePersonName } from './document-schema.js';

export function normalizeResumeTextValue(value: string) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function inferResumeNameFromTitle(title: string) {
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

export function cutOffNextResumeLabel(value: string) {
  const normalized = normalizeResumeTextValue(value);
  return normalized.replace(/\s+(?:姓名|Name|候选人|应聘岗位|目标岗位|求职方向|当前职位|职位|岗位|工作经验|学历|专业|期望城市|意向城市|工作城市|地点|期望薪资|薪资要求|期望工资|最近工作经历|最近公司|现任公司|就职公司|核心技能|项目经历)[:：][\s\S]*$/i, '').trim();
}

export function extractResumeLabelMap(text: string) {
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

export function extractResumeValue(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1] || match?.[2];
    if (value) return cutOffNextResumeLabel(value);
  }
  return '';
}

export function collectResumeSkills(text: string) {
  const keywords = [
    'Java', 'Python', 'Go', 'C++', 'SQL', 'MySQL', 'PostgreSQL', 'Redis', 'Kafka',
    'React', 'Vue', 'Node.js', 'TypeScript', 'JavaScript', 'Spring Boot',
    '产品设计', '需求分析', '用户研究', 'Axure', 'Xmind', '数据分析', '项目管理',
    '微服务', '分布式', '机器学习', '品牌营销', '销售管理', '招聘',
  ];
  return [...new Set(keywords.filter((keyword) => new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text)))].slice(0, 8);
}

export function extractResumeHighlights(text: string) {
  const normalized = String(text || '').replace(/\r/g, '');
  const lines = normalized
    .split(/\n+/)
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter((item) => item.length >= 12);

  const priority = lines.filter((line) => /(负责|主导|参与|完成|推动|落地|优化|提升|增长|实现|设计|搭建|管理|项目)/.test(line));
  return [...new Set((priority.length ? priority : lines).slice(0, 4).map((item) => item.slice(0, 80)))];
}
