import { DATASOURCE_AUTH_MODES, DATASOURCE_KINDS, DATASOURCE_SCHEDULE_KINDS } from './datasource-definitions.js';
import { LOCAL_DIRECTORY_ALLOWED_EXTENSIONS } from './datasource-local-directory.js';
import { DOCUMENT_IMAGE_EXTENSIONS, DOCUMENT_PARSE_SUPPORTED_EXTENSIONS } from './document-parser.js';
import { IMAGE_CONTENT_TYPES, PREVIEW_CONTENT_TYPES } from './document-route-files.js';
import { REPORT_OUTPUT_KINDS, REPORT_REFERENCE_SOURCE_TYPES, REPORT_TEMPLATE_TYPES } from './report-standards.js';

export type SupportStatus = 'confirmed' | 'partial' | 'planned';
export type SupportCapability = 'upload' | 'preview' | 'parse' | 'index';

export type FormatSupportItem = {
  id: string;
  category: 'document' | 'spreadsheet' | 'structured-data' | 'image' | 'web-markup';
  extensions: string[];
  label: string;
  status: SupportStatus;
  capabilities: Partial<Record<SupportCapability, boolean>>;
  notes: string[];
};

export type CapabilitySection = {
  id: string;
  label: string;
  items: Array<{
    id: string;
    label: string;
    status: SupportStatus;
    notes: string[];
  }>;
};

function uniqueSorted(values: Iterable<string>) {
  return [...new Set(Array.from(values).map((item) => String(item).toLowerCase()))].sort();
}

const confirmedUploadExtensions = uniqueSorted([
  ...DOCUMENT_PARSE_SUPPORTED_EXTENSIONS,
  ...LOCAL_DIRECTORY_ALLOWED_EXTENSIONS,
]);

const confirmedPreviewExtensions = uniqueSorted(Object.keys(PREVIEW_CONTENT_TYPES));
const confirmedImagePreviewExtensions = uniqueSorted(Object.keys(IMAGE_CONTENT_TYPES));

const baseFormatItems: FormatSupportItem[] = [
  {
    id: 'pdf',
    category: 'document',
    extensions: ['.pdf'],
    label: 'PDF document',
    status: 'confirmed',
    capabilities: { upload: true, preview: true, parse: true, index: true },
    notes: ['PDF text extraction is implemented.', 'OCR fallback depends on runtime OCR tools.'],
  },
  {
    id: 'text-markdown',
    category: 'document',
    extensions: ['.txt', '.md'],
    label: 'Plain text and Markdown',
    status: 'confirmed',
    capabilities: { upload: true, preview: true, parse: true, index: true },
    notes: ['Parsed as normalized text content.'],
  },
  {
    id: 'word-docx',
    category: 'document',
    extensions: ['.docx'],
    label: 'DOCX document',
    status: 'confirmed',
    capabilities: { upload: true, parse: true, index: true },
    notes: ['DOCX parsing is backed by mammoth raw text extraction.'],
  },
  {
    id: 'word-legacy',
    category: 'document',
    extensions: ['.doc'],
    label: 'Legacy Word document',
    status: 'partial',
    capabilities: { upload: true },
    notes: ['Recognized in template-source classification.', 'Body extraction is not as explicit as DOCX.'],
  },
  {
    id: 'spreadsheet-tabular',
    category: 'spreadsheet',
    extensions: ['.xlsx', '.xls', '.csv'],
    label: 'Spreadsheet and tabular data',
    status: 'confirmed',
    capabilities: { upload: true, preview: true, parse: true, index: true },
    notes: ['XLSX/XLS parsing is backed by xlsx.', 'CSV also has preview support.'],
  },
  {
    id: 'structured-json',
    category: 'structured-data',
    extensions: ['.json'],
    label: 'JSON structured data',
    status: 'confirmed',
    capabilities: { upload: true, preview: true, parse: true, index: true },
    notes: ['JSON is normalized before indexing.'],
  },
  {
    id: 'web-markup',
    category: 'web-markup',
    extensions: ['.html', '.htm', '.xml'],
    label: 'HTML and XML documents',
    status: 'confirmed',
    capabilities: { upload: true, parse: true, index: true },
    notes: ['Markup content is stripped into normalized text.'],
  },
  {
    id: 'images',
    category: 'image',
    extensions: [...DOCUMENT_IMAGE_EXTENSIONS],
    label: 'Image files',
    status: 'partial',
    capabilities: { upload: true, preview: true, parse: true, index: true },
    notes: ['Image OCR is implemented.', 'Reliable extraction depends on runtime OCR availability and image quality.'],
  },
  {
    id: 'template-image-svg',
    category: 'image',
    extensions: ['.svg'],
    label: 'SVG template references',
    status: 'partial',
    capabilities: {},
    notes: ['Recognized for report template source classification.', 'Do not treat as a confirmed document-ingest format yet.'],
  },
];

export function buildFormatSupportMatrix() {
  return baseFormatItems.map((item) => ({
    ...item,
    capabilities: {
      upload: item.extensions.some((ext) => confirmedUploadExtensions.includes(ext)),
      preview: item.extensions.some((ext) => confirmedPreviewExtensions.includes(ext) || confirmedImagePreviewExtensions.includes(ext)),
      parse: item.extensions.some((ext) => DOCUMENT_PARSE_SUPPORTED_EXTENSIONS.includes(ext as (typeof DOCUMENT_PARSE_SUPPORTED_EXTENSIONS)[number])),
      index: item.capabilities.index ?? item.extensions.some((ext) => confirmedUploadExtensions.includes(ext)),
      ...item.capabilities,
    },
  }));
}

export function buildCapabilitySections(): CapabilitySection[] {
  return [
    {
      id: 'datasource-types',
      label: 'Datasource types',
      items: DATASOURCE_KINDS.map((kind) => ({
        id: kind,
        label: kind,
        status: kind === 'upload_public' || kind === 'local_directory' ? 'confirmed' : 'partial',
        notes: [`Configured datasource kind: ${kind}.`],
      })),
    },
    {
      id: 'datasource-schedules',
      label: 'Datasource schedules',
      items: DATASOURCE_SCHEDULE_KINDS.map((kind) => ({
        id: kind,
        label: kind,
        status: 'confirmed',
        notes: [`Scheduler mode: ${kind}.`],
      })),
    },
    {
      id: 'datasource-auth',
      label: 'Datasource auth modes',
      items: DATASOURCE_AUTH_MODES.map((kind) => ({
        id: kind,
        label: kind,
        status: 'confirmed',
        notes: [`Credential mode: ${kind}.`],
      })),
    },
    {
      id: 'report-template-types',
      label: 'Report template types',
      items: REPORT_TEMPLATE_TYPES.map((kind) => ({
        id: kind,
        label: kind,
        status: 'confirmed',
        notes: [`Template type: ${kind}.`],
      })),
    },
    {
      id: 'report-template-sources',
      label: 'Report template source types',
      items: REPORT_REFERENCE_SOURCE_TYPES.map((kind) => ({
        id: kind,
        label: kind,
        status: 'confirmed',
        notes: [`Template source type: ${kind}.`],
      })),
    },
    {
      id: 'report-output-kinds',
      label: 'Report output kinds',
      items: REPORT_OUTPUT_KINDS.map((kind) => ({
        id: kind,
        label: kind,
        status: kind === 'table' || kind === 'page' ? 'confirmed' : 'partial',
        notes: [`Output kind: ${kind}.`, kind === 'table' ? 'Default format resolves to csv.' : kind === 'page' ? 'Default format resolves to html.' : 'Type is registered; full end-to-end stability should be validated per flow.'],
      })),
    },
  ];
}

export function loadFormatSupportPayload() {
  const formats = buildFormatSupportMatrix();
  const sections = buildCapabilitySections();

  return {
    status: 'ok' as const,
    generatedAt: new Date().toISOString(),
    summary: {
      totalFormats: formats.length,
      confirmedFormats: formats.filter((item) => item.status === 'confirmed').length,
      partialFormats: formats.filter((item) => item.status === 'partial').length,
      plannedFormats: formats.filter((item) => item.status === 'planned').length,
      datasourceKinds: DATASOURCE_KINDS.length,
      reportTemplateTypes: REPORT_TEMPLATE_TYPES.length,
      reportOutputKinds: REPORT_OUTPUT_KINDS.length,
    },
    formats,
    sections,
  };
}
