function indexToLetters(index) {
  let value = index;
  let result = '';
  do {
    result = String.fromCharCode(97 + (value % 26)) + result;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return result;
}

export function buildDefaultTemplateLabel(templates = [], now = new Date()) {
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const prefix = `${yy}${mm}${dd}`;

  const usedLabels = new Set(
    (templates || [])
      .map((template) => String(template?.label || '').trim().toLowerCase())
      .filter(Boolean),
  );

  let index = 0;
  while (usedLabels.has(`${prefix}${indexToLetters(index)}`)) {
    index += 1;
  }
  return `${prefix}${indexToLetters(index)}`;
}

export function isUserUploadedTemplate(template) {
  const origin = String(template?.origin || '').trim().toLowerCase();
  if (origin) return origin === 'user';
  return !String(template?.key || '').startsWith('shared-');
}

export function inferTemplateUploadSourceType(input = {}) {
  const sourceType = String(input?.sourceType || '').trim();
  if (sourceType) return sourceType;

  if (input?.url) return 'web-link';

  const fileName = String(input?.fileName || '').toLowerCase();
  const mimeType = String(input?.mimeType || '').toLowerCase();

  if (/\.(doc|docx|rtf|odt)$/.test(fileName) || /word/.test(mimeType)) return 'word';
  if (/\.(ppt|pptx|pptm|key)$/.test(fileName) || /powerpoint|presentation/.test(mimeType)) return 'ppt';
  if (/\.(xls|xlsx|csv|tsv|ods)$/.test(fileName) || /excel|spreadsheet|csv/.test(mimeType)) return 'spreadsheet';
  if (/\.(png|jpg|jpeg|gif|bmp|webp|svg)$/.test(fileName) || mimeType.startsWith('image/')) return 'image';
  return 'other';
}

export function formatTemplateUploadSourceTypeLabel(sourceType) {
  if (sourceType === 'word') return 'WORD';
  if (sourceType === 'ppt') return 'PPT';
  if (sourceType === 'spreadsheet') return '表格';
  if (sourceType === 'image') return '图片';
  if (sourceType === 'web-link') return '网页链接';
  return '其他';
}

export function buildUploadedTemplateItems(templates = []) {
  return templates
    .filter(isUserUploadedTemplate)
    .flatMap((template) => {
      const references = Array.isArray(template.referenceImages) ? template.referenceImages : [];
      if (!references.length) {
        return [{
          id: `placeholder:${template.key}`,
          templateKey: template.key,
          templateLabel: template.label,
          description: template.description || '',
          createdAt: template.createdAt || '',
          uploadedAt: template.createdAt || '',
          sourceType: 'other',
          sourceLabel: '待补充',
          uploadName: '仅创建模板记录，尚未附文件或链接',
          relativePath: '',
          url: '',
          mimeType: '',
          size: 0,
        }];
      }

      return references.map((reference, index) => {
        const normalizedSourceType = inferTemplateUploadSourceType({
          sourceType: reference?.sourceType,
          fileName: reference?.originalName || reference?.fileName,
          mimeType: reference?.mimeType,
          url: reference?.url,
        });

        return {
          id: reference?.id || `${template.key}:${index}`,
          templateKey: template.key,
          templateLabel: template.label,
          description: template.description || '',
          createdAt: template.createdAt || '',
          uploadedAt: reference?.uploadedAt || template.createdAt || '',
          sourceType: normalizedSourceType,
          sourceLabel: formatTemplateUploadSourceTypeLabel(normalizedSourceType),
          uploadName: reference?.url || reference?.originalName || reference?.fileName || template.label,
          relativePath: reference?.relativePath || '',
          url: reference?.url || '',
          mimeType: reference?.mimeType || '',
          size: Number(reference?.size || 0),
        };
      });
    })
    .sort((a, b) => {
      const left = new Date(b.uploadedAt || b.createdAt || 0).getTime();
      const right = new Date(a.uploadedAt || a.createdAt || 0).getTime();
      return left - right;
    });
}
