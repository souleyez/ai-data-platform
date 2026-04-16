import type {
  SharedReportTemplate,
} from './report-center.js';

export function sanitizeFileName(fileName: string) {
  return fileName.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim() || `reference-${Date.now()}`;
}

export function findTemplateOrThrow(templates: SharedReportTemplate[], templateKey: string) {
  const template = templates.find((item) => item.key === templateKey);
  if (!template) throw new Error('shared report template not found');
  return template;
}
