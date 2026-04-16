import type { SharedReportTemplate } from './report-center.js';
import type { ReportPlanLayoutVariant } from './report-planner.js';

function looksLikeResumeTemplate(template: Pick<SharedReportTemplate, 'label' | 'description'>) {
  const text = `${template.label} ${template.description || ''}`.toLowerCase();
  return text.includes('简历') || text.includes('resume') || text.includes('cv') || text.includes('候选人');
}

function looksLikeBidTemplate(template: Pick<SharedReportTemplate, 'label' | 'description'>) {
  const text = `${template.label} ${template.description || ''}`.toLowerCase();
  return text.includes('标书') || text.includes('招标') || text.includes('投标') || text.includes('bid') || text.includes('tender');
}

function looksLikeOrderTemplate(template: Pick<SharedReportTemplate, 'label' | 'description'>) {
  const text = `${template.label} ${template.description || ''}`.toLowerCase();
  return text.includes('订单') || text.includes('销售') || text.includes('库存') || text.includes('电商') || text.includes('order');
}

function looksLikeFormulaTemplate(template: Pick<SharedReportTemplate, 'label' | 'description'>) {
  const text = `${template.label} ${template.description || ''}`.toLowerCase();
  return text.includes('配方') || text.includes('奶粉') || text.includes('formula');
}

function looksLikePaperTemplate(template: Pick<SharedReportTemplate, 'label' | 'description'>) {
  const text = `${template.label} ${template.description || ''}`.toLowerCase();
  return text.includes('paper') || text.includes('论文') || text.includes('学术') || text.includes('研究');
}

function looksLikeIotTemplate(template: Pick<SharedReportTemplate, 'label' | 'description'>) {
  const text = `${template.label} ${template.description || ''}`.toLowerCase();
  return text.includes('iot') || text.includes('物联网') || text.includes('设备') || text.includes('网关') || text.includes('解决方案');
}

export {
  looksLikeBidTemplate,
  looksLikeFormulaTemplate,
  looksLikeIotTemplate,
  looksLikeOrderTemplate,
  looksLikePaperTemplate,
  looksLikeResumeTemplate,
};

export function inferTemplatePreferredLayoutVariant(template: Pick<SharedReportTemplate, 'type' | 'label' | 'description'>): ReportPlanLayoutVariant | undefined {
  if (template.type !== 'static-page') return undefined;
  if (looksLikeResumeTemplate(template)) return 'talent-showcase';
  if (looksLikeBidTemplate(template)) return 'risk-brief';
  if (looksLikeOrderTemplate(template)) return 'operations-cockpit';
  if (looksLikePaperTemplate(template)) return 'research-brief';
  if (looksLikeIotTemplate(template)) return 'solution-overview';
  return 'insight-brief';
}
