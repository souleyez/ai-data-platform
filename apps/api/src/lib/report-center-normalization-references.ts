import type {
  ReportReferenceImage,
  ReportReferenceSourceType,
  ReportTemplateType,
  SharedReportTemplate,
} from './report-center.js';
import {
  getExtensionFromPathLike,
  normalizeReferenceName,
  normalizeTextField,
} from './report-center-normalization-support.js';

export function normalizeReferenceUrl(rawUrl: string) {
  const value = normalizeTextField(rawUrl);
  if (!value) throw new Error('reference url is required');

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('reference url is invalid');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('reference url must use http or https');
  }

  return parsed.toString();
}

export function inferReportReferenceSourceType(input: {
  fileName?: string;
  mimeType?: string;
  url?: string;
}): ReportReferenceSourceType {
  const normalizedMimeType = normalizeTextField(input.mimeType).toLowerCase();
  const normalizedUrl = normalizeTextField(input.url);
  const extension = getExtensionFromPathLike(input.fileName || normalizedUrl);

  if (normalizedUrl && !extension) return 'web-link';
  if (['.doc', '.docx', '.rtf', '.odt'].includes(extension)) return 'word';
  if (['.ppt', '.pptx', '.pptm', '.key'].includes(extension)) return 'ppt';
  if (['.xls', '.xlsx', '.csv', '.tsv', '.ods'].includes(extension)) return 'spreadsheet';
  if (['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg'].includes(extension)) return 'image';
  if (normalizedMimeType.includes('word') || normalizedMimeType.includes('officedocument.wordprocessingml')) return 'word';
  if (normalizedMimeType.includes('presentation') || normalizedMimeType.includes('powerpoint')) return 'ppt';
  if (normalizedMimeType.includes('spreadsheet') || normalizedMimeType.includes('excel') || normalizedMimeType.includes('csv')) return 'spreadsheet';
  if (normalizedMimeType.startsWith('image/')) return 'image';
  return normalizedUrl ? 'web-link' : 'other';
}

export function inferReportTemplateTypeFromSource(input: {
  fileName?: string;
  mimeType?: string;
  url?: string;
  sourceType?: ReportReferenceSourceType;
}): ReportTemplateType {
  const sourceType = input.sourceType || inferReportReferenceSourceType(input);
  if (sourceType === 'ppt') return 'ppt';
  if (sourceType === 'spreadsheet') return 'table';
  if (sourceType === 'word') return 'document';
  if (sourceType === 'image' || sourceType === 'web-link') return 'static-page';
  return 'document';
}

export function normalizeReportReferenceImage(reference: Partial<ReportReferenceImage> | null | undefined): ReportReferenceImage | null {
  if (!reference) return null;

  const url = normalizeTextField(reference.url);
  const kind = url ? 'link' : (reference.kind === 'link' ? 'link' : 'file');
  const normalizedUrl = kind === 'link' && url ? normalizeReferenceUrl(url) : '';
  const sourceType =
    reference.sourceType
    || inferReportReferenceSourceType({
      fileName: reference.originalName || reference.fileName,
      mimeType: reference.mimeType,
      url: normalizedUrl,
    });

  return {
    id: normalizeTextField(reference.id) || `ref-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fileName: normalizeTextField(reference.fileName),
    originalName: normalizeTextField(reference.originalName || reference.fileName || normalizedUrl || '未命名上传内容'),
    uploadedAt: normalizeTextField(reference.uploadedAt) || new Date().toISOString(),
    relativePath: normalizeTextField(reference.relativePath),
    kind,
    sourceType,
    mimeType: normalizeTextField(reference.mimeType),
    size: Number(reference.size || 0) || 0,
    url: normalizedUrl,
  };
}

export function isUserSharedReportTemplate(template: Pick<SharedReportTemplate, 'key' | 'origin'> | null | undefined) {
  const origin = normalizeTextField(template?.origin).toLowerCase();
  if (origin) return origin === 'user';
  return !normalizeTextField(template?.key).startsWith('shared-');
}

export function findDuplicateSharedTemplateReference(
  templates: SharedReportTemplate[],
  input: {
    fileName?: string;
    url?: string;
  },
) {
  const normalizedFileName = normalizeReferenceName(input.fileName || '');
  const normalizedUrl = normalizeTextField(input.url) ? normalizeReferenceUrl(String(input.url)) : '';
  if (!normalizedFileName && !normalizedUrl) return null;

  for (const template of templates || []) {
    if (!isUserSharedReportTemplate(template)) continue;
    for (const reference of template.referenceImages || []) {
      const referenceName = normalizeReferenceName(reference.originalName || reference.fileName || '');
      const referenceUrl = normalizeTextField(reference.url);
      const duplicated =
        (normalizedFileName && referenceName === normalizedFileName)
        || (normalizedUrl && referenceUrl === normalizedUrl);
      if (!duplicated) continue;
      return {
        templateKey: template.key,
        templateLabel: template.label,
        referenceId: reference.id,
        uploadName: reference.url || reference.originalName || reference.fileName || template.label,
      };
    }
  }

  return null;
}
