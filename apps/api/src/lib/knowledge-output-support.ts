import type { ReportTemplateEnvelope } from './report-center.js';
import {
  buildDefaultTitle,
  extractEmbeddedStructuredPayload,
  isObject,
  pickNestedObject,
  pickString,
  tryParseJsonPayload,
  type JsonRecord,
} from './knowledge-output-normalization.js';

export type ReportOutputKind = 'table' | 'page' | 'pdf' | 'ppt' | 'doc' | 'md';

export type NormalizedOutputPayloadContext = {
  root: JsonRecord;
  payload: JsonRecord;
  effectivePayload: JsonRecord;
  generatedTitle: string;
  title: string;
  content: string;
};

export function buildNormalizeReportOutputContext(
  kind: ReportOutputKind,
  rawContent: string,
  envelope?: ReportTemplateEnvelope | null,
): NormalizedOutputPayloadContext {
  const parsed = tryParseJsonPayload(rawContent);
  const root = isObject(parsed) ? parsed : {};
  const payload = pickNestedObject(root, [['output'], ['report'], ['result'], ['data']]) || root;
  const embeddedPayload = extractEmbeddedStructuredPayload(
    payload.content,
    payload.summary,
    root.content,
    root.summary,
  );
  const effectivePayload = embeddedPayload || payload;
  const generatedTitle = pickString(effectivePayload.title, payload.title, root.title);
  const title = pickString(generatedTitle, envelope?.title, buildDefaultTitle(kind));
  const content = pickString(
    effectivePayload.content,
    effectivePayload.summary,
    payload.content,
    payload.summary,
    root.content,
    rawContent,
  );

  return {
    root,
    payload,
    effectivePayload,
    generatedTitle,
    title,
    content,
  };
}
