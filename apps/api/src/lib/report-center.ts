import { createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { MultipartFile } from '@fastify/multipart';
import { loadDocumentLibraries } from './document-libraries.js';
import { normalizeReportOutput } from './knowledge-output.js';
import { isOpenClawGatewayConfigured, runOpenClawChat } from './openclaw-adapter.js';
import { STORAGE_CONFIG_DIR, STORAGE_FILES_DIR, STORAGE_ROOT } from './paths.js';

const REPORT_CONFIG_DIR = STORAGE_CONFIG_DIR;
const REPORT_REFERENCE_DIR = path.join(STORAGE_FILES_DIR, 'report-references');
const REPORT_STATE_FILE = path.join(REPORT_CONFIG_DIR, 'report-center.json');

export type ReportTemplateType = 'table' | 'static-page' | 'ppt' | 'document';

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

export type SharedReportTemplate = {
  key: string;
  label: string;
  type: ReportTemplateType;
  description: string;
  supported: boolean;
  isDefault?: boolean;
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

function summarizeTableForAnalysis(table?: ReportOutputRecord['table']) {
  const columns = Array.isArray(table?.columns) ? table.columns : [];
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  const previewRows = rows.slice(0, 6).map((row) => row.map((cell) => String(cell ?? '')).join(' | '));
  return [
    columns.length ? `表头：${columns.join('、')}` : '',
    rows.length ? `数据行数：${rows.length}` : '',
    previewRows.length ? `样例数据：\n${previewRows.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function summarizePageForAnalysis(page?: ReportOutputRecord['page']) {
  const cards = Array.isArray(page?.cards) ? page.cards : [];
  const sections = Array.isArray(page?.sections) ? page.sections : [];
  const charts = Array.isArray(page?.charts) ? page.charts : [];
  return [
    page?.summary ? `摘要：${page.summary}` : '',
    cards.length ? `指标卡片：${cards.map((item) => `${item.label || ''}${item.value ? `=${item.value}` : ''}`).join('；')}` : '',
    sections.length ? `分节：${sections.map((item) => item.title).filter(Boolean).join('、')}` : '',
    charts.length ? `图表：${charts.map((item) => item.title).filter(Boolean).join('、')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildLocalReportAnalysis(record: {
  groupLabel: string;
  templateLabel: string;
  kind?: 'table' | 'page' | 'ppt' | 'pdf';
  table?: ReportOutputRecord['table'];
  page?: ReportOutputRecord['page'];
  content?: string;
}) {
  if (record.kind === 'page') {
    const cards = record.page?.cards || [];
    const strongestCard = cards[0];
    return [
      `${record.groupLabel} 的当前输出已经按 ${record.templateLabel} 组织完成。`,
      strongestCard?.label && strongestCard?.value
        ? `当前最值得优先关注的是 ${strongestCard.label}，样例值为 ${strongestCard.value}。`
        : '当前最值得优先关注的是经营摘要、核心指标和异常波动之间的关系。',
      '建议结合知识库证据继续补充关键原因、风险点和下一步动作，使结果更适合直接汇报或转发。',
    ].join('');
  }

  const rowCount = Array.isArray(record.table?.rows) ? record.table.rows.length : 0;
  const firstColumn = Array.isArray(record.table?.columns) ? record.table?.columns?.[0] : '';
  return [
    `${record.groupLabel} 的当前输出已经按 ${record.templateLabel} 形成结构化表格。`,
    rowCount ? `当前共整理 ${rowCount} 行核心内容` : '当前已整理出核心条目',
    firstColumn ? `，建议优先复核“${firstColumn}”这一主维度下的结论一致性。` : '，建议优先复核主要结论与证据的一致性。',
    '如果需要进一步增强，可继续补充筛选范围、排序逻辑或重点字段。',
  ].join('');
}

async function buildCloudReportAnalysis(record: {
  groupLabel: string;
  templateLabel: string;
  kind?: 'table' | 'page' | 'ppt' | 'pdf';
  table?: ReportOutputRecord['table'];
  page?: ReportOutputRecord['page'];
  content?: string;
  libraries?: ReportOutputRecord['libraries'];
}) {
  if (!isOpenClawGatewayConfigured()) {
    return '';
  }

  const context = [
    record.kind === 'page' ? summarizePageForAnalysis(record.page) : summarizeTableForAnalysis(record.table),
    record.content ? `正文：${record.content}` : '',
    Array.isArray(record.libraries) && record.libraries.length
      ? `知识库：${record.libraries.map((item) => item.label || item.key).filter(Boolean).join('、')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  if (!context) return '';

  try {
    const response = await runOpenClawChat({
      prompt: [
        `请基于以下${record.kind === 'page' ? '静态页' : '报表'}内容，输出一段“AI综合分析”。`,
        '要求：',
        '1. 只输出一段自然中文，不要标题，不要编号，不要 Markdown。',
        '2. 聚焦核心发现、风险点、可执行建议。',
        '3. 120 到 220 字。',
        '',
        context,
      ].join('\n'),
      systemPrompt: [
        '你是企业知识分析助手。',
        '你的任务是根据已经整理好的报表内容，生成一段克制、专业、适合业务阅读的综合分析。',
        '不要重复表格原文，不要使用括号、星号、井号、分隔线。',
      ].join('\n'),
    });

    return String(response.content || '').replace(/\s+/g, ' ').trim();
  } catch {
    return '';
  }
}

async function attachReportAnalysis(record: ReportOutputRecord) {
  const analysis =
    (await buildCloudReportAnalysis(record)) ||
    buildLocalReportAnalysis(record);

  if (!analysis) return record;

  if (record.kind === 'page') {
    const sections = Array.isArray(record.page?.sections) ? [...record.page.sections] : [];
    const filteredSections = sections.filter((item) => String(item?.title || '').trim() !== 'AI综合分析');
    filteredSections.push({
      title: 'AI综合分析',
      body: analysis,
      bullets: [],
    });
    return {
      ...record,
      page: {
        ...(record.page || {}),
        sections: filteredSections,
      },
    };
  }

  const table = record.table || { columns: ['结论', '说明'], rows: [] };
  const columns = Array.isArray(table.columns) && table.columns.length ? table.columns : ['结论', '说明'];
  const rows = Array.isArray(table.rows) ? [...table.rows] : [];
  const filteredRows = rows.filter((row) => String(row?.[0] || '').trim() !== 'AI综合分析');
  const analysisRow =
    columns.length === 1
      ? [`AI综合分析：${analysis}`]
      : ['AI综合分析', analysis, ...new Array(Math.max(0, columns.length - 2)).fill('')];
  filteredRows.push(analysisRow);

  return {
    ...record,
    table: {
      ...table,
      columns,
      rows: filteredRows,
    },
  };
}

function attachLocalReportAnalysis(record: ReportOutputRecord) {
  const analysis = buildLocalReportAnalysis(record);
  if (!analysis) return record;

  if (record.kind === 'page') {
    const sections = Array.isArray(record.page?.sections) ? [...record.page.sections] : [];
    if (!sections.some((item) => String(item?.title || '').trim() === 'AI综合分析')) {
      sections.push({ title: 'AI综合分析', body: analysis, bullets: [] });
    }
    return {
      ...record,
      page: {
        ...(record.page || {}),
        sections,
      },
    };
  }

  const table = record.table || { columns: ['结论', '说明'], rows: [] };
  const columns = Array.isArray(table.columns) && table.columns.length ? table.columns : ['结论', '说明'];
  const rows = Array.isArray(table.rows) ? [...table.rows] : [];
  if (!rows.some((row) => String(row?.[0] || '').trim() === 'AI综合分析')) {
    rows.push(columns.length === 1 ? [`AI综合分析：${analysis}`] : ['AI综合分析', analysis, ...new Array(Math.max(0, columns.length - 2)).fill('')]);
  }
  return {
    ...record,
    table: {
      ...table,
      columns,
      rows,
    },
  };
}

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
  templates?: SharedReportTemplate[];
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

function buildDefaultSharedTemplates(): SharedReportTemplate[] {
  return [
    {
      key: 'shared-static-page-default',
      label: '默认数据可视化静态页',
      type: 'static-page',
      description: '默认用于生成可转发的数据可视化静态页，强调摘要、核心指标、图表和行动建议。',
      supported: true,
      isDefault: true,
      referenceImages: [],
    },
    {
      key: 'shared-ppt-default',
      label: '默认PPT提纲',
      type: 'ppt',
      description: '默认用于生成汇报型PPT提纲，强调标题页、关键结论、分章节要点和行动建议。',
      supported: true,
      isDefault: true,
      referenceImages: [],
    },
    {
      key: 'shared-table-default',
      label: '默认结构化表格',
      type: 'table',
      description: '默认用于生成结构稳定的表格报表，强调结论、说明、证据来源等固定列。',
      supported: true,
      isDefault: true,
      referenceImages: [],
    },
    {
      key: 'shared-document-default',
      label: '默认文档输出',
      type: 'document',
      description: '默认用于生成正文型文档输出，强调标题、摘要、分节和结论建议。',
      supported: true,
      isDefault: true,
      referenceImages: [],
    },
  ];
}

function mergeSharedTemplates(storedTemplates: SharedReportTemplate[] | undefined) {
  const defaults = buildDefaultSharedTemplates();
  const merged = new Map<string, SharedReportTemplate>();

  for (const template of defaults) {
    merged.set(template.key, template);
  }

  for (const template of storedTemplates || []) {
    if (!template?.key) continue;
    const fallback = merged.get(template.key);
    merged.set(template.key, {
      ...(fallback || {}),
      ...template,
      referenceImages: Array.isArray(template.referenceImages) ? template.referenceImages : (fallback?.referenceImages || []),
    });
  }

  const values = Array.from(merged.values());
  for (const type of ['static-page', 'ppt', 'table', 'document'] as ReportTemplateType[]) {
    const sameType = values.filter((item) => item.type === type);
    if (!sameType.length) continue;
    if (!sameType.some((item) => item.isDefault)) {
      sameType[0].isDefault = true;
    }
  }
  return values;
}

function looksLikeResumeTemplate(template: SharedReportTemplate) {
  const text = `${template.label} ${template.description || ''}`.toLowerCase();
  return text.includes('简历') || text.includes('resume') || text.includes('cv') || text.includes('候选人');
}

function looksLikeBidTemplate(template: SharedReportTemplate) {
  const text = `${template.label} ${template.description || ''}`.toLowerCase();
  return text.includes('标书') || text.includes('招标') || text.includes('投标') || text.includes('bid') || text.includes('tender');
}

function looksLikeOrderTemplate(template: SharedReportTemplate) {
  const text = `${template.label} ${template.description || ''}`.toLowerCase();
  return text.includes('订单') || text.includes('销售') || text.includes('库存') || text.includes('电商') || text.includes('order');
}

function looksLikeFormulaTemplate(template: SharedReportTemplate) {
  const text = `${template.label} ${template.description || ''}`.toLowerCase();
  return text.includes('配方') || text.includes('奶粉') || text.includes('formula');
}

export function buildSharedTemplateEnvelope(template: SharedReportTemplate): ReportTemplateEnvelope {
  if (template.type === 'static-page') {
    if (looksLikeOrderTemplate(template)) {
      return {
        title: template.label,
        fixedStructure: [
          '页面结构必须稳定，优先包含经营摘要、核心指标卡片、平台对比、品类对比、库存与备货建议、异常波动说明。',
          '必须体现多品类、多平台、同比、环比、预测销量、库存指数和备货建议。',
          '内容适合直接转发，不带平台入口与回链。',
        ],
        variableZones: ['经营摘要文本', '指标卡片数值', '平台与品类图表数据', '异常波动解释', '备货建议细节', 'AI综合分析'],
        outputHint: template.description,
        pageSections: ['经营摘要', '平台对比', '品类对比', '库存与备货建议', '异常波动说明', 'AI综合分析'],
      };
    }

    if (looksLikeBidTemplate(template)) {
      return {
        title: template.label,
        fixedStructure: [
          '页面结构应稳定，优先包含项目概况、资格条件、关键时间节点、应答重点、风险提醒。',
          '内容必须适合团队转发查看，不带平台入口和技术说明。',
          '输出应接近正式投标摘要页，而不是聊天回答。',
        ],
        variableZones: ['项目摘要', '时间节点', '关键要求', '风险与待补材料', '证据引用细节', 'AI综合分析'],
        outputHint: template.description,
        pageSections: ['项目概况', '资格条件', '关键时间节点', '应答重点', '风险提醒', 'AI综合分析'],
      };
    }

    if (looksLikeFormulaTemplate(template)) {
      return {
        title: template.label,
        fixedStructure: [
          '页面结构稳定，先给方案摘要，再给核心成分、适用人群、作用机制、证据依据和风险提示。',
          '输出必须保留专业性，适合继续讨论配方方案。',
          '不要把页面写成纯聊天回答。',
        ],
        variableZones: ['方案摘要', '核心成分与菌株', '适用人群', '作用归纳', '证据说明', 'AI综合分析'],
        outputHint: template.description,
        pageSections: ['方案摘要', '核心成分', '适用人群', '作用机制', '证据依据', 'AI综合分析'],
      };
    }

    return {
      title: template.label,
      fixedStructure: [
        '页面结构优先保持稳定，先给摘要，再给核心指标卡片、重点分节、图表和行动建议。',
        '页面适合直接转发，不带平台入口或回链。',
        '尽量把信息组织成可读的业务页面，而不是聊天回答。',
      ],
      variableZones: ['摘要内容', '图表指标', '重点分节内容', '行动建议', 'AI综合分析'],
      outputHint: template.description,
      pageSections: ['摘要', '核心指标', '重点分析', '行动建议', 'AI综合分析'],
    };
  }

  if (template.type === 'ppt') {
    return {
      title: template.label,
      fixedStructure: [
        '输出应是适合汇报的结构化提纲，而不是聊天正文。',
        '优先包含标题页、结论摘要、关键分析、行动建议。',
        '章节顺序保持稳定，便于继续转成正式PPT。',
      ],
      variableZones: ['标题', '章节要点', '数据亮点', '行动建议'],
      outputHint: template.description,
      pageSections: ['标题页', '结论摘要', '关键分析', '行动建议'],
    };
  }

  if (template.type === 'document') {
    return {
      title: template.label,
      fixedStructure: [
        '输出应保持文档正文形态，优先包含摘要、正文分节、结论和建议。',
        '不要改成表格或碎片式聊天回答。',
        '结构稳定，适合导出为正式文档。',
      ],
      variableZones: ['文档标题', '摘要', '正文分节', '结论建议'],
      outputHint: template.description,
      pageSections: ['摘要', '正文分析', '结论建议'],
    };
  }

  if (looksLikeResumeTemplate(template)) {
    return {
      title: template.label,
      fixedStructure: [
        '输出必须保持表格化，列结构稳定，优先包含候选人、第一学历、最近就职公司、核心能力、年龄、工作年限、匹配判断、证据来源。',
        '每一行只对应一位候选人，不要混合多位候选人的信息。',
        '字段缺失可以留空，但不要自行补造。',
      ],
      variableZones: ['筛选范围', '核心能力归纳', '匹配判断', '证据引用细节', 'AI综合分析'],
      outputHint: template.description,
      tableColumns: ['候选人', '第一学历', '最近就职公司', '核心能力', '年龄', '工作年限', '匹配判断', '证据来源'],
    };
  }

  if (looksLikeBidTemplate(template)) {
    return {
      title: template.label,
      fixedStructure: [
        '输出必须保持表格化，列结构稳定，优先包含章节、应答重点、需补充材料、风险提示、证据来源。',
        '每一行只对应一个章节或应答要点，不要把多个章节混在同一行。',
        '优先依据知识库中的招标文件和模板文档组织内容。',
      ],
      variableZones: ['章节拆分方式', '应答重点', '需补充材料', '风险提示', '证据引用细节', 'AI综合分析'],
      outputHint: template.description,
      tableColumns: ['章节', '应答重点', '需补充材料', '风险提示', '证据来源'],
    };
  }

  if (looksLikeFormulaTemplate(template)) {
    return {
      title: template.label,
      fixedStructure: [
        '输出必须保持表格化，优先包含模块、建议原料或菌株、添加量或剂量、核心作用、适用人群、证据来源、备注。',
        '每一行应对应一个明确的配方建议单元，不要把多个建议混在同一格。',
        '证据来源尽量来自知识库文档，不足时才补充常识性说明。',
      ],
      variableZones: ['模块拆分方式', '建议原料或菌株', '剂量建议', '卖点归纳', '证据引用细节', 'AI综合分析'],
      outputHint: template.description,
      tableColumns: ['模块', '建议原料或菌株', '添加量或剂量', '核心作用', '适用人群', '证据来源', '备注'],
    };
  }

  return {
    title: template.label,
    fixedStructure: [
      '输出必须保持表格化，不要改成散文。',
      '列结构要稳定，先给结论，再给说明和证据。',
      '知识库证据优先，不足时才做克制补充。',
    ],
    variableZones: ['具体列名', '每行内容细节', '补充说明强度', 'AI综合分析'],
    outputHint: template.description,
    tableColumns: ['结论', '说明', '证据来源'],
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

      const withLocalAnalysis = attachLocalReportAnalysis(nextRecord);
      if (withLocalAnalysis !== nextRecord) {
        nextRecord = withLocalAnalysis;
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

async function saveGroupsAndOutputs(groups: ReportGroup[], outputs: ReportOutputRecord[], templates?: SharedReportTemplate[]) {
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
    templates: Array.isArray(templates) ? templates : undefined,
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

  const templates = mergeSharedTemplates(Array.isArray(state.templates) ? state.templates : []);
  const rawOutputs = Array.isArray(state.outputs) ? state.outputs : [];
  const { outputs, changed } = reconcileOutputRecords(rawOutputs, groups);
  if (changed) {
    await saveGroupsAndOutputs(groups, outputs, templates);
  }

  return { groups, outputs, templates };
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

  const preferredTemplateType = resolveTemplateTypeFromKind(input.kind) || 'table';
  const template =
    (input.templateKey ? state.templates.find((item) => item.key === input.templateKey) : null)
    || state.templates.find((item) => item.type === preferredTemplateType && item.isDefault)
    || state.templates.find((item) => item.type === preferredTemplateType)
    || state.templates[0];
  if (!template) throw new Error('shared report template not found');

  const createdAt = new Date().toISOString();
  const baseRecord: ReportOutputRecord = {
    id: buildId('report'),
    groupKey: group.key,
    groupLabel: group.label,
    templateKey: template.key,
    templateLabel: template.label,
    title: input.title?.trim() || `${group.label}-${template.label}-${createdAt.slice(0, 10)}`,
    outputType:
      template.type === 'table'
        ? '表格'
        : template.type === 'static-page'
          ? '静态页'
          : template.type === 'document'
            ? '文档'
            : 'PPT',
    kind:
      input.kind
      || (template.type === 'table'
        ? 'table'
        : template.type === 'static-page'
          ? 'page'
          : template.type === 'document'
            ? 'pdf'
            : 'ppt'),
    format:
      input.format
      || (template.type === 'table'
        ? 'csv'
        : template.type === 'static-page'
          ? 'html'
          : template.type === 'document'
            ? 'docx'
            : 'ppt'),
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

  const record = await attachReportAnalysis(baseRecord);

  const nextOutputs = [record, ...state.outputs].slice(0, 100);
  await saveGroupsAndOutputs(state.groups, nextOutputs, state.templates);
  return record;
}

export async function deleteReportOutput(outputId: string) {
  const state = await loadReportCenterState();
  const nextOutputs = state.outputs.filter((item) => item.id !== outputId);
  if (nextOutputs.length === state.outputs.length) {
    throw new Error('report output not found');
  }
  await saveGroupsAndOutputs(state.groups, nextOutputs, state.templates);
}

export async function updateReportGroupTemplate(groupKey: string, templateKey: string) {
  const state = await loadReportCenterState();
  const group = state.groups.find((item) => item.key === groupKey);
  if (!group) throw new Error('report group not found');

  const template = group.templates.find((item) => item.key === templateKey);
  if (!template) throw new Error('report template not found');

  group.defaultTemplateKey = template.key;
  await saveGroupsAndOutputs(state.groups, state.outputs, state.templates);
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
  await saveGroupsAndOutputs(state.groups, state.outputs, state.templates);
  return image;
}

export function findReportGroupForPrompt(groups: ReportGroup[], prompt: string) {
  const text = prompt.toLowerCase();
  return groups.find((group) => group.triggerKeywords.some((keyword) => text.includes(String(keyword).toLowerCase())));
}

export async function createSharedReportTemplate(input: {
  label: string;
  type: ReportTemplateType;
  description?: string;
  isDefault?: boolean;
}) {
  const state = await loadReportCenterState();
  const label = String(input.label || '').trim();
  const type = input.type;
  if (!label) throw new Error('template label is required');
  if (!['table', 'static-page', 'ppt', 'document'].includes(type)) {
    throw new Error('template type is invalid');
  }

  const template: SharedReportTemplate = {
    key: buildId('template'),
    label,
    type,
    description: String(input.description || '').trim() || `${label} 模板`,
    supported: true,
    isDefault: Boolean(input.isDefault),
    referenceImages: [],
  };

  const nextTemplates = state.templates.map((item) => (
    item.type === type && template.isDefault ? { ...item, isDefault: false } : item
  ));
  nextTemplates.push(template);
  await saveGroupsAndOutputs(state.groups, state.outputs, nextTemplates);
  return template;
}

export async function updateSharedReportTemplate(templateKey: string, patch: {
  label?: string;
  description?: string;
  isDefault?: boolean;
}) {
  const state = await loadReportCenterState();
  const template = state.templates.find((item) => item.key === templateKey);
  if (!template) throw new Error('shared report template not found');

  const nextTemplates = state.templates.map((item) => {
    if (item.key === templateKey) {
      return {
        ...item,
        label: patch.label ? String(patch.label).trim() || item.label : item.label,
        description: patch.description !== undefined ? String(patch.description).trim() || item.description : item.description,
        isDefault: patch.isDefault !== undefined ? Boolean(patch.isDefault) : item.isDefault,
      };
    }
    if (patch.isDefault && item.type === template.type) {
      return { ...item, isDefault: false };
    }
    return item;
  });

  await saveGroupsAndOutputs(state.groups, state.outputs, nextTemplates);
  return nextTemplates.find((item) => item.key === templateKey)!;
}

export async function uploadSharedTemplateReference(templateKey: string, file: MultipartFile) {
  const state = await loadReportCenterState();
  const template = state.templates.find((item) => item.key === templateKey);
  if (!template) throw new Error('shared report template not found');

  await ensureDirs();
  const safeName = sanitizeFileName(file.filename || 'template-reference');
  const id = buildId('tmplref');
  const ext = path.extname(safeName) || '.dat';
  const outputName = `${id}${ext}`;
  const fullPath = path.join(REPORT_REFERENCE_DIR, outputName);
  await pipeline(file.file, createWriteStream(fullPath));

  const uploaded: ReportReferenceImage = {
    id,
    fileName: outputName,
    originalName: safeName,
    uploadedAt: new Date().toISOString(),
    relativePath: path.relative(STORAGE_ROOT, fullPath).replace(/\\/g, '/'),
  };

  const nextTemplates = state.templates.map((item) => (
    item.key === templateKey
      ? { ...item, referenceImages: [uploaded, ...item.referenceImages].slice(0, 16) }
      : item
  ));
  await saveGroupsAndOutputs(state.groups, state.outputs, nextTemplates);
  return uploaded;
}

export async function reviseReportOutput(outputId: string, instruction: string) {
  const state = await loadReportCenterState();
  const record = state.outputs.find((item) => item.id === outputId);
  if (!record) throw new Error('report output not found');

  const normalizedInstruction = String(instruction || '').trim();
  if (!normalizedInstruction) throw new Error('instruction is required');

  const template =
    state.templates.find((item) => item.key === record.templateKey)
    || state.templates.find((item) => item.type === resolveTemplateTypeFromKind(record.kind) && item.isDefault)
    || state.templates.find((item) => item.type === resolveTemplateTypeFromKind(record.kind))
    || state.templates[0];
  if (!template) throw new Error('shared report template not found');

  const envelope = buildSharedTemplateEnvelope(template);
  const currentMaterial = [
    record.content ? `当前正文：${record.content}` : '',
    record.table ? `当前表格：\n${summarizeTableForAnalysis(record.table)}` : '',
    record.page ? `当前页面：\n${summarizePageForAnalysis(record.page)}` : '',
    record.summary ? `当前摘要：${record.summary}` : '',
    Array.isArray(record.libraries) && record.libraries.length
      ? `关联知识库：${record.libraries.map((item) => item.label || item.key).filter(Boolean).join('、')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  let revisedBase: ReportOutputRecord;
  try {
    const cloud = await runOpenClawChat({
      prompt: [
        `请根据当前报表内容和用户调整要求，重写这份${record.outputType}。`,
        `用户要求：${normalizedInstruction}`,
        '',
        currentMaterial,
      ].join('\n'),
      systemPrompt: [
        '你是企业知识分析助手。',
        '请在不脱离当前报表主题和知识库范围的前提下，根据用户要求调整已生成报表。',
        '优先保持既有输出形式不变，只调整结构、重点和表达。',
        `模板标题：${envelope.title}`,
        `固定结构：${envelope.fixedStructure.join('；')}`,
        `可变区域：${envelope.variableZones.join('；')}`,
        `输出提示：${envelope.outputHint}`,
      ].join('\n'),
    });

    const normalized = normalizeReportOutput(
      record.kind === 'page' ? 'page' : record.kind === 'ppt' ? 'ppt' : record.kind === 'pdf' ? 'pdf' : 'table',
      normalizedInstruction,
      cloud.content,
      envelope,
    );

    const nextTable = 'table' in normalized ? normalized.table || null : null;
    const nextPage = 'page' in normalized ? normalized.page || null : null;
    const nextFormat = 'format' in normalized ? normalized.format || record.format : record.format;

    revisedBase = {
      ...record,
      summary: `${record.templateLabel} 已根据自然语言要求更新。`,
      content: normalized.content,
      table: nextTable,
      page: nextPage,
      format: nextFormat,
      kind: record.kind,
    };
  } catch {
    revisedBase = {
      ...record,
      summary: `${record.templateLabel} 已记录新的调整要求：${normalizedInstruction}`,
      content: record.content || normalizedInstruction,
    };
  }

  const revisedRecord = await attachReportAnalysis(revisedBase);

  const nextOutputs = state.outputs.map((item) => (item.id === outputId ? revisedRecord : item));
  await saveGroupsAndOutputs(state.groups, nextOutputs, state.templates);
  return revisedRecord;
}
