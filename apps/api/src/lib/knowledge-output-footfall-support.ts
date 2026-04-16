import type { ParsedDocument } from './document-parser.js';

export type FootfallDeps = {
  normalizeText: (value: string) => string;
  sanitizeText: (value: unknown) => string;
  containsAny: (text: string, keywords: string[]) => boolean;
  looksLikeJsonEchoText: (value: string) => boolean;
};

export type FootfallPageStats = {
  documentCount: number;
  totalFootfall: number;
  mallZoneBreakdown: Array<{ label: string; value: number; floorZoneCount: number; roomUnitCount: number }>;
  supportingLines: string[];
  lowZoneHighlights: string[];
};

export type FootfallPage = {
  summary?: string;
  cards?: Array<{ label?: string; value?: string; note?: string }>;
  sections?: Array<{ title?: string; body?: string; bullets?: string[] }>;
  charts?: Array<{ title?: string; items?: Array<{ label?: string; value?: number }> }>;
};

export type KnowledgePageOutput = {
  type: 'page';
  title: string;
  content: string;
  format: 'html';
  page: NonNullable<FootfallPage>;
};

export type FootfallTableOutput = {
  type: 'table';
  title: string;
  content: string;
  format: 'csv';
  table: {
    title: string;
    subtitle: string;
    columns: string[];
    rows: string[][];
  };
};

export function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function formatFootfallValue(value: number) {
  if (!Number.isFinite(value)) return '0';
  return `${Math.round(value).toLocaleString('zh-CN')} 人次`;
}

export function parseFootfallNumericValue(value: unknown, deps: FootfallDeps) {
  const text = deps.sanitizeText(value).replace(/,/g, '');
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getStructuredProfileRecord(item: ParsedDocument) {
  return isObject(item.structuredProfile) ? item.structuredProfile as Record<string, unknown> : {};
}

export function getFootfallRecordInsights(item: ParsedDocument) {
  const profile = getStructuredProfileRecord(item);
  const tableSummary = isObject(profile.tableSummary) ? profile.tableSummary as Record<string, unknown> : null;
  return tableSummary && isObject(tableSummary.recordInsights)
    ? tableSummary.recordInsights as Record<string, unknown>
    : null;
}
