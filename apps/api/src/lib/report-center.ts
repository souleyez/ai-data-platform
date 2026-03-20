import { createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { MultipartFile } from '@fastify/multipart';
import { loadDocumentLibraries } from './document-libraries.js';

const STORAGE_ROOT = path.resolve(process.cwd(), '../../storage');
const REPORT_CONFIG_DIR = path.join(STORAGE_ROOT, 'config');
const REPORT_REFERENCE_DIR = path.join(STORAGE_ROOT, 'files', 'report-references');
const REPORT_STATE_FILE = path.join(REPORT_CONFIG_DIR, 'report-center.json');

export type ReportTemplateType = 'table' | 'static-page' | 'ppt';

export type ReportReferenceImage = {
  id: string;
  fileName: string;
  originalName: string;
  uploadedAt: string;
  relativePath: string;
};

export type ReportGroupTemplate = {
  key: string;
  label: string;
  type: ReportTemplateType;
  description: string;
  supported: boolean;
};

export type ReportGroup = {
  key: string;
  label: string;
  description: string;
  triggerKeywords: string[];
  defaultTemplateKey: string;
  templates: ReportGroupTemplate[];
  referenceImages: ReportReferenceImage[];
};

export type ReportOutputRecord = {
  id: string;
  groupKey: string;
  groupLabel: string;
  templateKey: string;
  templateLabel: string;
  title: string;
  outputType: string;
  createdAt: string;
  status: 'ready';
  summary: string;
  triggerSource: 'report-center' | 'chat';
};

type PersistedState = {
  groups?: Array<Pick<ReportGroup, 'key' | 'label' | 'description' | 'triggerKeywords' | 'defaultTemplateKey' | 'templates' | 'referenceImages'>>;
  outputs?: ReportOutputRecord[];
};

function buildId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function ensureDirs() {
  await fs.mkdir(REPORT_CONFIG_DIR, { recursive: true });
  await fs.mkdir(REPORT_REFERENCE_DIR, { recursive: true });
}

async function readState(): Promise<PersistedState> {
  try {
    const raw = await fs.readFile(REPORT_STATE_FILE, 'utf8');
    return JSON.parse(raw) as PersistedState;
  } catch {
    return {};
  }
}

async function writeState(state: PersistedState) {
  await ensureDirs();
  await fs.writeFile(REPORT_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function isFormulaLibrary(label: string, key: string) {
  const text = `${label} ${key}`.toLowerCase();
  return text.includes('奶粉配方') || text.includes('配方建议') || text.includes('formula');
}

function buildTemplatesForLibrary(label: string, key: string): { templates: ReportGroupTemplate[]; defaultTemplateKey: string; triggerKeywords: string[]; description: string } {
  if (isFormulaLibrary(label, key)) {
    return {
      defaultTemplateKey: `${key}-table`,
      triggerKeywords: [label, '奶粉配方', '配方建议', '健脑', '抗抑郁', 'formula'],
      description: `${label} 分组固定以配方表格为主，可上传参考图辅助后续输出样式。`,
      templates: [
        {
          key: `${key}-table`,
          label: '配方表格',
          type: 'table',
          description: '按模块、建议原料、添加量、核心作用和配方说明输出。',
          supported: true,
        },
        {
          key: `${key}-static-page`,
          label: '数据可视化静态页',
          type: 'static-page',
          description: '后续扩展为固定可视化页面。',
          supported: false,
        },
        {
          key: `${key}-ppt`,
          label: 'PPT',
          type: 'ppt',
          description: '后续扩展为固定汇报稿。',
          supported: false,
        },
      ],
    };
  }

  return {
    defaultTemplateKey: `${key}-table`,
    triggerKeywords: [label],
    description: `${label} 分组的固定输出模板。`,
    templates: [
      {
        key: `${key}-table`,
        label: '表格',
        type: 'table',
        description: `按 ${label} 分组输出结构化表格结果。`,
        supported: true,
      },
      {
        key: `${key}-static-page`,
        label: '数据可视化静态页',
        type: 'static-page',
        description: `按 ${label} 分组生成静态页。`,
        supported: true,
      },
      {
        key: `${key}-ppt`,
        label: 'PPT',
        type: 'ppt',
        description: `按 ${label} 分组生成汇报稿。`,
        supported: true,
      },
    ],
  };
}

function buildGroupFromLibrary(label: string, key: string): ReportGroup {
  const config = buildTemplatesForLibrary(label, key);
  return {
    key,
    label,
    description: config.description,
    triggerKeywords: config.triggerKeywords,
    defaultTemplateKey: config.defaultTemplateKey,
    templates: config.templates,
    referenceImages: [],
  };
}

function reconcileOutputRecords(outputs: ReportOutputRecord[], groups: ReportGroup[]) {
  let changed = false;
  const formulaGroup = groups.find((group) => isFormulaLibrary(group.label, group.key));

  const nextOutputs = outputs
    .map((record) => {
      const directGroup = groups.find((group) => group.key === record.groupKey);
      if (directGroup) return record;

      const looksLikeFormulaRecord = isFormulaLibrary(record.groupLabel || '', record.groupKey || '');
      if (looksLikeFormulaRecord && formulaGroup) {
        changed = true;
        const template = formulaGroup.templates.find((item) => item.key === formulaGroup.defaultTemplateKey) || formulaGroup.templates[0];
        return {
          ...record,
          groupKey: formulaGroup.key,
          groupLabel: formulaGroup.label,
          templateKey: template?.key || record.templateKey,
          templateLabel: template?.label || record.templateLabel,
          title: record.title.replace(record.groupLabel, formulaGroup.label),
          summary: `${formulaGroup.label} 分组已按 ${template?.label || record.templateLabel} 模板生成成型报表。`,
        };
      }

      changed = true;
      return null;
    })
    .filter(Boolean) as ReportOutputRecord[];

  return { outputs: nextOutputs, changed };
}

export async function loadReportCenterState() {
  const [state, libraries] = await Promise.all([readState(), loadDocumentLibraries()]);
  const storedGroups = Array.isArray(state.groups) ? state.groups : [];
  const groups = libraries.map((library) => {
    const base = buildGroupFromLibrary(library.label, library.key);
    const stored = storedGroups.find((item) => item.key === library.key);
    if (!stored) return base;

    return {
      ...base,
      description: stored.description || base.description,
      triggerKeywords: Array.isArray(stored.triggerKeywords) && stored.triggerKeywords.length ? stored.triggerKeywords : base.triggerKeywords,
      defaultTemplateKey: stored.defaultTemplateKey || base.defaultTemplateKey,
      templates: Array.isArray(stored.templates) && stored.templates.length ? stored.templates : base.templates,
      referenceImages: Array.isArray(stored.referenceImages) ? stored.referenceImages : [],
    };
  });

  const rawOutputs = Array.isArray(state.outputs) ? state.outputs : [];
  const { outputs, changed } = reconcileOutputRecords(rawOutputs, groups);

  if (changed) {
    await saveGroupsAndOutputs(groups, outputs);
  }

  return { groups, outputs };
}

async function saveGroupsAndOutputs(groups: ReportGroup[], outputs: ReportOutputRecord[]) {
  await writeState({
    groups: groups.map((group) => ({
      key: group.key,
      label: group.label,
      description: group.description,
      triggerKeywords: group.triggerKeywords,
      defaultTemplateKey: group.defaultTemplateKey,
      templates: group.templates,
      referenceImages: group.referenceImages,
    })),
    outputs,
  });
}

export async function createReportOutput(input: {
  groupKey: string;
  templateKey?: string;
  title?: string;
  triggerSource?: 'report-center' | 'chat';
}) {
  const state = await loadReportCenterState();
  const group = state.groups.find((item) => item.key === input.groupKey);
  if (!group) throw new Error('report group not found');

  const template = group.templates.find((item) => item.key === (input.templateKey || group.defaultTemplateKey)) || group.templates[0];
  if (!template) throw new Error('report template not found');

  const createdAt = new Date().toISOString();
  const record: ReportOutputRecord = {
    id: buildId('report'),
    groupKey: group.key,
    groupLabel: group.label,
    templateKey: template.key,
    templateLabel: template.label,
    title: input.title?.trim() || `${group.label}-${template.label}-${createdAt.slice(0, 10)}`,
    outputType: template.type === 'table' ? '表格' : template.type === 'static-page' ? '静态页' : 'PPT',
    createdAt,
    status: 'ready',
    summary: `${group.label} 分组已按 ${template.label} 模板生成成型报表。`,
    triggerSource: input.triggerSource || 'report-center',
  };

  const nextOutputs = [record, ...state.outputs].slice(0, 100);
  await saveGroupsAndOutputs(state.groups, nextOutputs);
  return record;
}

export async function updateReportGroupTemplate(groupKey: string, templateKey: string) {
  const state = await loadReportCenterState();
  const group = state.groups.find((item) => item.key === groupKey);
  if (!group) throw new Error('report group not found');

  const template = group.templates.find((item) => item.key === templateKey);
  if (!template) throw new Error('report template not found');

  group.defaultTemplateKey = template.key;
  await saveGroupsAndOutputs(state.groups, state.outputs);
  return {
    group,
    template,
  };
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim() || `reference-${Date.now()}`;
}

export async function uploadReportReferenceImage(groupKey: string, file: MultipartFile) {
  const state = await loadReportCenterState();
  const group = state.groups.find((item) => item.key === groupKey);
  if (!group) throw new Error('report group not found');

  await ensureDirs();
  const safeName = sanitizeFileName(file.filename || 'reference.png');
  const id = buildId('ref');
  const ext = path.extname(safeName) || '.png';
  const outputName = `${id}${ext}`;
  const fullPath = path.join(REPORT_REFERENCE_DIR, outputName);
  await pipeline(file.file, createWriteStream(fullPath));

  const image: ReportReferenceImage = {
    id,
    fileName: outputName,
    originalName: safeName,
    uploadedAt: new Date().toISOString(),
    relativePath: path.relative(STORAGE_ROOT, fullPath).replace(/\\/g, '/'),
  };

  group.referenceImages = [image, ...group.referenceImages].slice(0, 12);
  await saveGroupsAndOutputs(state.groups, state.outputs);
  return image;
}

export function findReportGroupForPrompt(groups: ReportGroup[], prompt: string) {
  const text = prompt.toLowerCase();
  return groups.find((group) => group.triggerKeywords.some((keyword) => text.includes(String(keyword).toLowerCase())));
}
