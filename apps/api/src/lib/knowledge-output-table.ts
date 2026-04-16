import type { ParsedDocument } from './document-parser.js';
import type { ReportTemplateEnvelope } from './report-center.js';
import {
  alignRowsToColumns,
  normalizeColumnNames,
  normalizeText,
  pickNestedObject,
  pickString,
  sanitizeRows,
  sanitizeStringArray,
  isObject,
} from './knowledge-output-normalization.js';
import {
  isFootfallReportDocument,
} from './knowledge-output-footfall.js';
import {
  isOrderInventoryDocument,
} from './knowledge-output-order.js';
import type { ResumeDisplayProfile } from './resume-display-profile-provider.js';
import type { ChatOutput } from './knowledge-output-types.js';
import {
  buildGenericFallbackOutput,
  buildKnowledgeFallbackOutput,
  getFootfallOutputDeps,
  getOrderOutputDeps,
} from './knowledge-output-fallback.js';
import type { NormalizedOutputPayloadContext } from './knowledge-output-support.js';

export function normalizeTabularReportOutput(input: {
  requestText: string;
  rawContent: string;
  envelope?: ReportTemplateEnvelope | null;
  documents?: ParsedDocument[];
  displayProfiles?: ResumeDisplayProfile[];
  context: NormalizedOutputPayloadContext;
}): ChatOutput {
  const {
    requestText,
    rawContent,
    envelope,
    documents = [],
    displayProfiles = [],
    context,
  } = input;
  const { root, payload, title, content } = context;

  const tableSource =
    pickNestedObject(payload, [['table']])
    || pickNestedObject(root, [['table']])
    || payload;
  const resumeDocuments = documents.filter((item) => item.schemaType === 'resume');
  const footfallOutputDeps = getFootfallOutputDeps();
  const footfallDocuments = documents.filter((item) => isFootfallReportDocument(item, footfallOutputDeps));
  const orderOutputDeps = getOrderOutputDeps();
  const orderDocuments = documents.filter((item) => isOrderInventoryDocument(item, orderOutputDeps));
  const normalizedRawContent = normalizeText(rawContent);
  if (normalizedRawContent && normalizedRawContent === normalizeText(requestText)) {
    if (footfallDocuments.length) {
      return buildKnowledgeFallbackOutput('table', requestText, footfallDocuments, envelope, displayProfiles);
    }
    if (orderDocuments.length) {
      return buildKnowledgeFallbackOutput('table', requestText, orderDocuments, envelope, displayProfiles);
    }
    if (resumeDocuments.length) {
      return buildKnowledgeFallbackOutput('table', requestText, resumeDocuments, envelope, displayProfiles);
    }
  }

  const candidateColumns = normalizeColumnNames(sanitizeStringArray(
    (isObject(tableSource) ? tableSource.columns : undefined)
    || payload.columns
    || root.columns
    || payload.headers
    || root.headers,
  ));

  const preferredColumns = envelope?.tableColumns?.length ? envelope.tableColumns : candidateColumns;
  const tableRowsInput =
    (isObject(tableSource) ? tableSource.rows : undefined)
    || (isObject(tableSource) ? tableSource.items : undefined)
    || (isObject(tableSource) ? tableSource.records : undefined)
    || payload.rows
    || payload.items
    || payload.records
    || root.rows
    || root.items
    || root.records;

  const { columns: objectColumns, rows } = sanitizeRows(tableRowsInput, preferredColumns);
  const finalColumns = normalizeColumnNames(envelope?.tableColumns?.length ? envelope.tableColumns : objectColumns);
  const finalRows = alignRowsToColumns(rows, finalColumns);
  const tableTitle = pickString(
    isObject(tableSource) ? tableSource.title : '',
    payload.tableTitle,
    root.tableTitle,
    title,
  );
  const tableSubtitle = pickString(
    isObject(tableSource) ? tableSource.subtitle : '',
    payload.subtitle,
    root.subtitle,
    '根据知识库整理',
  );

  if (!finalColumns.length || !finalRows.length) {
    return buildGenericFallbackOutput('table', requestText, rawContent, envelope);
  }

  return {
    type: 'table',
    title,
    content,
    format: 'csv',
    table: {
      title: tableTitle,
      subtitle: tableSubtitle,
      columns: finalColumns,
      rows: finalRows,
    },
  };
}
