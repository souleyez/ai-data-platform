import { createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { MultipartFile } from '@fastify/multipart';
import type {
  ReportGroup,
  ReportOutputRecord,
  ReportReferenceImage,
  ReportReferenceSourceType,
  ReportTemplateType,
  SharedReportTemplate,
} from './report-center.js';

type ReportCenterStateLike = {
  groups: ReportGroup[];
  outputs: ReportOutputRecord[];
  templates: SharedReportTemplate[];
};

export type ReportTemplateActionDeps = {
  loadState: () => Promise<ReportCenterStateLike>;
  saveGroupsAndOutputs: (
    groups: ReportGroup[],
    outputs: ReportOutputRecord[],
    templates?: SharedReportTemplate[],
  ) => Promise<void>;
  resolveReportGroup: (groups: ReportGroup[], groupKeyOrLabel: string) => ReportGroup | null;
  ensureDirs: () => Promise<void>;
  buildId: (prefix: string) => string;
  normalizeReportReferenceImage: (
    reference: Partial<ReportReferenceImage> | null | undefined,
  ) => ReportReferenceImage | null;
  inferReportReferenceSourceType: (input: {
    fileName?: string;
    mimeType?: string;
    url?: string;
  }) => ReportReferenceSourceType;
  inferReportTemplateTypeFromSource: (input: {
    sourceType?: ReportReferenceSourceType;
    fileName?: string;
    mimeType?: string;
    url?: string;
  }) => ReportTemplateType;
  findDuplicateSharedTemplateReference: (
    templates: SharedReportTemplate[],
    input: { fileName?: string; url?: string },
  ) => { templateKey: string; templateLabel: string; referenceId: string; uploadName: string } | null;
  isUserSharedReportTemplate: (
    template: Pick<SharedReportTemplate, 'key' | 'origin'> | null | undefined,
  ) => boolean;
  inferTemplatePreferredLayoutVariant: (
    template: Pick<SharedReportTemplate, 'type' | 'label' | 'description'>,
  ) => SharedReportTemplate['preferredLayoutVariant'];
  normalizePath: (filePath: string) => string;
  normalizeReferenceUrl: (rawUrl: string) => string;
  resolveReferenceFilePath: (reference: ReportReferenceImage) => string;
  deleteStoredReferenceFile: (reference: ReportReferenceImage) => Promise<unknown>;
  reportReferenceDir: string;
  storageRoot: string;
};

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim() || `reference-${Date.now()}`;
}

function findTemplateOrThrow(templates: SharedReportTemplate[], templateKey: string) {
  const template = templates.find((item) => item.key === templateKey);
  if (!template) throw new Error('shared report template not found');
  return template;
}

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

export async function createSharedReportTemplateWithDeps(
  input: {
    label: string;
    type?: ReportTemplateType;
    sourceType?: ReportReferenceSourceType;
    description?: string;
    preferredLayoutVariant?: SharedReportTemplate['preferredLayoutVariant'];
    isDefault?: boolean;
  },
  deps: ReportTemplateActionDeps,
) {
  const state = await deps.loadState();
  const label = String(input.label || '').trim();
  const type = input.type || deps.inferReportTemplateTypeFromSource({ sourceType: input.sourceType });
  if (!label) throw new Error('template label is required');
  if (!['table', 'static-page', 'ppt', 'document'].includes(type)) {
    throw new Error('template type is invalid');
  }

  const description = String(input.description || '').trim() || `${label} 模板`;
  const template: SharedReportTemplate = {
    key: deps.buildId('template'),
    label,
    type,
    description,
    preferredLayoutVariant: type === 'static-page'
      ? (
        input.preferredLayoutVariant
        || deps.inferTemplatePreferredLayoutVariant({ label, type, description })
      )
      : undefined,
    supported: true,
    isDefault: Boolean(input.isDefault),
    origin: 'user',
    createdAt: new Date().toISOString(),
    referenceImages: [],
  };

  const nextTemplates = state.templates.map((item) => (
    item.type === type && template.isDefault ? { ...item, isDefault: false } : item
  ));
  nextTemplates.push(template);
  await deps.saveGroupsAndOutputs(state.groups, state.outputs, nextTemplates);
  return template;
}

export async function updateSharedReportTemplateWithDeps(
  templateKey: string,
  patch: {
    label?: string;
    description?: string;
    preferredLayoutVariant?: SharedReportTemplate['preferredLayoutVariant'];
    isDefault?: boolean;
  },
  deps: ReportTemplateActionDeps,
) {
  const state = await deps.loadState();
  const template = findTemplateOrThrow(state.templates, templateKey);

  const nextTemplates = state.templates.map((item) => {
    if (item.key === templateKey) {
      return {
        ...item,
        label: patch.label ? String(patch.label).trim() || item.label : item.label,
        description: patch.description !== undefined ? String(patch.description).trim() || item.description : item.description,
        preferredLayoutVariant:
          item.type === 'static-page' && patch.preferredLayoutVariant !== undefined
            ? patch.preferredLayoutVariant
            : item.preferredLayoutVariant,
        isDefault: patch.isDefault !== undefined ? Boolean(patch.isDefault) : item.isDefault,
      };
    }
    if (patch.isDefault && item.type === template.type) {
      return { ...item, isDefault: false };
    }
    return item;
  });

  await deps.saveGroupsAndOutputs(state.groups, state.outputs, nextTemplates);
  return nextTemplates.find((item) => item.key === templateKey)!;
}

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
    sourceType?: ReportReferenceSourceType;
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

export async function deleteSharedReportTemplateWithDeps(
  templateKey: string,
  deps: ReportTemplateActionDeps,
) {
  const state = await deps.loadState();
  const template = findTemplateOrThrow(state.templates, templateKey);
  if (!deps.isUserSharedReportTemplate(template)) throw new Error('system template cannot be deleted');

  for (const reference of template.referenceImages || []) {
    await deps.deleteStoredReferenceFile(reference);
  }

  const nextTemplates = state.templates
    .filter((item) => item.key !== templateKey)
    .map((item) => ({ ...item }));

  if (template.isDefault) {
    const sameType = nextTemplates.filter((item) => item.type === template.type);
    if (sameType.length && !sameType.some((item) => item.isDefault)) {
      sameType[0].isDefault = true;
    }
  }

  await deps.saveGroupsAndOutputs(state.groups, state.outputs, nextTemplates);
  return template;
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
