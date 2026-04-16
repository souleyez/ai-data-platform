import { createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { MultipartFile } from '@fastify/multipart';
import type { ReportTemplateActionDeps } from './report-template-actions.js';
import { findTemplateOrThrow, sanitizeFileName } from './report-template-actions-support.js';

export async function uploadSharedTemplateReferenceWithDeps(
  templateKey: string,
  file: MultipartFile,
  deps: ReportTemplateActionDeps,
) {
  const state = await deps.loadState();
  const template = findTemplateOrThrow(state.templates, templateKey);
  if (!deps.isUserSharedReportTemplate(template)) throw new Error('system template cannot accept uploaded references');

  const safeName = sanitizeFileName(file.filename || 'template-reference');
  const duplicate = deps.findDuplicateSharedTemplateReference(state.templates, { fileName: safeName });
  if (duplicate) {
    throw new Error(`template reference already exists in ${duplicate.templateLabel}`);
  }

  await deps.ensureDirs();
  const id = deps.buildId('tmplref');
  const ext = path.extname(safeName) || '.dat';
  const outputName = `${id}${ext}`;
  const fullPath = path.join(deps.reportReferenceDir, outputName);
  await pipeline(file.file, createWriteStream(fullPath));

  const stats = await fs.stat(fullPath);
  const uploaded = deps.normalizeReportReferenceImage({
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
  if (!uploaded) throw new Error('shared template reference is invalid');

  const nextTemplates = state.templates.map((item) => (
    item.key === templateKey
      ? { ...item, referenceImages: [uploaded, ...item.referenceImages].slice(0, 16) }
      : item
  ));
  await deps.saveGroupsAndOutputs(state.groups, state.outputs, nextTemplates);
  return uploaded;
}

export async function addSharedTemplateReferenceFileFromPathWithDeps(
  templateKey: string,
  input: {
    filePath: string;
    originalName?: string;
    sourceType?: import('./report-center.js').ReportReferenceSourceType;
    mimeType?: string;
  },
  deps: ReportTemplateActionDeps,
) {
  const state = await deps.loadState();
  const template = findTemplateOrThrow(state.templates, templateKey);
  if (!deps.isUserSharedReportTemplate(template)) throw new Error('system template cannot accept uploaded references');

  const sourcePath = deps.normalizePath(input.filePath);
  if (!sourcePath) throw new Error('template source file path is invalid');

  let stats: Awaited<ReturnType<typeof fs.stat>> | null = null;
  try {
    stats = await fs.stat(sourcePath);
  } catch {
    stats = null;
  }
  if (!stats?.isFile()) throw new Error('template source file not found');

  const safeName = sanitizeFileName(input.originalName || path.basename(sourcePath) || 'template-reference');
  const duplicate = deps.findDuplicateSharedTemplateReference(state.templates, { fileName: safeName });
  if (duplicate) {
    throw new Error(`template reference already exists in ${duplicate.templateLabel}`);
  }

  await deps.ensureDirs();
  const id = deps.buildId('tmplref');
  const ext = path.extname(safeName) || path.extname(sourcePath) || '.dat';
  const outputName = `${id}${ext}`;
  const fullPath = path.join(deps.reportReferenceDir, outputName);
  await fs.copyFile(sourcePath, fullPath);

  const uploaded = deps.normalizeReportReferenceImage({
    id,
    fileName: outputName,
    originalName: safeName,
    uploadedAt: new Date().toISOString(),
    relativePath: path.relative(deps.storageRoot, fullPath).replace(/\\/g, '/'),
    kind: 'file',
    sourceType: input.sourceType || deps.inferReportReferenceSourceType({ fileName: safeName, mimeType: input.mimeType }),
    mimeType: String(input.mimeType || '').trim(),
    size: stats.size,
  });
  if (!uploaded) throw new Error('shared template reference is invalid');

  const nextTemplates = state.templates.map((item) => (
    item.key === templateKey
      ? { ...item, referenceImages: [uploaded, ...item.referenceImages].slice(0, 16) }
      : item
  ));
  await deps.saveGroupsAndOutputs(state.groups, state.outputs, nextTemplates);
  return uploaded;
}

export async function addSharedTemplateReferenceLinkWithDeps(
  templateKey: string,
  input: { url: string; label?: string },
  deps: ReportTemplateActionDeps,
) {
  const state = await deps.loadState();
  const template = findTemplateOrThrow(state.templates, templateKey);
  if (!deps.isUserSharedReportTemplate(template)) throw new Error('system template cannot accept uploaded references');

  const normalizedUrl = deps.normalizeReferenceUrl(input.url);
  const duplicate = deps.findDuplicateSharedTemplateReference(state.templates, { url: normalizedUrl });
  if (duplicate) {
    throw new Error(`template reference already exists in ${duplicate.templateLabel}`);
  }
  const uploaded = deps.normalizeReportReferenceImage({
    id: deps.buildId('tmplref'),
    fileName: '',
    originalName: String(input.label || normalizedUrl).trim(),
    uploadedAt: new Date().toISOString(),
    relativePath: '',
    kind: 'link',
    sourceType: deps.inferReportReferenceSourceType({ url: normalizedUrl }),
    url: normalizedUrl,
  });
  if (!uploaded) throw new Error('shared template reference is invalid');

  const nextTemplates = state.templates.map((item) => (
    item.key === templateKey
      ? { ...item, referenceImages: [uploaded, ...item.referenceImages].slice(0, 16) }
      : item
  ));
  await deps.saveGroupsAndOutputs(state.groups, state.outputs, nextTemplates);
  return uploaded;
}

export async function deleteSharedTemplateReferenceWithDeps(
  templateKey: string,
  referenceId: string,
  deps: ReportTemplateActionDeps,
) {
  const state = await deps.loadState();
  const template = findTemplateOrThrow(state.templates, templateKey);
  if (!deps.isUserSharedReportTemplate(template)) throw new Error('system template references cannot be deleted');

  const reference = (template.referenceImages || []).find((item) => item.id === referenceId);
  if (!reference) throw new Error('template reference not found');

  await deps.deleteStoredReferenceFile(reference);

  const nextTemplates = state.templates.map((item) => (
    item.key === templateKey
      ? { ...item, referenceImages: (item.referenceImages || []).filter((entry) => entry.id !== referenceId) }
      : item
  ));

  await deps.saveGroupsAndOutputs(state.groups, state.outputs, nextTemplates);
  return reference;
}

export async function readSharedTemplateReferenceFileWithDeps(
  templateKey: string,
  referenceId: string,
  deps: ReportTemplateActionDeps,
) {
  const state = await deps.loadState();
  const template = findTemplateOrThrow(state.templates, templateKey);

  const reference = (template.referenceImages || []).find((item) => item.id === referenceId);
  if (!reference) throw new Error('template reference not found');
  if (reference.kind === 'link' || reference.url) throw new Error('template reference is not a file');

  const absolutePath = deps.resolveReferenceFilePath(reference);
  if (!absolutePath) throw new Error('template reference file path is invalid');

  try {
    await fs.access(absolutePath);
  } catch {
    throw new Error('template reference file not found');
  }

  return {
    template,
    reference,
    absolutePath,
  };
}
