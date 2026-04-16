import type { ReportPlanPageSpec } from './report-planner.js';

export type LayoutVariant = ReportPlanPageSpec['layoutVariant'];

export type LayoutPolishDeps = {
  buildDefaultTitle: (kind: 'page') => string;
  containsAny: (text: string, keywords: string[]) => boolean;
  looksLikeJsonEchoText: (value: string) => boolean;
  normalizeText: (value: string) => string;
  sanitizeText: (value: unknown) => string;
};
