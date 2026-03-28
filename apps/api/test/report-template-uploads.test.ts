import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDefaultTemplateLabel,
  buildUploadedTemplateItems,
  findDuplicateTemplateUpload,
  formatTemplateUploadSourceTypeLabel,
  inferTemplateUploadSourceType,
  isUserUploadedTemplate,
} from '../../web/app/lib/report-template-uploads.mjs';

test('buildDefaultTemplateLabel should skip used labels for the same day', () => {
  const templates = [
    { label: '260328a' },
    { label: '260328b' },
  ];

  const next = buildDefaultTemplateLabel(templates, new Date('2026-03-28T08:00:00.000Z'));
  assert.equal(next, '260328c');
});

test('isUserUploadedTemplate should exclude system templates and keep user templates', () => {
  assert.equal(isUserUploadedTemplate({ key: 'shared-static-page-default', origin: 'system' }), false);
  assert.equal(isUserUploadedTemplate({ key: 'template-user-1', origin: 'user' }), true);
  assert.equal(isUserUploadedTemplate({ key: 'template-user-2' }), true);
});

test('inferTemplateUploadSourceType should detect file and link variants', () => {
  assert.equal(inferTemplateUploadSourceType({ fileName: '模板.docx' }), 'word');
  assert.equal(inferTemplateUploadSourceType({ fileName: '提纲.pptx' }), 'ppt');
  assert.equal(inferTemplateUploadSourceType({ fileName: '经营分析.xlsx' }), 'spreadsheet');
  assert.equal(inferTemplateUploadSourceType({ fileName: '参考图.png' }), 'image');
  assert.equal(inferTemplateUploadSourceType({ url: 'https://example.com/template' }), 'web-link');
  assert.equal(formatTemplateUploadSourceTypeLabel('web-link'), '网页链接');
});

test('buildUploadedTemplateItems should flatten user uploads and ignore system defaults', () => {
  const items = buildUploadedTemplateItems([
    {
      key: 'shared-static-page-default',
      origin: 'system',
      label: '默认静态页',
      referenceImages: [
        { id: 'ignored', originalName: 'system.docx', uploadedAt: '2026-03-27T10:00:00.000Z' },
      ],
    },
    {
      key: 'template-user-link',
      origin: 'user',
      label: '官网样式参考',
      description: '链接模板',
      createdAt: '2026-03-28T09:00:00.000Z',
      referenceImages: [
        {
          id: 'tmplref-link',
          url: 'https://example.com/report-template',
          originalName: '官网样式',
          uploadedAt: '2026-03-28T10:00:00.000Z',
        },
      ],
    },
    {
      key: 'template-user-file',
      origin: 'user',
      label: '周报样式',
      description: '文件模板',
      createdAt: '2026-03-28T08:00:00.000Z',
      referenceImages: [
        {
          id: 'tmplref-file',
          originalName: '周报模板.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: 1024,
          uploadedAt: '2026-03-28T08:30:00.000Z',
          relativePath: 'storage/files/report-references/tmplref-file.docx',
        },
      ],
    },
  ]);

  assert.equal(items.length, 2);
  assert.deepEqual(
    items.map((item) => item.templateKey),
    ['template-user-link', 'template-user-file'],
  );
  assert.equal(items[0].sourceType, 'web-link');
  assert.equal(items[0].uploadName, 'https://example.com/report-template');
  assert.equal(items[1].sourceType, 'word');
  assert.equal(items[1].relativePath, 'storage/files/report-references/tmplref-file.docx');
});

test('buildUploadedTemplateItems should emit a placeholder row when user template has no references yet', () => {
  const items = buildUploadedTemplateItems([
    {
      key: 'template-user-empty',
      origin: 'user',
      label: '空模板',
      description: '还没上传内容',
      createdAt: '2026-03-28T07:00:00.000Z',
      referenceImages: [],
    },
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'placeholder:template-user-empty');
  assert.equal(items[0].uploadName, '仅创建模板记录，尚未附文件或链接');
});

test('findDuplicateTemplateUpload should detect duplicate file names and links', () => {
  const templates = [
    {
      key: 'template-user-link',
      origin: 'user',
      label: '官网样式参考',
      referenceImages: [
        {
          id: 'tmplref-link',
          url: 'https://example.com/report-template',
          originalName: '官网样式',
        },
      ],
    },
    {
      key: 'template-user-file',
      origin: 'user',
      label: '周报样式',
      referenceImages: [
        {
          id: 'tmplref-file',
          originalName: '周报模板.docx',
        },
      ],
    },
  ];

  assert.equal(
    findDuplicateTemplateUpload(templates, { fileName: '周报模板.docx' })?.templateKey,
    'template-user-file',
  );
  assert.equal(
    findDuplicateTemplateUpload(templates, { url: 'https://example.com/report-template' })?.templateKey,
    'template-user-link',
  );
  assert.equal(findDuplicateTemplateUpload(templates, { fileName: '全新模板.docx' }), null);
});
