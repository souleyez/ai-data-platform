import type { ReportPlanLayoutVariant } from './report-planner.js';

export type DraftPolishContext = {
  layoutVariant: ReportPlanLayoutVariant | 'insight-brief';
  audienceTone: string;
  summary: string;
  metricLabels: string[];
};
