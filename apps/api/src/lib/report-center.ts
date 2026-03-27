import { createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { MultipartFile } from '@fastify/multipart';
import { loadDocumentLibraries } from './document-libraries.js';
import { STORAGE_CONFIG_DIR, STORAGE_FILES_DIR, STORAGE_ROOT } from './paths.js';

const REPORT_CONFIG_DIR = STORAGE_CONFIG_DIR;
const REPORT_REFERENCE_DIR = path.join(STORAGE_FILES_DIR, 'report-references');
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

export type ReportTemplateEnvelope = {
  title: string;
  fixedStructure: string[];
  variableZones: string[];
  outputHint: string;
  tableColumns?: string[];
  pageSections?: string[];
};

export type ReportOutputRecord = {
  id: string;
  groupKey: string;
  groupLabel: string;
  templateKey: string;
  templateLabel: string;
  title: string;
  outputType: string;
  kind?: 'table' | 'page' | 'ppt' | 'pdf';
  format?: string;
  createdAt: string;
  status: 'ready';
  summary: string;
  triggerSource: 'report-center' | 'chat';
  content?: string;
  table?: {
    columns?: string[];
    rows?: Array<Array<string | number | null>>;
    title?: string;
  } | null;
  page?: {
    summary?: string;
    cards?: Array<{ label?: string; value?: string; note?: string }>;
    sections?: Array<{ title?: string; body?: string; bullets?: string[] }>;
    charts?: Array<{ title?: string; items?: Array<{ label?: string; value?: number }> }>;
  } | null;
  libraries?: Array<{ key?: string; label?: string }>;
  downloadUrl?: string;
};

function resolveTemplateTypeFromKind(kind?: 'table' | 'page' | 'ppt' | 'pdf'): ReportTemplateType | null {
  if (kind === 'table') return 'table';
  if (kind === 'page') return 'static-page';
  if (kind === 'ppt' || kind === 'pdf') return 'ppt';
  return null;
}

function resolveOutputTypeLabel(kind?: 'table' | 'page' | 'ppt' | 'pdf', templateType?: ReportTemplateType) {
  if (kind === 'table') return '表格';
  if (kind === 'page') return '静态页';
  if (kind === 'pdf') return 'PDF';
  if (kind === 'ppt') return 'PPT';
  if (templateType === 'table') return '表格';
  if (templateType === 'static-page') return '静态页';
  return 'PPT';
}

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

function isResumeLibrary(label: string, key: string) {
  const text = `${label} ${key}`.toLowerCase();
  return text.includes('resume') || text.includes('cv') || text.includes('简历') || text.includes('候选人');
}

function isOrderLibrary(label: string, key: string) {
  const text = `${label} ${key}`.toLowerCase();
  return text.includes('order') || text.includes('订单') || text.includes('销售') || text.includes('电商') || text.includes('库存');
}

function isBidLibrary(label: string, key: string) {
  const text = `${label} ${key}`.toLowerCase();
  return text.includes('bids') || text.includes('bid') || text.includes('tender') || text.includes('标书') || text.includes('招标') || text.includes('投标');
}

function buildTemplatesForLibrary(label: string, key: string) {
  if (isFormulaLibrary(label, key)) {
    return {
      defaultTemplateKey: `${key}-table`,
      triggerKeywords: [label, '奶粉配方', '配方建议', '健脑', '抗抑郁', 'formula'],
      description: `${label} 分组固定以配方表格为主，可上传参考图辅助后续输出样式。`,
      templates: [
        {
          key: `${key}-table`,
          label: '配方表格',
          type: 'table' as const,
          description: '按模块、建议原料、添加量、核心作用和配方说明输出。',
          supported: true,
        },
        {
          key: `${key}-static-page`,
          label: '数据可视化静态页',
          type: 'static-page' as const,
          description: '后续扩展为固定可视化页面。',
          supported: true,
        },
        {
          key: `${key}-ppt`,
          label: 'PPT',
          type: 'ppt' as const,
          description: '后续扩展为固定汇报稿。',
          supported: true,
        },
      ],
    };
  }

  if (isResumeLibrary(label, key)) {
    return {
      defaultTemplateKey: `${key}-table`,
      triggerKeywords: [label, 'resume', 'cv', '简历', '候选人'],
      description: `${label} 分组固定以简历对比表格为主。`,
      templates: [
        {
          key: `${key}-table`,
          label: '简历对比表格',
          type: 'table' as const,
          description: '按第一学历、就职公司、核心能力、年龄等维度输出简历对比结果。',
          supported: true,
        },
        {
          key: `${key}-ppt`,
          label: 'PPT',
          type: 'ppt' as const,
          description: '后续扩展为候选人汇报稿。',
          supported: true,
        },
      ],
    };
  }

  if (isOrderLibrary(label, key)) {
    return {
      defaultTemplateKey: `${key}-static-page`,
      triggerKeywords: [label, 'order', '订单', '销售', '电商', '库存'],
      description: `${label} 分组固定以多品类多平台经营静态页为主。`,
      templates: [
        {
          key: `${key}-static-page`,
          label: '订单经营静态页',
          type: 'static-page' as const,
          description: '体现多品类、多平台、同比环比、预测销量、库存指数、备货推荐和异常波动。',
          supported: true,
        },
        {
          key: `${key}-table`,
          label: '订单分析表格',
          type: 'table' as const,
          description: '按平台、品类和库存建议输出结构化表格。',
          supported: true,
        },
        {
          key: `${key}-ppt`,
          label: 'PPT',
          type: 'ppt' as const,
          description: '后续扩展为经营汇报简报。',
          supported: true,
        },
      ],
    };
  }

  if (isBidLibrary(label, key)) {
    return {
      defaultTemplateKey: `${key}-table`,
      triggerKeywords: [label, 'bids', 'bid', 'tender', '标书', '招标', '投标'],
      description: `${label} 分组固定以标书应答表格为主。`,
      templates: [
        {
          key: `${key}-table`,
          label: '标书应答表格',
          type: 'table' as const,
          description: '按章节、应答重点、需补充材料、风险提示和证据来源输出标书应答表格。',
          supported: true,
        },
        {
          key: `${key}-static-page`,
          label: '标书摘要静态页',
          type: 'static-page' as const,
          description: '输出适合团队传阅的标书摘要静态页。',
          supported: true,
        },
        {
          key: `${key}-ppt`,
          label: '标书汇报提纲',
          type: 'ppt' as const,
          description: '输出适合投标汇报使用的结构化提纲。',
          supported: true,
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
        type: 'table' as const,
        description: `按 ${label} 分组输出结构化表格结果。`,
        supported: true,
      },
      {
        key: `${key}-static-page`,
        label: '数据可视化静态页',
        type: 'static-page' as const,
        description: `按 ${label} 分组生成静态页。`,
        supported: true,
      },
      {
        key: `${key}-ppt`,
        label: 'PPT',
        type: 'ppt' as const,
        description: `按 ${label} 分组生成汇报稿。`,
        supported: true,
      },
    ],
  };
}

export function buildTemplateEnvelope(group: ReportGroup, template: ReportGroupTemplate): ReportTemplateEnvelope {
  if (template.type === 'table') {
    if (isResumeLibrary(group.label, group.key)) {
      return {
        title: `${group.label} 简历对比模板`,
        fixedStructure: [
          '列结构应稳定，优先包含候选人、第一学历、最近就职公司、核心能力、年龄、工作年限、匹配判断、证据来源。',
          '每一行只代表一位候选人，不要把多位候选人的信息混在一行。',
          '字段缺失可以留空，但不要自行补造。',
        ],
        variableZones: ['筛选范围', '核心能力归纳', '匹配判断', '证据引用细节'],
        outputHint: '输出应适合招聘筛选和简历横向比较。',
        tableColumns: ['候选人', '第一学历', '最近就职公司', '核心能力', '年龄', '工作年限', '匹配判断', '证据来源'],
      };
    }

    if (isFormulaLibrary(group.label, group.key)) {
      return {
        title: `${group.label} 配方表格模板`,
        fixedStructure: [
          '列结构应稳定，优先包含模块、建议原料或菌株、添加量或剂量、核心作用、适用人群、证据来源、备注。',
          '每一行应对应一个明确的配方建议单元，不要把多个建议混在一格。',
          '证据来源尽量来自知识库文档，不足时才补充常识性说明。',
        ],
        variableZones: ['模块拆分方式', '建议原料或菌株', '剂量建议', '卖点归纳', '证据引用细节'],
        outputHint: '输出应适合专家级配方建议表格，结构稳定，便于继续迭代。',
        tableColumns: ['模块', '建议原料或菌株', '添加量或剂量', '核心作用', '适用人群', '证据来源', '备注'],
      };
    }

    if (isBidLibrary(group.label, group.key)) {
      return {
        title: `${group.label} 标书应答模板`,
        fixedStructure: [
          '列结构必须稳定，优先包含章节、应答重点、需补充材料、风险提示、证据来源。',
          '每一行只对应一个标书章节或应答要点，不要把多个章节混在同一行。',
          '优先依据知识库中的招标文件和模板文档组织内容，不足时才补充通用表述。',
        ],
        variableZones: ['章节拆分方式', '应答重点', '需补充材料', '风险提示', '证据引用细节'],
        outputHint: '输出应接近正式标书应答底稿，适合继续人工补充和迭代。',
        tableColumns: ['章节', '应答重点', '需补充材料', '风险提示', '证据来源'],
      };
    }

    return {
      title: `${group.label} 表格模板`,
      fixedStructure: [
        '输出必须保持表格化，不要改成散文。',
        '列结构要稳定，先给结论，再给说明或证据。',
        '知识库证据优先，不足时才做克制补充。',
      ],
      variableZones: ['具体列名', '每行内容细节', '补充说明强度'],
      outputHint: '输出保持整洁、克制，便于后续继续追问优化。',
      tableColumns: ['结论', '说明', '证据来源'],
    };
  }

  if (template.type === 'static-page') {
    if (isOrderLibrary(group.label, group.key)) {
      return {
        title: `${group.label} 订单经营静态页模板`,
        fixedStructure: [
          '页面结构应稳定，优先包含经营摘要、核心指标卡片、平台对比、品类对比、库存与备货建议、异常波动说明。',
          '必须体现多品类、多平台、同比、环比、预测销量、库存指数和备货推荐。',
          '内容适合直接转发，不带平台入口与回链。',
        ],
        variableZones: ['经营摘要文本', '指标卡片数值', '平台与品类图表数据', '异常波动解释', '备货建议细节'],
        outputHint: '输出应接近正式经营分析静态页，而不是聊天回答。',
        pageSections: ['经营摘要', '平台对比', '品类对比', '库存与备货建议', '异常波动说明'],
      };
    }

    if (isBidLibrary(group.label, group.key)) {
      return {
        title: `${group.label} 标书摘要静态页模板`,
        fixedStructure: [
          '页面结构应稳定，优先包含项目概况、资格条件、关键时间节点、应答重点、风险提醒。',
          '必须适合转发查看，不带平台入口或技术说明。',
          '内容应接近正式投标摘要页，而不是聊天回答。',
        ],
        variableZones: ['项目摘要', '时间节点', '关键要求', '风险与待补材料', '证据引用细节'],
        outputHint: '输出应适合团队内部传阅，用于快速判断是否进入正式标书编制。',
        pageSections: ['项目概况', '资格条件', '关键时间节点', '应答重点', '风险提醒'],
      };
    }

    return {
      title: `${group.label} 静态页模板`,
      fixedStructure: [
        '页面结构稳定，优先包含摘要、核心卡片、分节正文、简单图表。',
        '禁止出现平台入口或回链。',
        '信息组织必须接近正式对外静态页，而不是聊天回答。',
      ],
      variableZones: ['摘要文本', '核心指标卡片', '分节内容', '图表数据项'],
      outputHint: '输出应适合复制链接直接转发。',
      pageSections: ['摘要', '核心指标', '重点分析', '补充说明'],
    };
  }

  return {
    title: `${group.label} 汇报模板`,
    fixedStructure: [
      '优先输出结构化摘要与分节要点。',
      '不要自由改变输出形态。',
    ],
    variableZones: ['摘要内容', '章节要点'],
    outputHint: '保持适合后续导出为 PDF/PPT 的结构。',
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
      let nextRecord: ReportOutputRecord = { ...record };
      const directGroup = groups.find((group) => group.key === record.groupKey);
      if (!nextRecord.content && !nextRecord.table && !nextRecord.page) {
        nextRecord = {
          ...nextRecord,
          content: [
            nextRecord.summary || '该报表为历史记录，当前未保存正文内容。',
            nextRecord.groupLabel ? `知识库：${nextRecord.groupLabel}` : '',
            nextRecord.templateLabel ? `输出模板：${nextRecord.templateLabel}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
        };
        changed = true;
      }

      if (directGroup) return nextRecord;

      const looksLikeFormulaRecord = isFormulaLibrary(record.groupLabel || '', record.groupKey || '');
      if (looksLikeFormulaRecord && formulaGroup) {
        changed = true;
        const template = formulaGroup.templates.find((item) => item.key === formulaGroup.defaultTemplateKey) || formulaGroup.templates[0];
        return {
          ...nextRecord,
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

export async function loadReportCenterState() {
  const [state, libraries] = await Promise.all([readState(), loadDocumentLibraries()]);
  const storedGroups = Array.isArray(state.groups) ? state.groups : [];
  const groups = libraries.map((library) => {
    const base = buildGroupFromLibrary(library.label, library.key);
    const stored = storedGroups.find((item) => item.key === library.key);
    if (!stored) return base;

    const storedTemplates = Array.isArray(stored.templates) && stored.templates.length ? stored.templates : base.templates;
    const resolvedDefaultTemplateKey = storedTemplates.some((item) => item.key === base.defaultTemplateKey)
      ? base.defaultTemplateKey
      : stored.defaultTemplateKey || base.defaultTemplateKey;

    return {
      ...base,
      description: stored.description || base.description,
      triggerKeywords: Array.isArray(stored.triggerKeywords) && stored.triggerKeywords.length ? stored.triggerKeywords : base.triggerKeywords,
      defaultTemplateKey: resolvedDefaultTemplateKey,
      templates: storedTemplates,
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

export async function createReportOutput(input: {
  groupKey: string;
  templateKey?: string;
  title?: string;
  triggerSource?: 'report-center' | 'chat';
  kind?: 'table' | 'page' | 'ppt' | 'pdf';
  format?: string;
  content?: string;
  table?: ReportOutputRecord['table'];
  page?: ReportOutputRecord['page'];
  libraries?: ReportOutputRecord['libraries'];
  downloadUrl?: string;
}) {
  const state = await loadReportCenterState();
  const group = state.groups.find((item) => item.key === input.groupKey);
  if (!group) throw new Error('report group not found');

  const preferredTemplateType = resolveTemplateTypeFromKind(input.kind);
  const template =
    (input.templateKey ? group.templates.find((item) => item.key === input.templateKey) : null)
    || (preferredTemplateType ? group.templates.find((item) => item.type === preferredTemplateType) : null)
    || group.templates.find((item) => item.key === group.defaultTemplateKey)
    || group.templates[0];
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
    kind: input.kind || (template.type === 'table' ? 'table' : template.type === 'static-page' ? 'page' : 'ppt'),
    format: input.format || (template.type === 'table' ? 'csv' : template.type === 'static-page' ? 'html' : 'ppt'),
    createdAt,
    status: 'ready',
    summary: `${group.label} 分组已按 ${template.label} 模板生成成型报表。`,
    triggerSource: input.triggerSource || 'report-center',
    content: input.content || '',
    table: input.table || null,
    page: input.page || null,
    libraries: Array.isArray(input.libraries) ? input.libraries : [],
    downloadUrl: input.downloadUrl || '',
  };

  const nextOutputs = [record, ...state.outputs].slice(0, 100);
  await saveGroupsAndOutputs(state.groups, nextOutputs);
  return record;
}

export async function deleteReportOutput(outputId: string) {
  const state = await loadReportCenterState();
  const nextOutputs = state.outputs.filter((item) => item.id !== outputId);
  if (nextOutputs.length === state.outputs.length) {
    throw new Error('report output not found');
  }
  await saveGroupsAndOutputs(state.groups, nextOutputs);
}

export async function updateReportGroupTemplate(groupKey: string, templateKey: string) {
  const state = await loadReportCenterState();
  const group = state.groups.find((item) => item.key === groupKey);
  if (!group) throw new Error('report group not found');

  const template = group.templates.find((item) => item.key === templateKey);
  if (!template) throw new Error('report template not found');

  group.defaultTemplateKey = template.key;
  await saveGroupsAndOutputs(state.groups, state.outputs);
  return { group, template };
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
