import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  buildConceptPageSupplyBlock,
  buildKnowledgeChatHistory,
  prepareKnowledgeScope,
  prepareKnowledgeRetrieval,
} from '../src/lib/knowledge-supply.js';
import type { BotDefinition } from '../src/lib/bot-definitions.js';
import { buildDocumentId } from '../src/lib/document-store.js';
import { STORAGE_CACHE_DIR, STORAGE_CONFIG_DIR } from '../src/lib/paths.js';

const DOCUMENT_CACHE_FILE = path.join(STORAGE_CACHE_DIR, 'documents-cache.json');
const DOCUMENT_OVERRIDES_FILE = path.join(STORAGE_CONFIG_DIR, 'document-overrides.json');
const DOCUMENT_CONFIG_FILE = path.join(STORAGE_CONFIG_DIR, 'document-categories.json');
const RETAINED_DOCUMENTS_FILE = path.join(STORAGE_CONFIG_DIR, 'retained-documents.json');

async function withTemporaryDocumentCache<T>(payload: Record<string, unknown>, fn: () => Promise<T>) {
  let previousCache: string | null = null;
  let previousOverrides: string | null = null;
  let previousConfig: string | null = null;
  let previousRetained: string | null = null;

  try {
    previousCache = await fs.readFile(DOCUMENT_CACHE_FILE, 'utf8');
  } catch {
    previousCache = null;
  }

  try {
    previousOverrides = await fs.readFile(DOCUMENT_OVERRIDES_FILE, 'utf8');
  } catch {
    previousOverrides = null;
  }

  try {
    previousConfig = await fs.readFile(DOCUMENT_CONFIG_FILE, 'utf8');
  } catch {
    previousConfig = null;
  }

  try {
    previousRetained = await fs.readFile(RETAINED_DOCUMENTS_FILE, 'utf8');
  } catch {
    previousRetained = null;
  }

  await fs.mkdir(STORAGE_CACHE_DIR, { recursive: true });
  await fs.mkdir(STORAGE_CONFIG_DIR, { recursive: true });
  await fs.writeFile(DOCUMENT_CACHE_FILE, JSON.stringify(payload, null, 2), 'utf8');
  await fs.writeFile(DOCUMENT_OVERRIDES_FILE, JSON.stringify({}, null, 2), 'utf8');
  await fs.writeFile(DOCUMENT_CONFIG_FILE, JSON.stringify({
    scanRoot: payload.scanRoot,
    scanRoots: payload.scanRoots,
    categories: {},
    customCategories: [],
    updatedAt: '2026-03-31T10:00:00.000Z',
  }, null, 2), 'utf8');
  await fs.writeFile(RETAINED_DOCUMENTS_FILE, JSON.stringify({ items: [] }, null, 2), 'utf8');

  try {
    return await fn();
  } finally {
    if (previousCache === null) {
      await fs.rm(DOCUMENT_CACHE_FILE, { force: true });
    } else {
      await fs.writeFile(DOCUMENT_CACHE_FILE, previousCache, 'utf8');
    }

    if (previousOverrides === null) {
      await fs.rm(DOCUMENT_OVERRIDES_FILE, { force: true });
    } else {
      await fs.writeFile(DOCUMENT_OVERRIDES_FILE, previousOverrides, 'utf8');
    }

    if (previousConfig === null) {
      await fs.rm(DOCUMENT_CONFIG_FILE, { force: true });
    } else {
      await fs.writeFile(DOCUMENT_CONFIG_FILE, previousConfig, 'utf8');
    }

    if (previousRetained === null) {
      await fs.rm(RETAINED_DOCUMENTS_FILE, { force: true });
    } else {
      await fs.writeFile(RETAINED_DOCUMENTS_FILE, previousRetained, 'utf8');
    }
  }
}

test('buildKnowledgeChatHistory should drop short operational feedback and keep relevant dialogue', () => {
  const history = buildKnowledgeChatHistory(
    [
      { role: 'assistant', content: '上传成功，已入库。' },
      { role: 'user', content: '我刚上传了一批简历。' },
      { role: 'assistant', content: '好的，我已经看到最近上传的简历摘要。' },
      { role: 'user', content: '按公司维度整理 IT 项目信息。' },
      { role: 'assistant', content: '可以，我会基于相关简历来整理。' },
    ],
    '按公司维度整理简历里的 IT 项目信息',
  );

  assert.equal(history.length, 2);
  assert.equal(history[0]?.content, '按公司维度整理 IT 项目信息。');
  assert.equal(history[1]?.content, '可以，我会基于相关简历来整理。');
});

test('prepareKnowledgeRetrieval should produce fallback metadata and chunk ids when rule retrieval is empty', async () => {
  const supply = await prepareKnowledgeRetrieval({
    requestText: 'zzqxv unmatched prompt',
    knowledgeChatHistory: [],
    libraries: [{ key: 'resume', label: '简历' }],
    scopedItems: [
      {
        path: 'C:\\tmp\\resume-1.txt',
        name: 'resume-1.txt',
        title: 'Resume 1',
        ext: '.txt',
        summary: '',
        excerpt: '',
        category: 'general',
        bizCategory: 'general',
        parseStatus: 'success',
        extractedChars: 120,
        topicTags: [],
        confirmedGroups: ['简历'],
        groups: ['简历'],
        evidenceChunks: ['Built an ERP integration project for employer A.'],
        claims: [],
      } as any,
      {
        path: 'C:\\tmp\\resume-2.txt',
        name: 'resume-2.txt',
        title: 'Resume 2',
        ext: '.txt',
        summary: '',
        excerpt: '',
        category: 'general',
        bizCategory: 'general',
        parseStatus: 'success',
        extractedChars: 160,
        topicTags: [],
        confirmedGroups: ['简历'],
        groups: ['简历'],
        evidenceChunks: ['Implemented API gateway migration for employer B.'],
        claims: [],
      } as any,
    ],
    docLimit: 6,
    evidenceLimit: 8,
  });

  assert.equal(supply.effectiveRetrieval.meta.candidateCount, 2);
  assert.equal(supply.effectiveRetrieval.meta.rerankedCount, 2);
  assert.equal(supply.effectiveRetrieval.documents.length, 2);
  assert.ok(supply.effectiveRetrieval.evidenceMatches.every((item) => item.chunkId.startsWith('fallback-')));
});

test('prepareKnowledgeRetrieval should narrow retrieval to preferred memory-selected document ids', async () => {
  const firstItem = {
    path: 'C:\\tmp\\resume-1.txt',
    name: 'resume-1.txt',
    title: 'Resume 1',
    ext: '.txt',
    summary: '',
    excerpt: '',
    category: 'general',
    bizCategory: 'general',
    parseStatus: 'success',
    extractedChars: 120,
    topicTags: [],
    confirmedGroups: ['resume'],
    groups: ['resume'],
    evidenceChunks: ['Built an ERP integration project for employer A.'],
    claims: [],
  } as any;
  const secondItem = {
    path: 'C:\\tmp\\resume-2.txt',
    name: 'resume-2.txt',
    title: 'Resume 2',
    ext: '.txt',
    summary: '',
    excerpt: '',
    category: 'general',
    bizCategory: 'general',
    parseStatus: 'success',
    extractedChars: 160,
    topicTags: [],
    confirmedGroups: ['resume'],
    groups: ['resume'],
    evidenceChunks: ['Implemented API gateway migration for employer B.'],
    claims: [],
  } as any;

  const supply = await prepareKnowledgeRetrieval({
    requestText: 'zzqxv unmatched prompt',
    knowledgeChatHistory: [],
    libraries: [{ key: 'resume', label: '简历' }],
    scopedItems: [firstItem, secondItem],
    docLimit: 6,
    evidenceLimit: 8,
    preferredDocumentIds: [buildDocumentId(secondItem.path)],
  });

  assert.equal(supply.effectiveRetrieval.meta.candidateCount, 1);
  assert.equal(supply.effectiveRetrieval.documents.length, 1);
  assert.equal(supply.effectiveRetrieval.documents[0]?.title, 'Resume 2');
});

test('prepareKnowledgeScope should route recent uploaded image questions to ungrouped fallback documents', async () => {
  await withTemporaryDocumentCache({
    generatedAt: '2026-03-31T10:00:00.000Z',
    scanRoot: 'C:\\uploads',
    scanRoots: ['C:\\uploads'],
    totalFiles: 1,
    scanSignature: 'image-cache',
    items: [
      {
        path: 'C:\\uploads\\1743390000000-uploaded-shot.png',
        name: '1743390000000-uploaded-shot.png',
        ext: '.png',
        title: 'uploaded-shot',
        category: 'general',
        bizCategory: 'general',
        parseStatus: 'parsed',
        parseMethod: 'image-metadata',
        summary: 'Image file: uploaded-shot.png',
        excerpt: 'Image file: uploaded-shot.png',
        fullText: 'Image file: uploaded-shot.png\n\nOCR text was not extracted from this image.',
        extractedChars: 72,
        topicTags: ['图片上传'],
        groups: ['ungrouped'],
        confirmedGroups: ['ungrouped'],
        parseStage: 'quick',
        detailParseStatus: 'queued',
      },
    ],
  }, async () => {
    const scope = await prepareKnowledgeScope({
      requestText: '描述下我刚上传的图片内容',
      chatHistory: [],
    });

    assert.deepEqual(scope.libraries, [{ key: 'ungrouped', label: '未分组' }]);
    assert.equal(scope.scopedItems.length, 1);
    assert.equal(scope.scopedItems[0]?.ext, '.png');
    assert.equal(scope.scopedItems[0]?.confirmedGroups?.[0], 'ungrouped');
  });
});

test('prepareKnowledgeScope should route recent parsed document questions to recently detailed documents', async () => {
  await withTemporaryDocumentCache({
    generatedAt: '2026-04-03T10:00:00.000Z',
    scanRoot: 'C:\\uploads',
    scanRoots: ['C:\\uploads'],
    totalFiles: 3,
    scanSignature: 'recent-parsed-scope',
    items: [
      {
        path: 'C:\\uploads\\1743660000000-contract-a.png',
        name: '1743660000000-contract-a.png',
        ext: '.png',
        title: 'contract-a',
        category: 'general',
        bizCategory: 'general',
        parseStatus: 'parsed',
        parseStage: 'detailed',
        detailParseStatus: 'succeeded',
        detailParsedAt: '2026-04-03T09:00:00.000Z',
        groups: ['contract'],
        confirmedGroups: ['contract'],
      },
      {
        path: 'C:\\uploads\\1743663600000-contract-b.png',
        name: '1743663600000-contract-b.png',
        ext: '.png',
        title: 'contract-b',
        category: 'general',
        bizCategory: 'general',
        parseStatus: 'parsed',
        parseStage: 'detailed',
        detailParseStatus: 'succeeded',
        detailParsedAt: '2026-04-03T10:00:00.000Z',
        groups: ['contract'],
        confirmedGroups: ['contract'],
      },
      {
        path: 'C:\\uploads\\1743570000000-older-note.txt',
        name: '1743570000000-older-note.txt',
        ext: '.txt',
        title: 'older-note',
        category: 'general',
        bizCategory: 'general',
        parseStatus: 'parsed',
        parseStage: 'quick',
        detailParseStatus: 'queued',
        groups: ['notes'],
        confirmedGroups: ['notes'],
      },
    ],
  }, async () => {
    const scope = await prepareKnowledgeScope({
      requestText: 'show the 2 most recently parsed documents',
      chatHistory: [],
    });

    assert.equal(scope.scopedItems.length, 2);
    assert.equal(scope.scopedItems[0]?.title, 'contract-b');
    assert.equal(scope.scopedItems[1]?.title, 'contract-a');
    assert.deepEqual(scope.libraries, [{ key: 'contract', label: '合同协议' }]);
  });
});

test('prepareKnowledgeScope should route failed parse questions to failed documents before generic image fallback', async () => {
  await withTemporaryDocumentCache({
    generatedAt: '2026-04-03T10:00:00.000Z',
    scanRoot: 'C:\\uploads',
    scanRoots: ['C:\\uploads'],
    totalFiles: 2,
    scanSignature: 'failed-parse-scope',
    items: [
      {
        path: 'C:\\uploads\\1743663600000-contract-failed.png',
        name: '1743663600000-contract-failed.png',
        ext: '.png',
        title: 'contract-failed',
        category: 'general',
        bizCategory: 'general',
        parseStatus: 'error',
        parseStage: 'detailed',
        detailParseStatus: 'failed',
        groups: ['ungrouped'],
        confirmedGroups: ['ungrouped'],
      },
      {
        path: 'C:\\uploads\\1743660000000-contract-ok.png',
        name: '1743660000000-contract-ok.png',
        ext: '.png',
        title: 'contract-ok',
        category: 'general',
        bizCategory: 'general',
        parseStatus: 'parsed',
        parseStage: 'detailed',
        detailParseStatus: 'succeeded',
        groups: ['contract'],
        confirmedGroups: ['contract'],
      },
    ],
  }, async () => {
    const scope = await prepareKnowledgeScope({
      requestText: 'which files failed OCR and need reparse',
      chatHistory: [],
    });

    assert.equal(scope.scopedItems.length, 1);
    assert.equal(scope.scopedItems[0]?.title, 'contract-failed');
    assert.deepEqual(scope.libraries, [{ key: 'ungrouped', label: '未分组' }]);
  });
});

test('prepareKnowledgeScope should honor preferred document ids before fallback routing', async () => {
  const firstPath = 'C:\\uploads\\1743390000000-contract-a.png';
  const secondPath = 'C:\\uploads\\1743393600000-contract-b.png';

  await withTemporaryDocumentCache({
    generatedAt: '2026-03-31T10:00:00.000Z',
    scanRoot: 'C:\\uploads',
    scanRoots: ['C:\\uploads'],
    totalFiles: 2,
    scanSignature: 'preferred-document-scope',
    items: [
      {
        path: firstPath,
        name: '1743390000000-contract-a.png',
        ext: '.png',
        title: 'contract-a',
        category: 'contract',
        bizCategory: 'contract',
        parseStatus: 'parsed',
        parseMethod: 'image-ocr',
        summary: '甲方为广州轻工建筑安装工程公司，乙方为广州廉明建筑有限公司。',
        excerpt: '甲方为广州轻工建筑安装工程公司，乙方为广州廉明建筑有限公司。',
        fullText: '甲方为广州轻工建筑安装工程公司，乙方为广州廉明建筑有限公司。',
        extractedChars: 64,
        topicTags: ['合同'],
        groups: ['contract'],
        confirmedGroups: ['contract'],
        parseStage: 'detailed',
        detailParseStatus: 'succeeded',
        detailParsedAt: '2026-03-31T10:30:00.000Z',
      },
      {
        path: secondPath,
        name: '1743393600000-contract-b.png',
        ext: '.png',
        title: 'contract-b',
        category: 'contract',
        bizCategory: 'contract',
        parseStatus: 'parsed',
        parseMethod: 'image-ocr',
        summary: '甲方为广州轻工建筑安装工程公司，乙方为广州廉明建筑有限公司。',
        excerpt: '甲方为广州轻工建筑安装工程公司，乙方为广州廉明建筑有限公司。',
        fullText: '甲方为广州轻工建筑安装工程公司，乙方为广州廉明建筑有限公司。',
        extractedChars: 64,
        topicTags: ['合同'],
        groups: ['contract'],
        confirmedGroups: ['contract'],
        parseStage: 'detailed',
        detailParseStatus: 'succeeded',
        detailParsedAt: '2026-03-31T10:31:00.000Z',
      },
    ],
  }, async () => {
    await fs.writeFile(DOCUMENT_CONFIG_FILE, JSON.stringify({
      scanRoot: 'C:\\uploads',
      scanRoots: ['C:\\uploads'],
      categories: {
        contract: { label: '合同协议' },
      },
      customCategories: [],
      updatedAt: '2026-03-31T10:00:00.000Z',
    }, null, 2), 'utf8');

    const scope = await prepareKnowledgeScope({
      requestText: '最近解析的两份文档里的公司名是啥',
      chatHistory: [],
      preferredDocumentIds: [buildDocumentId(firstPath), buildDocumentId(secondPath)],
    });

    assert.deepEqual(scope.libraries, [{ key: 'contract', label: '合同协议' }]);
    assert.equal(scope.scopedItems.length, 2);
    assert.equal(scope.scopedItems[0]?.title, 'contract-b');
    assert.equal(scope.scopedItems[1]?.title, 'contract-a');
  });
});

test('prepareKnowledgeScope should enforce bot visibility before recent parsed fallback', async () => {
  const bot: BotDefinition = {
    id: 'resume-bot',
    name: '简历助理',
    slug: 'resume-bot',
    description: '',
    enabled: true,
    isDefault: false,
    systemPrompt: '',
    visibleLibraryKeys: ['resume'],
    includeUngrouped: false,
    includeFailedParseDocuments: false,
    channelBindings: [{ channel: 'web', enabled: true }],
    updatedAt: '2026-04-03T18:00:00.000Z',
  };

  await withTemporaryDocumentCache({
    generatedAt: '2026-04-03T10:00:00.000Z',
    scanRoot: 'C:\\uploads',
    scanRoots: ['C:\\uploads'],
    totalFiles: 2,
    scanSignature: 'bot-scope-recent-parsed',
    items: [
      {
        path: 'C:\\uploads\\1743660000000-contract-a.png',
        name: '1743660000000-contract-a.png',
        ext: '.png',
        title: 'contract-a',
        category: 'contract',
        bizCategory: 'contract',
        parseStatus: 'parsed',
        parseStage: 'detailed',
        detailParseStatus: 'succeeded',
        detailParsedAt: '2026-04-03T09:00:00.000Z',
        groups: ['contract'],
        confirmedGroups: ['contract'],
      },
      {
        path: 'C:\\uploads\\1743663600000-resume-a.txt',
        name: '1743663600000-resume-a.txt',
        ext: '.txt',
        title: 'resume-a',
        category: 'resume',
        bizCategory: 'general',
        parseStatus: 'parsed',
        parseStage: 'detailed',
        detailParseStatus: 'succeeded',
        detailParsedAt: '2026-04-03T10:00:00.000Z',
        groups: ['resume'],
        confirmedGroups: ['resume'],
      },
    ],
  }, async () => {
    await fs.writeFile(DOCUMENT_CONFIG_FILE, JSON.stringify({
      scanRoot: 'C:\\uploads',
      scanRoots: ['C:\\uploads'],
      categories: {
        contract: { label: '合同协议' },
        resume: { label: '人才简历' },
      },
      customCategories: [],
      updatedAt: '2026-04-03T10:00:00.000Z',
    }, null, 2), 'utf8');

    const scope = await prepareKnowledgeScope({
      requestText: 'show the most recently parsed document',
      chatHistory: [],
      botDefinition: bot,
    });

    assert.deepEqual(scope.libraries, [{ key: 'resume', label: '人才简历' }]);
    assert.equal(scope.scopedItems.length, 1);
    assert.equal(scope.scopedItems[0]?.title, 'resume-a');
  });
});

test('prepareKnowledgeScope should not backfill unrelated visible libraries when requested library is invisible to the bot', async () => {
  const bot: BotDefinition = {
    id: 'teams-assistant',
    name: 'Teams Assistant',
    slug: 'teams-assistant',
    description: '',
    enabled: true,
    isDefault: false,
    systemPrompt: '',
    visibleLibraryKeys: ['paper', 'resume'],
    includeUngrouped: false,
    includeFailedParseDocuments: false,
    channelBindings: [{ channel: 'web', enabled: true }],
    updatedAt: '2026-04-04T09:00:00.000Z',
  };

  await withTemporaryDocumentCache({
    generatedAt: '2026-04-04T09:00:00.000Z',
    scanRoot: 'C:\\uploads',
    scanRoots: ['C:\\uploads'],
    totalFiles: 2,
    scanSignature: 'bot-scope-blocked-library',
    items: [
      {
        path: 'C:\\uploads\\1743732000000-contract-a.png',
        name: '1743732000000-contract-a.png',
        ext: '.png',
        title: 'contract-a',
        category: 'contract',
        bizCategory: 'contract',
        parseStatus: 'parsed',
        parseStage: 'detailed',
        detailParseStatus: 'succeeded',
        detailParsedAt: '2026-04-04T08:00:00.000Z',
        groups: ['contract'],
        confirmedGroups: ['contract'],
      },
      {
        path: 'C:\\uploads\\1743735600000-paper-a.pdf',
        name: '1743735600000-paper-a.pdf',
        ext: '.pdf',
        title: 'paper-a',
        category: 'paper',
        bizCategory: 'paper',
        parseStatus: 'parsed',
        parseStage: 'detailed',
        detailParseStatus: 'succeeded',
        detailParsedAt: '2026-04-04T08:30:00.000Z',
        groups: ['paper'],
        confirmedGroups: ['paper'],
      },
    ],
  }, async () => {
    await fs.writeFile(DOCUMENT_CONFIG_FILE, JSON.stringify({
      scanRoot: 'C:\\uploads',
      scanRoots: ['C:\\uploads'],
      categories: {
        contract: { label: 'Contract' },
        paper: { label: 'Paper' },
        resume: { label: 'Resume' },
      },
      customCategories: [],
      updatedAt: '2026-04-04T09:00:00.000Z',
    }, null, 2), 'utf8');

    const scope = await prepareKnowledgeScope({
      requestText: 'what recent documents are in the contract library',
      chatHistory: [],
      botDefinition: bot,
    });

    assert.deepEqual(scope.libraries, []);
    assert.equal(scope.scopedItems.length, 0);
  });
});

test('buildConceptPageSupplyBlock should provide structure hints for resume company pages', () => {
  const block = buildConceptPageSupplyBlock({
    requestText: '基于人才简历知识库，按公司维度输出数据可视化静态页',
    libraries: [{ key: 'resume', label: '人才简历' }],
    retrieval: {
      documents: [
        {
          path: 'C:\\tmp\\resume-1.txt',
          name: 'resume-1.txt',
          title: 'Resume 1',
          ext: '.txt',
          summary: 'A company-side ERP project.',
          excerpt: '',
          category: 'resume',
          bizCategory: 'general',
          parseStatus: 'success',
          extractedChars: 120,
          parseStage: 'detailed',
          detailParseStatus: 'succeeded',
          topicTags: ['ERP', '交付'],
          structuredProfile: {
            candidateName: '张三',
            latestCompany: '甲公司',
            companies: ['甲公司'],
            itProjectHighlights: ['ERP 升级项目'],
            skills: ['Java', 'ERP'],
          },
        } as any,
      ],
      evidenceMatches: [],
      meta: { candidateCount: 1, rerankedCount: 1 },
    } as any,
    templateTaskHint: 'resume-comparison',
  });

  assert.match(block, /Concept page supply:/);
  assert.match(block, /Primary grouping dimension: company/);
  assert.match(block, /Recommended sections:/);
  assert.match(block, /公司概览/);
  assert.match(block, /Recommended cards:/);
  assert.match(block, /Grouping hints:/);
});

test('buildConceptPageSupplyBlock should provide paper result sections when paper task is selected', () => {
  const block = buildConceptPageSupplyBlock({
    requestText: '请基于学术论文知识库按研究结果维度输出数据可视化静态页',
    libraries: [{ key: 'paper', label: '学术论文' }],
    retrieval: {
      documents: [
        {
          path: 'C:\\tmp\\paper-1.pdf',
          name: 'paper-1.pdf',
          title: 'Clinical Study 1',
          ext: '.pdf',
          summary: 'A randomized paper with outcome signals.',
          excerpt: '',
          category: 'paper',
          bizCategory: 'paper',
          parseStatus: 'success',
          extractedChars: 220,
          parseStage: 'detailed',
          detailParseStatus: 'succeeded',
          topicTags: ['试验', '结果'],
          structuredProfile: {
            methodology: 'randomized placebo controlled',
            resultSignals: ['改善主要指标'],
            metricSignals: ['primary endpoint'],
            publicationSignals: ['peer reviewed'],
          },
        } as any,
      ],
      evidenceMatches: [],
      meta: { candidateCount: 1, rerankedCount: 1 },
    } as any,
    templateTaskHint: 'paper-static-page',
  });

  assert.match(block, /Primary grouping dimension: result/);
  assert.match(block, /核心发现/);
  assert.match(block, /结果指标/);
});

test('buildConceptPageSupplyBlock should provide bid risk sections and grouping hints for bid concept pages', () => {
  const block = buildConceptPageSupplyBlock({
    requestText: '请基于 bids 知识库按风险维度输出静态页，重点看资格风险、材料缺口和时间风险。',
    libraries: [{ key: 'bids', label: 'bids' }],
    retrieval: {
      documents: [
        {
          path: 'C:\\tmp\\bid-1.md',
          name: 'bid-1.md',
          title: 'Hospital Tender 1',
          ext: '.md',
          summary: 'Medical device tender with qualification, materials, and deadline risks.',
          excerpt: '',
          category: 'general',
          bizCategory: 'general',
          parseStatus: 'success',
          extractedChars: 260,
          parseStage: 'detailed',
          detailParseStatus: 'succeeded',
          topicTags: ['医疗设备', '投标'],
          structuredProfile: {
            riskSignals: ['资格预审', '截止时间'],
            qualificationSignals: ['资质证书', '业绩案例'],
            sectionSignals: ['技术应答', '商务条款'],
          },
        } as any,
      ],
      evidenceMatches: [],
      meta: { candidateCount: 1, rerankedCount: 1 },
    } as any,
    templateTaskHint: 'bids-static-page',
  });

  assert.match(block, /Primary grouping dimension: risk/);
  assert.match(block, /Recommended sections:/);
  assert.match(block, /资格风险/);
  assert.match(block, /材料缺口/);
  assert.match(block, /Recommended cards:/);
  assert.match(block, /Grouping hints:/);
  assert.match(block, /资格预审/);
});

test('buildConceptPageSupplyBlock should use scenario grouping hints for iot concept pages', () => {
  const block = buildConceptPageSupplyBlock({
    requestText: '请基于 IOT解决方案 知识库按场景维度输出静态页，重点梳理行业场景、客户痛点和部署方式。',
    libraries: [{ key: 'iot解决方案', label: 'IOT解决方案' }],
    retrieval: {
      documents: [
        {
          path: 'C:\\tmp\\iot-1.md',
          name: 'iot-1.md',
          title: 'Smart Warehouse Solution',
          ext: '.md',
          summary: 'A smart warehouse IOT solution with edge and cloud deployment.',
          excerpt: '',
          category: 'technical',
          bizCategory: 'iot',
          parseStatus: 'success',
          extractedChars: 280,
          parseStage: 'detailed',
          detailParseStatus: 'succeeded',
          topicTags: ['智慧仓储', '仓配'],
          structuredProfile: {
            targetScenario: ['智慧仓储', '区域仓配'],
            deploymentMode: '边缘 + 云',
            customerSignals: ['仓配中心'],
          },
        } as any,
      ],
      evidenceMatches: [],
      meta: { candidateCount: 1, rerankedCount: 1 },
    } as any,
    templateTaskHint: 'iot-static-page',
  });

  assert.match(block, /Primary grouping dimension: scenario/);
  assert.match(block, /Recommended sections:/);
  assert.match(block, /场景概览/);
  assert.match(block, /Recommended cards:/);
  assert.match(block, /Grouping hints:/);
  assert.match(block, /智慧仓储/);
  assert.match(block, /边缘 \+ 云/);
});

test('buildConceptPageSupplyBlock should provide module sections for iot module pages', () => {
  const block = buildConceptPageSupplyBlock({
    requestText: '请基于 IOT解决方案 知识库按模块维度输出静态页，重点梳理设备、网关、平台和接口集成。',
    libraries: [{ key: 'iot解决方案', label: 'IOT解决方案' }],
    retrieval: {
      documents: [
        {
          path: 'C:\\tmp\\iot-2.md',
          name: 'iot-2.md',
          title: 'IOT Reference Architecture',
          ext: '.md',
          summary: 'Reference architecture covering gateway, rules engine, and API integration.',
          excerpt: '',
          category: 'technical',
          bizCategory: 'iot',
          parseStatus: 'success',
          extractedChars: 320,
          parseStage: 'detailed',
          detailParseStatus: 'succeeded',
          topicTags: ['设备接入', '接口集成'],
          structuredProfile: {
            moduleSignals: ['设备接入', '规则引擎'],
            interfaceType: 'MQTT / REST',
            integrationSignals: ['WMS', 'ERP'],
            valueSignals: ['库存可视化'],
          },
        } as any,
      ],
      evidenceMatches: [],
      meta: { candidateCount: 1, rerankedCount: 1 },
    } as any,
    templateTaskHint: 'iot-static-page',
  });

  assert.match(block, /Primary grouping dimension: module/);
  assert.match(block, /模块概览/);
  assert.match(block, /接口集成/);
  assert.match(block, /Grouping hints:/);
  assert.match(block, /设备接入/);
  assert.match(block, /MQTT \/ REST/);
});
