import { createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { MultipartFile } from '@fastify/multipart';
import type { ReportTemplateActionDeps } from './report-template-actions.js';
import { sanitizeFileName } from './report-template-actions-support.js';

export async function updateReportGroupTemplateWithDeps(
  groupKey: string,
  templateKey: string,
  deps: ReportTemplateActionDeps,
) {
  const state = await deps.loadState();
  const group = deps.resolveReportGroup(state.groups, groupKey);
  if (!group) throw new Error('report group not found');

  const template = group.templates.find((item) => item.key === templateKey);
  if (!template) throw new Error('report template not found');

  group.defaultTemplateKey = template.key;
  await deps.saveGroupsAndOutputs(state.groups, state.outputs, state.templates);
  return { group, template };
}

export async function uploadReportReferenceImageWithDeps(
  groupKey: string,
  file: MultipartFile,
  deps: ReportTemplateActionDeps,
) {
  const state = await deps.loadState();
  const group = deps.resolveReportGroup(state.groups, groupKey);
  if (!group) throw new Error('report group not found');

  await deps.ensureDirs();
  const safeName = sanitizeFileName(file.filename || 'reference.png');
  const id = deps.buildId('ref');
  const ext = path.extname(safeName) || '.png';
  const outputName = `${id}${ext}`;
  const fullPath = path.join(deps.reportReferenceDir, outputName);
  await pipeline(file.file, createWriteStream(fullPath));

  const stats = await fs.stat(fullPath);
  const image = deps.normalizeReportReferenceImage({
    id,
    fileName: outputName,
    originalName: safeName,
    uploadedAt: new Date().toISOString(),
    relativePath: path.relative(deps.storageRoot, fullPath).replace(/\\/g, '/'),
    kind: 'file',
    sourceType: deps.inferReportReferenceSourceType({ fileName: safeName, mimeType: file.mimetype }),
    mimeType: String(file.mimetype || '').trim(),
    size: stats.size,
  });
  if (!image) throw new Error('reference image is invalid');

  group.referenceImages = [image, ...group.referenceImages].slice(0, 12);
  await deps.saveGroupsAndOutputs(state.groups, state.outputs, state.templates);
  return image;
}
