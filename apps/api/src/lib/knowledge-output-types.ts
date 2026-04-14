import type { ReportPlanDatavizSlot, ReportPlanPageSpec } from './report-planner.js';

export type ChatOutput =
  | { type: 'answer'; content: string }
  | {
      type: 'table' | 'page' | 'pdf' | 'ppt' | 'doc' | 'md';
      title: string;
      content: string;
      format?: string;
      table?: {
        title?: string;
        subtitle?: string;
        columns?: string[];
        rows?: Array<Array<string | number | null>>;
      } | null;
      page?: {
        summary?: string;
        cards?: Array<{ label?: string; value?: string; note?: string }>;
        sections?: Array<{ title?: string; body?: string; bullets?: string[]; displayMode?: string }>;
        datavizSlots?: ReportPlanDatavizSlot[];
        pageSpec?: ReportPlanPageSpec;
        charts?: Array<{
          title?: string;
          items?: Array<{ label?: string; value?: number }>;
          render?: {
            renderer?: string;
            chartType?: string;
            svg?: string;
            alt?: string;
            generatedAt?: string;
          } | null;
        }>;
      } | null;
    };

export type NormalizeReportOutputOptions = {
  allowResumeFallback?: boolean;
  datavizSlots?: ReportPlanDatavizSlot[];
  pageSpec?: ReportPlanPageSpec;
};

export type KnowledgePageOutput = {
  type: 'page';
  title: string;
  content: string;
  format: 'html';
  page: NonNullable<Exclude<ChatOutput, { type: 'answer' }>['page']>;
};
