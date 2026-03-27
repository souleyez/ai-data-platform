import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadDocumentCategoryConfig } from './document-config.js';
import { enqueueDetailedParse, runDetailedParseBatch } from './document-deep-parse-queue.js';
import { createDocumentLibrary, loadDocumentLibraries, type DocumentLibrary } from './document-libraries.js';
import { saveDocumentOverride } from './document-overrides.js';
import { parseDocument } from './document-parser.js';
import { REPO_ROOT, STORAGE_FILES_DIR } from './paths.js';
import { createReportOutput, loadReportCenterState } from './report-center.js';
import { loadParsedDocuments, upsertDocumentsInCache } from './document-store.js';

type SampleDocDefinition = {
  sourceFileName: string;
  storedFileName: string;
  groupLabel: string;
  legacyFileNames?: string[];
};

type SampleOutputDefinition = {
  title: string;
  groupLabel: string;
  kind: 'table' | 'page';
  content: string;
  table?: {
    title?: string;
    columns?: string[];
    rows?: Array<Array<string | number | null>>;
  } | null;
  page?: {
    summary?: string;
    cards?: Array<{ label?: string; value?: string; note?: string }>;
    sections?: Array<{ title?: string; body?: string; bullets?: string[] }>;
    charts?: Array<{ title?: string; items?: Array<{ label?: string; value?: number }> }>;
  } | null;
};

const LABEL_ORDER = '\u8ba2\u5355\u5206\u6790';
const LABEL_RESUME = '\u7b80\u5386';
const LABEL_BIDS = 'bids';
const LABEL_IOT = 'IOT\u89e3\u51b3\u65b9\u6848';

const DEFAULT_SAMPLE_SOURCE_DIR = path.join(REPO_ROOT, 'default-samples', 'assets');
const DEFAULT_SAMPLE_UPLOAD_DIR = path.join(STORAGE_FILES_DIR, 'uploads');

const DEFAULT_SAMPLE_DOCUMENTS: SampleDocDefinition[] = [
  {
    sourceFileName: 'order-electronics-q1-2026.csv',
    storedFileName: 'default-sample-order-electronics-q1-2026.csv',
    groupLabel: LABEL_ORDER,
    legacyFileNames: ['sample-order-electronics-q1-2026.csv'],
  },
  {
    sourceFileName: 'order-ops-notes-q1-2026.md',
    storedFileName: 'default-sample-order-ops-notes-q1-2026.md',
    groupLabel: LABEL_ORDER,
    legacyFileNames: ['sample-order-ops-notes-q1-2026.md'],
  },
  {
    sourceFileName: 'resume-senior-ops-manager.md',
    storedFileName: 'default-sample-resume-senior-ops-manager.md',
    groupLabel: LABEL_RESUME,
    legacyFileNames: ['sample-resume-senior-ops-manager.md'],
  },
  {
    sourceFileName: 'iot-smart-warehouse-solution.md',
    storedFileName: 'default-sample-iot-smart-warehouse-solution.md',
    groupLabel: LABEL_IOT,
    legacyFileNames: ['sample-iot-smart-warehouse-solution.md'],
  },
  {
    sourceFileName: 'iot-reference-architecture.md',
    storedFileName: 'default-sample-iot-reference-architecture.md',
    groupLabel: LABEL_IOT,
    legacyFileNames: ['sample-iot-reference-architecture.pdf', 'sample-iot-reference-architecture.md'],
  },
  {
    sourceFileName: 'tender-guangzhou-sample.md',
    storedFileName: 'default-sample-tender-guangzhou.md',
    groupLabel: LABEL_BIDS,
    legacyFileNames: ['sample-tender-guangzhou.pdf', 'tender-3-guangzhou.pdf'],
  },
  {
    sourceFileName: 'tender-template-hospital.md',
    storedFileName: 'default-sample-tender-template-hospital.md',
    groupLabel: LABEL_BIDS,
    legacyFileNames: ['sample-tender-template-hospital.pdf', 'tender-template-hospital.pdf', 'tender-1-guangxi-hospital.pdf'],
  },
];

const DEFAULT_SAMPLE_OUTPUTS: SampleOutputDefinition[] = [
  {
    title: '[\u7cfb\u7edf\u6837\u4f8b] \u8ba2\u5355\u7ecf\u8425\u9759\u6001\u9875',
    groupLabel: LABEL_ORDER,
    kind: 'page',
    content: '\u6309\u591a\u5e73\u53f0\u3001\u591a\u54c1\u7c7b\u7ecf\u8425\u89c6\u89d2\u6574\u7406\u7684\u8ba2\u5355\u7ecf\u8425\u9759\u6001\u9875\u7cfb\u7edf\u6837\u4f8b\u3002',
    page: {
      summary:
        '2026\u5e74 Q1 \u7535\u5b50\u4ea7\u54c1\u8ba2\u5355\u7ecf\u8425\u6574\u4f53\u4fdd\u6301\u589e\u957f\uff0c\u6296\u97f3\u627f\u62c5\u65b0\u54c1\u653e\u91cf\uff0c\u5929\u732b\u627f\u62c5\u9ad8\u5ba2\u5355\u6210\u4ea4\uff0c\u62fc\u591a\u591a\u9762\u4e34\u5e93\u5b58\u4e0e\u6bdb\u5229\u538b\u529b\u3002',
      cards: [
        { label: '\u540c\u6bd4', value: '+24%', note: '\u5168\u5e73\u53f0 GMV' },
        { label: '\u73af\u6bd4', value: '+8%', note: '\u8f83\u4e0a\u6708' },
        { label: '\u5e93\u5b58\u6307\u6570', value: '0.68', note: '\u6574\u4f53\u5065\u5eb7' },
        { label: '\u9884\u6d4b\u9500\u91cf', value: '8,050', note: '\u4e0b\u6708\u6838\u5fc3 SKU' },
      ],
      sections: [
        {
          title: '\u7ecf\u8425\u6458\u8981',
          body: '\u589e\u957f\u4e3b\u8981\u6765\u81ea\u8033\u673a\u548c\u667a\u80fd\u7a7f\u6234\uff0c\u6296\u97f3\u6e20\u9053\u589e\u901f\u6700\u5feb\u3002',
          bullets: ['\u5929\u732b\u627f\u63a5\u9ad8\u5ba2\u5355\u6210\u4ea4', '\u62fc\u591a\u591a\u5e94\u63a7\u5236\u4f4e\u4ef7\u4fc3\u9500\u8282\u594f'],
        },
        {
          title: '\u5e73\u53f0\u5bf9\u6bd4',
          body: '\u6296\u97f3\u589e\u957f\u5feb\uff0c\u5929\u732b\u5229\u6da6\u7a33\uff0c\u4eac\u4e1c\u5c65\u7ea6\u7a33\u5b9a\u3002',
          bullets: ['\u6296\u97f3\uff1a\u5185\u5bb9\u6295\u653e\u9a71\u52a8', '\u5929\u732b\uff1a\u54c1\u724c\u6210\u4ea4\u7a33\u5b9a', '\u4eac\u4e1c\uff1a\u4f01\u4e1a\u91c7\u8d2d\u8d21\u732e'],
        },
        {
          title: '\u54c1\u7c7b\u5bf9\u6bd4',
          body: '\u8033\u673a\u4e0e\u667a\u80fd\u7a7f\u6234\u589e\u957f\u6700\u5feb\uff0c\u667a\u80fd\u5bb6\u5c45\u5e93\u5b58\u504f\u9ad8\u3002',
          bullets: ['\u8033\u673a\uff1a\u5f02\u5e38\u5cf0\u503c\u9700\u89e3\u91ca', '\u667a\u80fd\u5bb6\u5c45\uff1a\u5efa\u8bae\u51cf\u901f\u8865\u8d27'],
        },
        {
          title: '\u5e93\u5b58\u4e0e\u5907\u8d27\u5efa\u8bae',
          body: '\u4f18\u5148\u8865\u9ad8\u8f6c\u5316\u7206\u6b3e\uff0c\u538b\u7f29\u9ad8\u5e93\u5b58 SKU\u3002',
          bullets: ['\u8033\u673a Pro \u8865\u8d27 620 \u4ef6', '\u63d2\u5ea7\u53cc\u53e3\u7248\u6682\u505c\u8865\u8d27'],
        },
        {
          title: '\u5f02\u5e38\u6ce2\u52a8\u8bf4\u660e',
          body: '\u76f4\u64ad\u8282\u70b9\u9020\u6210\u90e8\u5206 SKU \u77ed\u671f\u5f02\u5e38\u5cf0\u503c\u3002',
          bullets: ['\u6296\u97f3\u76f4\u64ad\u5cf0\u503c\u9700\u5355\u72ec\u6807\u8bb0', '\u907f\u514d\u5c06\u6d3b\u52a8\u5cf0\u503c\u8bef\u5224\u4e3a\u5e38\u6001\u9700\u6c42'],
        },
      ],
      charts: [
        {
          title: '\u5e73\u53f0 GMV \u5bf9\u6bd4',
          items: [
            { label: 'Tmall', value: 34 },
            { label: 'JD', value: 21 },
            { label: 'Douyin', value: 29 },
            { label: 'Pinduoduo', value: 16 },
          ],
        },
      ],
    },
  },
  {
    title: '[\u7cfb\u7edf\u6837\u4f8b] \u7b80\u5386\u5bf9\u6bd4\u8868\u683c',
    groupLabel: LABEL_RESUME,
    kind: 'table',
    content: '\u6700\u8fd1\u4e00\u4e2a\u6708\u7b80\u5386\u5e93\u5019\u9009\u4eba\u7684\u6a2a\u5411\u5bf9\u6bd4\u7cfb\u7edf\u6837\u4f8b\u3002',
    table: {
      title: '\u7b80\u5386\u6a2a\u5411\u5bf9\u6bd4',
      columns: ['\u5019\u9009\u4eba', '\u7b2c\u4e00\u5b66\u5386', '\u6700\u8fd1\u5c31\u804c\u516c\u53f8', '\u6838\u5fc3\u80fd\u529b', '\u5e74\u9f84', '\u5de5\u4f5c\u5e74\u9650', '\u5339\u914d\u5224\u65ad', '\u8bc1\u636e\u6765\u6e90'],
      rows: [
        [
          '\u90d1\u5b87\u5b81',
          '\u672c\u79d1',
          '\u5e7f\u5dde\u4e2d\u79d1\u5de5\u4e1a\u6280\u672f\u7814\u7a76\u9662 / \u6280\u672f\u5408\u4f5c\u65b9\u5411\u7ecf\u7406',
          'AI+\u786c\u4ef6+\u8f6f\u4ef6+\u4e1a\u52a1\u7efc\u5408\u80fd\u529b',
          '36',
          '15\u5e74',
          '\u9002\u5408\u7efc\u5408\u578b\u6280\u672f\u7ba1\u7406\u5c97\u4f4d',
          '\u6837\u4f8b\u7b80\u5386\u5e93',
        ],
        [
          '\u674e\u660e\u8f69',
          '\u672c\u79d1',
          '\u6df1\u5733\u661f\u62d3\u667a\u80fd\u79d1\u6280\u6709\u9650\u516c\u53f8',
          '\u591a\u5e73\u53f0\u7ecf\u8425\u5206\u6790\u3001\u5e93\u5b58\u7ba1\u7406\u3001\u56e2\u961f\u534f\u540c',
          '32',
          '9\u5e74',
          '\u9002\u5408\u7535\u5546\u8fd0\u8425\u8d1f\u8d23\u4eba\u5c97\u4f4d',
          '\u7cfb\u7edf\u6837\u4f8b\u7b80\u5386',
        ],
      ],
    },
  },
  {
    title: '[\u7cfb\u7edf\u6837\u4f8b] \u6807\u4e66\u5e94\u7b54\u8868\u683c',
    groupLabel: LABEL_BIDS,
    kind: 'table',
    content: '\u6807\u4e66\u5e94\u7b54\u5e95\u7a3f\u7cfb\u7edf\u6837\u4f8b\u3002',
    table: {
      title: '\u6807\u4e66\u5e94\u7b54\u5e95\u7a3f',
      columns: ['\u7ae0\u8282', '\u5e94\u7b54\u91cd\u70b9', '\u9700\u8865\u5145\u6750\u6599', '\u98ce\u9669\u63d0\u793a', '\u8bc1\u636e\u6765\u6e90'],
      rows: [
        ['\u9879\u76ee\u6982\u51b5', '\u786e\u8ba4\u91c7\u8d2d\u8303\u56f4\u3001\u4ea4\u4ed8\u8303\u56f4\u548c\u6574\u4f53\u5e94\u7b54\u7b56\u7565', '\u8425\u4e1a\u6267\u7167\u3001\u6cd5\u5b9a\u4ee3\u8868\u4eba\u6388\u6743', '\u8303\u56f4\u7406\u89e3\u504f\u5dee\u4f1a\u5f71\u54cd\u540e\u7eed\u7ae0\u8282\u5e94\u7b54', '\u6837\u4f8b\u6807\u4e66'],
        ['\u8d44\u683c\u6761\u4ef6', '\u9010\u6761\u6838\u5bf9\u8d44\u8d28\u3001\u4e1a\u7ee9\u3001\u4eba\u5458\u8981\u6c42', '\u8d44\u8d28\u8bc1\u4e66\u3001\u4e1a\u7ee9\u5408\u540c\u3001\u4eba\u5458\u793e\u4fdd', '\u8d44\u683c\u9879\u6f0f\u8865\u4f1a\u76f4\u63a5\u5e9f\u6807', '\u6837\u4f8b\u6807\u4e66'],
        ['\u6280\u672f\u5e94\u7b54', '\u6309\u8bbe\u5907\u6e05\u5355\u9010\u9879\u5bf9\u5e94\u53c2\u6570\u548c\u504f\u79bb\u8bf4\u660e', '\u8bbe\u5907\u53c2\u6570\u8868\u3001\u5f69\u9875\u3001\u68c0\u6d4b\u62a5\u544a', '\u5173\u952e\u53c2\u6570\u504f\u79bb\u9700\u63d0\u524d\u6807\u7ea2', '\u6837\u4f8b\u6807\u4e66\u6a21\u677f'],
        ['\u5546\u52a1\u6761\u6b3e', '\u4ea4\u8d27\u671f\u3001\u4ed8\u6b3e\u3001\u8d28\u4fdd\u3001\u552e\u540e\u54cd\u5e94', '\u8d28\u4fdd\u627f\u8bfa\u3001\u4ea4\u4ed8\u8ba1\u5212\u3001\u670d\u52a1\u627f\u8bfa\u51fd', '\u5546\u52a1\u6761\u6b3e\u627f\u8bfa\u8fc7\u5ea6\u6709\u5c65\u7ea6\u98ce\u9669', '\u6837\u4f8b\u6807\u4e66\u6a21\u677f'],
      ],
    },
  },
  {
    title: '[\u7cfb\u7edf\u6837\u4f8b] IOT\u89e3\u51b3\u65b9\u6848\u9759\u6001\u9875',
    groupLabel: LABEL_IOT,
    kind: 'page',
    content: '\u667a\u6167\u4ed3\u50a8 IOT \u89e3\u51b3\u65b9\u6848\u7cfb\u7edf\u6837\u4f8b\u9875\u3002',
    page: {
      summary:
        '\u8be5\u65b9\u6848\u9762\u5411\u667a\u6167\u4ed3\u50a8\uff0c\u91c7\u7528\u8bbe\u5907\u5c42\u3001\u8fb9\u7f18\u5c42\u3001\u5e73\u53f0\u5c42\u3001\u5e94\u7528\u5c42\u56db\u5c42\u67b6\u6784\uff0c\u5f3a\u8c03\u8bbe\u5907\u63a5\u5165\u3001\u544a\u8b66\u8054\u52a8\u548c\u8fd0\u8425\u53ef\u89c6\u5316\u3002',
      cards: [
        { label: '\u90e8\u7f72\u6a21\u5f0f', value: '\u8fb9\u7f18 + \u4e91', note: '\u53cc\u5c42\u90e8\u7f72' },
        { label: '\u6838\u5fc3\u534f\u8bae', value: 'MQTT / Modbus / REST', note: '\u517c\u5bb9\u591a\u8bbe\u5907' },
        { label: '\u76ee\u6807\u573a\u666f', value: '\u667a\u6167\u4ed3\u50a8', note: '\u591a\u4ed3\u534f\u540c' },
      ],
      sections: [
        {
          title: '\u65b9\u6848\u6982\u89c8',
          body: '\u9762\u5411\u533a\u57df\u4ed3\u914d\u4e2d\u5fc3\u7684\u667a\u6167\u4ed3\u50a8 IOT \u65b9\u6848\u3002',
          bullets: ['\u8bbe\u5907\u63a5\u5165\u7edf\u4e00', '\u544a\u8b66\u8054\u52a8\u95ed\u73af', '\u5e93\u5b58\u611f\u77e5\u53ef\u89c6\u5316'],
        },
        {
          title: '\u7cfb\u7edf\u67b6\u6784',
          body: '\u8bbe\u5907\u5c42\u3001\u8fb9\u7f18\u5c42\u3001\u5e73\u53f0\u5c42\u3001\u5e94\u7528\u5c42\u56db\u5c42\u7ed3\u6784\u3002',
          bullets: ['\u8fb9\u7f18\u7f51\u5173\u627f\u62c5\u534f\u8bae\u63a5\u5165', '\u5e73\u53f0\u5c42\u627f\u62c5\u89c4\u5219\u4e0e\u6570\u636e\u7ba1\u7406'],
        },
        {
          title: '\u63a5\u53e3\u4e0e\u96c6\u6210',
          body: '\u652f\u6301 REST\u3001MQTT\u3001Webhook \u7b49\u96c6\u6210\u65b9\u5f0f\u3002',
          bullets: ['\u5bf9\u63a5 ERP/WMS', '\u63a5\u5165\u4f01\u4e1a\u5fae\u4fe1\u544a\u8b66'],
        },
        {
          title: '\u5173\u952e\u6536\u76ca',
          body: '\u63d0\u5347\u76d8\u70b9\u51c6\u786e\u7387\u4e0e\u8bbe\u5907\u5728\u7ebf\u7387\uff0c\u964d\u4f4e\u5de1\u68c0\u6210\u672c\u3002',
          bullets: ['\u5728\u7ebf\u7387 >= 98%', '\u5de1\u68c0\u6210\u672c\u4e0b\u964d 30%'],
        },
      ],
      charts: [
        {
          title: '\u6838\u5fc3\u4ef7\u503c\u5206\u5e03',
          items: [
            { label: '\u5e93\u5b58\u53ef\u89c6\u5316', value: 32 },
            { label: '\u544a\u8b66\u54cd\u5e94', value: 27 },
            { label: '\u8bbe\u5907\u63a5\u5165', value: 21 },
            { label: '\u8fd0\u7ef4\u6548\u7387', value: 20 },
          ],
        },
      ],
    },
  },
];

let ensurePromise: Promise<void> | null = null;

async function ensureLibrary(label: string, description = ''): Promise<DocumentLibrary> {
  const libraries = await loadDocumentLibraries();
  const existing = libraries.find((item) => item.label === label || item.key === label);
  if (existing) return existing;
  await createDocumentLibrary({ name: label, description });
  const nextLibraries = await loadDocumentLibraries();
  const created = nextLibraries.find((item) => item.label === label || item.key === label);
  if (!created) throw new Error(`failed to create library: ${label}`);
  return created;
}

async function ensureSampleFile(definition: SampleDocDefinition, existingPath?: string) {
  if (existingPath) return existingPath;
  await fs.mkdir(DEFAULT_SAMPLE_UPLOAD_DIR, { recursive: true });
  const targetPath = path.join(DEFAULT_SAMPLE_UPLOAD_DIR, definition.storedFileName);
  try {
    await fs.access(targetPath);
    return targetPath;
  } catch {
    const sourcePath = path.join(DEFAULT_SAMPLE_SOURCE_DIR, definition.sourceFileName);
    await fs.copyFile(sourcePath, targetPath);
    return targetPath;
  }
}

async function ensureSampleDocuments(libraryMap: Record<string, DocumentLibrary>) {
  const config = await loadDocumentCategoryConfig(STORAGE_FILES_DIR);
  const existingDocuments = await loadParsedDocuments(400, false, config.scanRoots);
  const parsedItems = [];
  const queuedPaths: string[] = [];

  for (const definition of DEFAULT_SAMPLE_DOCUMENTS) {
    const knownNames = new Set([definition.storedFileName, ...(definition.legacyFileNames || [])]);
    const existing = (existingDocuments.items || []).find((item) =>
      [...knownNames].some((name) => String(item.name || '').endsWith(name)),
    );
    const targetPath = await ensureSampleFile(definition, existing?.path);
    const parsed = await parseDocument(targetPath, config, { stage: 'quick' });
    parsedItems.push(parsed);
    await saveDocumentOverride(targetPath, { groups: [libraryMap[definition.groupLabel].key] });
    queuedPaths.push(targetPath);
  }

  await upsertDocumentsInCache(parsedItems, config.scanRoots);
  await enqueueDetailedParse(queuedPaths);
  await runDetailedParseBatch(4, config.scanRoots);
  await runDetailedParseBatch(4, config.scanRoots);
}

async function ensureSampleOutputs(libraryMap: Record<string, DocumentLibrary>) {
  const state = await loadReportCenterState();
  const existingTitles = new Set((state.outputs || []).map((item) => item.title));

  for (const output of DEFAULT_SAMPLE_OUTPUTS) {
    if (existingTitles.has(output.title)) continue;
    const library = libraryMap[output.groupLabel];
    await createReportOutput({
      groupKey: library.key,
      title: output.title,
      triggerSource: 'chat',
      kind: output.kind,
      format: output.kind === 'table' ? 'csv' : 'html',
      content: output.content,
      table: output.table || null,
      page: output.page || null,
      libraries: [{ key: library.key, label: library.label }],
    });
  }
}

async function runEnsureDefaultProjectSamples() {
  const libraryMap = {
    [LABEL_ORDER]: await ensureLibrary(LABEL_ORDER),
    [LABEL_RESUME]: await ensureLibrary(LABEL_RESUME),
    [LABEL_BIDS]: await ensureLibrary(LABEL_BIDS, 'Public bid and tender documents'),
    [LABEL_IOT]: await ensureLibrary(LABEL_IOT, '\u7cfb\u7edf\u9ed8\u8ba4 IOT \u89e3\u51b3\u65b9\u6848\u6837\u4f8b'),
  };

  await ensureSampleDocuments(libraryMap);
  await ensureSampleOutputs(libraryMap);
  await loadParsedDocuments(200, false);
}

export async function ensureDefaultProjectSamples() {
  if (ensurePromise) return ensurePromise;
  ensurePromise = runEnsureDefaultProjectSamples().finally(() => {
    ensurePromise = null;
  });
  return ensurePromise;
}
