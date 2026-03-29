import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadDocumentCategoryConfig } from './document-config.js';
import { enqueueDetailedParse, runDetailedParseBatch } from './document-deep-parse-queue.js';
import { createDocumentLibrary, loadDocumentLibraries, type DocumentLibrary } from './document-libraries.js';
import { saveDocumentOverride } from './document-overrides.js';
import { parseDocument } from './document-parser.js';
import { REPO_ROOT, STORAGE_FILES_DIR } from './paths.js';
import { createReportOutput, deleteReportOutput, loadReportCenterState } from './report-center.js';
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
    content: '\u6309\u591a\u6e20\u9053\u3001\u591aSKU\u7ecf\u8425\u9a7e\u9a76\u8231\u89c6\u89d2\u6574\u7406\u7684\u9ad8\u7ea7\u8ba2\u5355\u9759\u6001\u9875\u7cfb\u7edf\u6837\u4f8b\u3002',
    page: {
      summary:
        '2026\u5e74 Q1 \u7535\u5b50\u4ea7\u54c1\u7ecf\u8425\u6574\u4f53\u4fdd\u6301\u589e\u957f\uff0c\u5929\u732b\u7a33\u4f4f\u9ad8\u5ba2\u5355\u4e0e\u5229\u6da6\uff0c\u6296\u97f3\u627f\u62c5\u65b0\u54c1\u653e\u91cf\uff0c\u4eac\u4e1c\u627f\u63a5\u4f01\u4e1a\u91c7\u8d2d\uff0c\u62fc\u591a\u591a\u6210\u4e3a\u5e93\u5b58\u4e0e\u4ef7\u683c\u538b\u529b\u96c6\u4e2d\u533a\u3002\u9875\u9762\u4ee5\u591a\u6e20\u9053\u3001\u591aSKU\u7ecf\u8425\u9a7e\u9a76\u8231\u65b9\u5f0f\u5c55\u793a\u589e\u957f\u7ed3\u6784\u3001\u5e93\u5b58\u5065\u5eb7\u4e0e\u8865\u8d27\u4f18\u5148\u7ea7\u3002',
      cards: [
        { label: '\u6e20\u9053GMV', value: '\u00a512.8M', note: '\u5929\u732b+\u6296\u97f3\u8d21\u732e 63%' },
        { label: '\u52a8\u9500SKU', value: '148', note: '\u6838\u5fc3 22 \u4e2a SKU \u8d21\u732e 72%' },
        { label: '\u9ad8\u98ce\u9669SKU', value: '11', note: '\u7f3a\u8d27\u4e0e\u6ede\u9500\u53cc\u9ad8\u538b' },
        { label: '\u5e93\u5b58\u5065\u5eb7', value: '0.74', note: '\u4e3b\u4ed3\u5b89\u5168\uff0c\u5206\u4ed3\u5931\u8861' },
        { label: '\u8865\u8d27\u4f18\u5148\u7ea7', value: '6', note: '72 \u5c0f\u65f6\u5185\u9700\u5904\u7406' },
      ],
      sections: [
        {
          title: '\u7ecf\u8425\u603b\u89c8',
          body: '\u589e\u957f\u6765\u81ea\u8033\u673a\u3001\u667a\u80fd\u7a7f\u6234\u548c\u5185\u5bb9\u7535\u5546\u653e\u91cf\uff0c\u7ed3\u6784\u4e0a\u5df2\u7ecf\u4ece\u201c\u5e73\u53f0\u5e73\u5747\u589e\u957f\u201d\u8f6c\u6210\u201c\u5934\u90e8\u6e20\u9053+\u5934\u90e8SKU\u9a71\u52a8\u589e\u957f\u201d\u3002\u5982\u679c\u7ee7\u7eed\u6cbf\u7528\u5747\u5300\u8865\u8d27\u7b56\u7565\uff0c\u4f1a\u653e\u5927\u62fc\u591a\u591a\u4f4e\u4ef7\u5e93\u5b58\u548c\u6296\u97f3\u77ed\u5468\u671f\u7f3a\u8d27\u3002',
          bullets: ['\u5929\u732b\u7a33\u5b9a\u5229\u6da6\u6c60\uff0c\u627f\u63a5\u9ad8\u5ba2\u5355\u6210\u4ea4', '\u6296\u97f3\u662f\u65b0\u54c1\u8d77\u91cf\u4e3b\u5f15\u64ce\uff0c\u4f46\u5cf0\u503c\u6ce2\u52a8\u5927', '\u62fc\u591a\u591a\u9700\u8981\u4ece\u51b2\u91cf\u903b\u8f91\u5207\u5230\u5e93\u5b58\u4e0e\u4ef7\u683c\u5e26\u7ba1\u63a7'],
        },
        {
          title: '\u6e20\u9053\u7ed3\u6784',
          body: '\u56db\u5927\u6e20\u9053\u89d2\u8272\u5df2\u7ecf\u5206\u5316\u3002\u5929\u732b\u662f\u5229\u6da6\u4e0e\u54c1\u724c\u9635\u5730\uff0c\u6296\u97f3\u627f\u62c5\u4e0a\u65b0\u548c\u66dd\u5149\u8f6c\u5316\uff0c\u4eac\u4e1c\u8d21\u732e\u4f01\u4e1a\u91c7\u8d2d\uff0c\u62fc\u591a\u591a\u4e3b\u8981\u627f\u62c5\u5c3e\u8d27\u4e0e\u4ef7\u683c\u654f\u611f\u7528\u6237\u3002',
          bullets: ['\u5929\u732b GMV \u5360\u6bd4 34%\uff0c\u6bdb\u5229\u8868\u73b0\u6700\u4f73', '\u6296\u97f3 GMV \u5360\u6bd4 29%\uff0c\u4f46\u5e93\u5b58\u6ce2\u52a8\u6700\u660e\u663e', '\u4eac\u4e1c GMV \u5360\u6bd4 21%\uff0c\u8ba2\u5355\u7a33\u5b9a\u3001\u5c65\u7ea6\u53ef\u63a7'],
        },
        {
          title: 'SKU\u4e0e\u54c1\u7c7b\u7126\u70b9',
          body: '\u8033\u673a\u4e0e\u667a\u80fd\u7a7f\u6234\u4ecd\u662f\u4e3b\u589e\u91cf\u54c1\u7c7b\uff0c\u4f46\u589e\u957f\u9ad8\u5ea6\u96c6\u4e2d\u5728\u5c11\u6570\u82f1\u96c4SKU\uff0c\u667a\u80fd\u5bb6\u5c45\u51fa\u73b0\u201c\u9500\u91cf\u672a\u8d77\u3001\u5e93\u5b58\u5148\u9ad8\u201d\u7684\u7ed3\u6784\u6027\u538b\u529b\u3002',
          bullets: ['\u8033\u673a Pro\u3001\u8fd0\u52a8\u8033\u673a Lite \u8d21\u732e\u4e3b\u8981\u589e\u91cf', '\u667a\u80fd\u63d2\u5ea7\u53cc\u53e3\u7248\u548c\u97f3\u7bb1 Mini \u5e93\u5b58\u504f\u9ad8', '\u513f\u7ae5\u624b\u8868 Lite \u9700\u8981\u91cd\u65b0\u8bc4\u4f30\u6e20\u9053\u6295\u653e\u8282\u594f'],
        },
        {
          title: '\u5e93\u5b58\u4e0e\u8865\u8d27',
          body: '\u5f53\u524d\u4e0d\u662f\u201c\u603b\u5e93\u5b58\u4e0d\u8db3\u201d\uff0c\u800c\u662f\u201c\u4e3b\u9500SKU\u7f3a\u8d27\u3001\u5c3e\u90e8SKU\u5360\u4ed3\u201d\u3002\u8865\u8d27\u7b56\u7565\u5e94\u4ece\u7edf\u4e00\u5468\u671f\uff0c\u5207\u6210\u7206\u6b3e\u5feb\u53cd\u3001\u957f\u5c3e\u538b\u7f29\u548c\u8de8\u4ed3\u8c03\u62e8\u4e09\u5957\u52a8\u4f5c\u3002',
          bullets: ['\u8033\u673a Pro 72 \u5c0f\u65f6\u5185\u8865\u8d27 620 \u4ef6', '\u8fd0\u52a8\u8033\u673a Lite \u4ece\u534e\u5357\u4ed3\u8c03\u62e8 180 \u4ef6\u81f3\u534e\u4e1c\u4ed3', '\u667a\u80fd\u63d2\u5ea7\u53cc\u53e3\u7248\u6682\u505c\u8865\u8d27\u5e76\u6d88\u5316 3 \u5468\u5e93\u5b58'],
        },
        {
          title: '\u5f02\u5e38\u6ce2\u52a8\u89e3\u91ca',
          body: '\u6296\u97f3\u76f4\u64ad\u8282\u70b9\u548c\u5929\u732b\u5927\u4fc3\u9884\u70ed\u5171\u540c\u9020\u6210\u8033\u673a\u7c7b SKU \u77ed\u671f\u5c16\u5cf0\uff0c\u4e0d\u80fd\u76f4\u63a5\u6309\u5cf0\u503c\u5916\u63a8\u4e0b\u6708\u9700\u6c42\u3002\u62fc\u591a\u591a\u8ba2\u5355\u56de\u5347\u5219\u66f4\u591a\u6765\u81ea\u4f4e\u4ef7\u4fc3\u9500\uff0c\u800c\u975e\u771f\u5b9e\u7ed3\u6784\u6539\u5584\u3002',
          bullets: ['\u76f4\u64ad\u5cf0\u503c\u5e94\u5355\u72ec\u6807\u8bb0\uff0c\u4e0d\u5e76\u5165\u5e38\u6001\u9884\u6d4b', '\u62fc\u591a\u591a\u56de\u5347\u4f34\u968f\u6bdb\u5229\u4e0b\u6ed1\uff0c\u9700\u8981\u548c\u9500\u552e\u989d\u5206\u5f00\u770b', '\u5e93\u5b58\u5065\u5eb7\u6307\u6570\u56de\u843d\u4e3b\u8981\u6765\u81ea\u667a\u80fd\u5bb6\u5c45\u5c3e\u90e8\u5e93\u5b58'],
        },
        {
          title: '\u884c\u52a8\u5efa\u8bae',
          body: '\u7ecf\u8425\u52a8\u4f5c\u5e94\u4f18\u5148\u56f4\u7ed5\u201c\u4fdd\u5934\u90e8SKU\u4e0d\u65ad\u8d27\u3001\u538b\u5c3e\u90e8SKU\u5e93\u5b58\u3001\u628a\u6e20\u9053\u89d2\u8272\u62c9\u5f00\u201d\u4e09\u4ef6\u4e8b\uff0c\u800c\u4e0d\u662f\u7ee7\u7eed\u505a\u5e73\u53f0\u5e73\u5747\u5316\u7ba1\u7406\u3002',
          bullets: ['\u8865\u8d27\u8d44\u6e90\u4f18\u5148\u6295\u5411\u8033\u673a Pro\u3001\u8fd0\u52a8\u8033\u673a Lite\u3001\u65d7\u8230\u624b\u8868', '\u62fc\u591a\u591a\u7f29\u51cf\u4f4e\u4ef7\u4fc3\u9500\u9891\u6b21\u5e76\u6e05\u7406\u957f\u5c3e\u5e93\u5b58', '\u4e0b\u4e2a\u5468\u671f\u628a\u6e20\u9053\u590d\u76d8\u62c6\u6210\u5229\u6da6\u3001\u653e\u91cf\u3001\u6e05\u5e93\u5b58\u4e09\u6761\u7ebf\u5206\u522b\u7ba1\u7406'],
        },
      ],
      charts: [
        {
          title: '\u6e20\u9053\u8d21\u732e\u7ed3\u6784',
          items: [
            { label: 'Tmall', value: 34 },
            { label: 'JD', value: 21 },
            { label: 'Douyin', value: 29 },
            { label: 'Pinduoduo', value: 16 },
          ],
        },
        {
          title: 'SKU\u52a8\u9500/\u5e93\u5b58\u98ce\u9669\u77e9\u9635',
          items: [
            { label: '\u8033\u673a Pro', value: 92 },
            { label: '\u8fd0\u52a8\u8033\u673a Lite', value: 84 },
            { label: '\u667a\u80fd\u63d2\u5ea7\u53cc\u53e3\u7248', value: 78 },
            { label: '\u97f3\u7bb1 Mini', value: 74 },
          ],
        },
        {
          title: '\u6708\u5ea6GMV\u4e0e\u5e93\u5b58\u6307\u6570\u8054\u52a8',
          items: [
            { label: '2026-01', value: 76 },
            { label: '2026-02', value: 83 },
            { label: '2026-03', value: 91 },
            { label: '\u5e93\u5b58\u6307\u6570', value: 74 },
          ],
        },
        {
          title: '\u8865\u8d27\u4f18\u5148\u7ea7\u961f\u5217',
          items: [
            { label: '\u8033\u673a Pro', value: 96 },
            { label: '\u8fd0\u52a8\u8033\u673a Lite', value: 88 },
            { label: '\u65d7\u8230\u624b\u8868', value: 73 },
            { label: '\u667a\u80fd\u63d2\u5ea7\u53cc\u53e3\u7248', value: 61 },
          ],
        },
      ],
    },
  },
  {
    title: '[\u7cfb\u7edf\u6837\u4f8b] \u5e93\u5b58\u4e0e\u8865\u8d27\u9a7e\u9a76\u8231',
    groupLabel: LABEL_ORDER,
    kind: 'page',
    content: '\u6309\u9ad8\u98ce\u9669SKU\u3001\u5e93\u5b58\u5065\u5eb7\u548c\u8865\u8d27\u52a8\u4f5c\u7ec4\u7ec7\u7684\u9ad8\u7ea7\u5e93\u5b58\u9759\u6001\u9875\u7cfb\u7edf\u6837\u4f8b\u3002',
    page: {
      summary:
        '\u5f53\u524d\u5e93\u5b58\u95ee\u9898\u4e0d\u662f\u5355\u7eaf\u201c\u5e93\u5b58\u9ad8\u201d\u6216\u201c\u5e93\u5b58\u4f4e\u201d\uff0c\u800c\u662f\u5934\u90e8SKU\u7f3a\u8d27\u98ce\u9669\u6b63\u5728\u4e0a\u5347\uff0c\u5c3e\u90e8SKU\u5360\u4ed3\u62d6\u6162\u5468\u8f6c\u3002\u9875\u9762\u4ee5\u4f9b\u5e94\u94fe\u9a7e\u9a76\u8231\u65b9\u5f0f\u5c55\u793a\u98ce\u9669SKU\u3001\u5468\u8f6c\u5065\u5eb7\u548c72\u5c0f\u65f6\u8865\u8d27\u961f\u5217\uff0c\u9002\u5408\u8fd0\u8425\u3001\u91c7\u8d2d\u548c\u9500\u552e\u5171\u7528\u3002',
      cards: [
        { label: '\u5e93\u5b58\u5065\u5eb7', value: '0.71', note: '\u4e3b\u4ed3\u6b63\u5e38\uff0c\u5206\u4ed3\u5931\u8861' },
        { label: '\u7f3a\u8d27\u98ce\u9669SKU', value: '7', note: '\u672a\u6765 14 \u5929\u53ef\u80fd\u65ad\u8d27' },
        { label: '\u6ede\u9500\u5e93\u5b58\u5360\u6bd4', value: '18%', note: '\u4e3b\u8981\u96c6\u4e2d\u5728\u667a\u80fd\u5bb6\u5c45' },
        { label: '\u5efa\u8bae\u8865\u8d27\u91cf', value: '1,460', note: '\u672a\u6765 72 \u5c0f\u65f6\u52a8\u4f5c' },
        { label: '\u8de8\u4ed3\u8c03\u62e8', value: '3', note: '\u5efa\u8bae\u5148\u505a\u5185\u90e8\u8c03\u62e8' },
      ],
      sections: [
        {
          title: '\u7ecf\u8425\u603b\u89c8',
          body: '\u5e93\u5b58\u7ed3\u6784\u5df2\u7ecf\u8fdb\u5165\u201c\u5934\u90e8\u4e0d\u591f\u3001\u5c3e\u90e8\u504f\u591a\u201d\u7684\u5931\u8861\u72b6\u6001\u3002\u5f53\u524d\u6700\u503c\u94b1\u7684\u52a8\u4f5c\u4e0d\u662f\u7ee7\u7eed\u6574\u4f53\u91c7\u8d2d\uff0c\u800c\u662f\u4f18\u5148\u4fdd\u8bc1\u5934\u90e8SKU\u4e0d\u65ad\u8d27\uff0c\u5e76\u628a\u5c3e\u90e8SKU\u4ece\u4e3b\u4ed3\u538b\u529b\u91cc\u91ca\u653e\u51fa\u53bb\u3002',
          bullets: ['\u98ce\u9669\u96c6\u4e2d\u5728\u8033\u673a\u3001\u7a7f\u6234\u4e24\u6761\u9ad8\u52a8\u9500\u7ebf', '\u5c3e\u90e8\u5e93\u5b58\u96c6\u4e2d\u5728\u667a\u80fd\u5bb6\u5c45\u4f4e\u5468\u8f6cSKU', '\u91c7\u8d2d\u8282\u594f\u5e94\u6539\u6210\u6309\u6e20\u9053\u4e0eSKU\u5206\u5c42'],
        },
        {
          title: '\u5e93\u5b58\u5065\u5eb7',
          body: '\u4e3b\u4ed3\u5065\u5eb7\u5ea6\u5c1a\u53ef\uff0c\u4f46\u534e\u4e1c\u4ed3\u548c\u534e\u5357\u4ed3\u7684\u7ed3\u6784\u660e\u663e\u5931\u8861\uff0c\u90e8\u5206\u5934\u90e8SKU\u5df2\u7ecf\u4f4e\u4e8e\u5b89\u5168\u7ebf\uff0c\u800c\u4f4e\u52a8\u9500SKU\u4ecd\u5728\u5360\u7528\u4ed3\u5bb9\u3002',
          bullets: ['\u534e\u4e1c\u4ed3\u8033\u673a Pro \u5b89\u5168\u5e93\u5b58\u4ec5\u5269 8 \u5929', '\u534e\u5357\u4ed3\u8fd0\u52a8\u8033\u673a Lite \u5b89\u5168\u5e93\u5b58\u4ec5\u5269 10 \u5929', '\u667a\u80fd\u63d2\u5ea7\u53cc\u53e3\u7248\u8fde\u7eed 3 \u5468\u9ad8\u4e8e\u9884\u8b66\u7ebf'],
        },
        {
          title: '\u9ad8\u98ce\u9669SKU',
          body: '\u9ad8\u98ce\u9669SKU\u4e3b\u8981\u5206\u4e24\u7c7b\uff1a\u4e00\u7c7b\u662f\u9ad8\u52a8\u9500\u4f46\u7f3a\u8d27\u98ce\u9669\u5feb\u901f\u4e0a\u5347\uff0c\u53e6\u4e00\u7c7b\u662f\u9500\u91cf\u4e0d\u9ad8\u5374\u6301\u7eed\u5360\u4ed3\u3002',
          bullets: ['\u8033\u673a Pro\uff1a\u9500\u91cf\u9ad8\u3001\u7f3a\u8d27\u98ce\u9669\u9ad8', '\u65d7\u8230\u624b\u8868\uff1a\u4fc3\u9500\u540e\u9700\u6c42\u62ac\u5347\uff0c\u9700\u52a8\u6001\u8865\u8d27', '\u97f3\u7bb1 Mini\uff1a\u9500\u91cf\u4f4e\u4e8e\u9884\u671f\uff0c\u5efa\u8bae\u63a7\u8d27\u6d88\u5316'],
        },
        {
          title: '\u52a8\u9500\u4e0e\u5468\u8f6c',
          body: '\u5934\u90e8SKU\u5468\u8f6c\u4ecd\u5feb\uff0c\u4f46\u4e2d\u5c3e\u90e8SKU\u5468\u8f6c\u5929\u6570\u660e\u663e\u62c9\u957f\u3002\u5355\u770b\u9500\u552e\u989d\u4f1a\u63a9\u76d6\u95ee\u9898\uff0c\u5fc5\u987b\u628a\u52a8\u9500\u7387\u548c\u5468\u8f6c\u5929\u6570\u653e\u5728\u4e00\u8d77\u770b\u3002',
          bullets: ['\u8033\u673a\u7c7b\u5468\u8f6c\u7ef4\u6301\u5728 18-22 \u5929', '\u667a\u80fd\u5bb6\u5c45\u957f\u5c3e SKU \u5468\u8f6c\u8d85\u8fc7 45 \u5929', '\u513f\u7ae5\u624b\u8868 Lite \u9700\u8981\u91cd\u65b0\u5b9a\u4e49\u6295\u653e\u4e0e\u5907\u8d27\u7b56\u7565'],
        },
        {
          title: '\u8865\u8d27\u4f18\u5148\u7ea7',
          body: '\u8865\u8d27\u52a8\u4f5c\u5e94\u5206\u6210\u5feb\u53cd\u8865\u8d27\u3001\u8de8\u4ed3\u8c03\u62e8\u548c\u6682\u505c\u91c7\u8d2d\u4e09\u6761\u7ebf\u3002\u8d8a\u9760\u8fd1\u5934\u90e8\u6e20\u9053\u3001\u5934\u90e8SKU\uff0c\u52a8\u4f5c\u65f6\u6548\u8981\u6c42\u8d8a\u9ad8\u3002',
          bullets: ['\u5feb\u53cd\u8865\u8d27\uff1a\u8033\u673a Pro\u3001\u65d7\u8230\u624b\u8868', '\u8de8\u4ed3\u8c03\u62e8\uff1a\u8fd0\u52a8\u8033\u673a Lite', '\u6682\u505c\u91c7\u8d2d\uff1a\u667a\u80fd\u63d2\u5ea7\u53cc\u53e3\u7248\u3001\u97f3\u7bb1 Mini'],
        },
        {
          title: '\u5f02\u5e38\u6ce2\u52a8\u89e3\u91ca',
          body: '\u5f53\u524d\u98ce\u9669\u5e76\u4e0d\u5b8c\u5168\u6765\u81ea\u9700\u6c42\u53d8\u5316\uff0c\u4e00\u90e8\u5206\u662f\u76f4\u64ad\u6d3b\u52a8\u9020\u6210\u7684\u77ed\u5468\u671f\u9700\u6c42\u5cf0\u503c\uff0c\u4e00\u90e8\u5206\u6765\u81ea\u524d\u671f\u5747\u5300\u8865\u8d27\u7b56\u7565\u5e26\u6765\u7684\u5c3e\u90e8\u5e93\u5b58\u6ede\u7559\u3002',
          bullets: ['\u76f4\u64ad\u8282\u70b9\u62c9\u9ad8\u4e86\u8033\u673a\u7c7b\u77ed\u671f\u6d88\u8017\u901f\u5ea6', '\u4e0a\u6708\u7edf\u4e00\u8865\u8d27\u7b56\u7565\u653e\u5927\u4e86\u957f\u5c3e\u5e93\u5b58', '\u5e93\u5b58\u98ce\u9669\u9700\u62c6\u6210\u7f3a\u8d27\u98ce\u9669\u548c\u5360\u4ed3\u98ce\u9669\u5206\u522b\u5904\u7406'],
        },
      ],
      charts: [
        {
          title: '\u4ed3\u522b\u5e93\u5b58\u5065\u5eb7\u5bf9\u6bd4',
          items: [
            { label: '\u534e\u4e1c\u4ed3', value: 62 },
            { label: '\u534e\u5357\u4ed3', value: 69 },
            { label: '\u534e\u5317\u4ed3', value: 81 },
            { label: '\u897f\u5357\u4ed3', value: 77 },
          ],
        },
        {
          title: '\u9ad8\u98ce\u9669SKU\u961f\u5217',
          items: [
            { label: '\u8033\u673a Pro', value: 95 },
            { label: '\u65d7\u8230\u624b\u8868', value: 82 },
            { label: '\u8fd0\u52a8\u8033\u673a Lite', value: 78 },
            { label: '\u667a\u80fd\u63d2\u5ea7\u53cc\u53e3\u7248', value: 67 },
          ],
        },
        {
          title: 'SKU\u5468\u8f6c\u5929\u6570\u5bf9\u6bd4',
          items: [
            { label: '\u8033\u673a Pro', value: 18 },
            { label: '\u65d7\u8230\u624b\u8868', value: 21 },
            { label: '\u97f3\u7bb1 Mini', value: 47 },
            { label: '\u667a\u80fd\u63d2\u5ea7\u53cc\u53e3\u7248', value: 53 },
          ],
        },
        {
          title: '72\u5c0f\u65f6\u8865\u8d27\u52a8\u4f5c\u4f18\u5148\u7ea7',
          items: [
            { label: '\u5feb\u53cd\u8865\u8d27', value: 96 },
            { label: '\u8de8\u4ed3\u8c03\u62e8', value: 83 },
            { label: '\u6682\u505c\u91c7\u8d2d', value: 71 },
            { label: '\u6e05\u5e93\u5b58\u4fc3\u9500', value: 64 },
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
          title: '\u6838\u5fc3\u4ef7\u503c\u5360\u6bd4\u997c\u56fe',
          items: [
            { label: '\u5e93\u5b58\u53ef\u89c6\u5316', value: 32 },
            { label: '\u544a\u8b66\u54cd\u5e94', value: 27 },
            { label: '\u8bbe\u5907\u63a5\u5165', value: 21 },
            { label: '\u8fd0\u7ef4\u6548\u7387', value: 20 },
          ],
        },
        {
          title: '\u6a21\u5757\u5efa\u8bbe\u8fdb\u5ea6\u67f1\u72b6\u56fe',
          items: [
            { label: '\u611f\u77e5\u63a5\u5165', value: 85 },
            { label: '\u8fb9\u7f18\u7f51\u5173', value: 72 },
            { label: '\u89c4\u5219\u5f15\u64ce', value: 66 },
            { label: '\u53ef\u89c6\u5316\u5927\u5c4f', value: 58 },
          ],
        },
        {
          title: '\u9879\u76ee\u4ea4\u4ed8\u91cc\u7a0b\u7891\u8d8b\u52bf',
          items: [
            { label: 'M1', value: 25 },
            { label: 'M2', value: 52 },
            { label: 'M3', value: 78 },
            { label: 'M4', value: 100 },
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
  const existingRecords = new Map((state.outputs || []).map((item) => [item.title, item]));

  for (const output of DEFAULT_SAMPLE_OUTPUTS) {
    const existing = existingRecords.get(output.title);
    if (existing) {
      await deleteReportOutput(existing.id);
    }
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
