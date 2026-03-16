import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createApp } from '../app.js';

type ValidationQuestion = {
  id: string;
  group: string;
  prompt: string;
  expectedDocs?: string[];
  expectedTerms?: string[];
  forbiddenDocs?: string[];
};

type ValidationResult = {
  id: string;
  group: string;
  prompt: string;
  expectedDocs: string[];
  matchedDocs: string[];
  expectedDocHits: string[];
  missingExpectedDocs: string[];
  forbiddenDocHits: string[];
  expectedTermHits: string[];
  missingExpectedTerms: string[];
  answerPreview: string;
  referencesCount: number;
  sourcesCount: number;
  orchestrationMode?: string;
  status: 'PASS' | 'PARTIAL' | 'FAIL';
  notes: string[];
};

const DEFAULT_SCAN_DIR = '/mnt/c/Users/soulzyn/Desktop/au20260316';

const QUESTIONS: ValidationQuestion[] = [
  {
    id: 'Q01',
    group: 'summary',
    prompt: '请概括这批资料主要覆盖哪些健康主题？',
    expectedTerms: ['减脂', '肠道', '过敏', '脑', '后生元'],
  },
  {
    id: 'Q02',
    group: 'classification',
    prompt: '这批资料里哪些更像论文研究，哪些更像行业白皮书或业务资料？',
    expectedDocs: ['后生元白皮书.pdf'],
    expectedTerms: ['白皮书', '论文'],
  },
  {
    id: 'Q03',
    group: 'single-doc',
    prompt: '请总结《后生元白皮书》的核心内容、主要价值和适用场景。',
    expectedDocs: ['后生元白皮书.pdf'],
    expectedTerms: ['白皮书', '后生元'],
  },
  {
    id: 'Q04',
    group: 'single-doc',
    prompt: "关于 Olympic Women's Weightlifting Gold Medalist 那篇研究，主要结论是什么？",
    expectedDocs: ["(2022减脂、运动)Probiotic Strains Isolated from an Olympic Women's Weightlifting Gold Medalist Increase Weight Loss and Exercise Performance in a Mouse Model.pdf"],
    expectedTerms: ['weight loss', 'exercise performance', 'mouse'],
  },
  {
    id: 'Q05',
    group: 'single-doc',
    prompt: '20 IBS FOS 这篇资料主要研究什么问题？结论是什么？',
    expectedDocs: ['20 IBS FOS.pdf'],
    expectedTerms: ['IBS', 'FOS'],
  },
  {
    id: 'Q06',
    group: 'single-doc',
    prompt: 'Bifidobacterium breve 改善脑功能那篇文献，实验对象和核心发现是什么？',
    expectedDocs: ['（2021）（脑部健康）Administration of Bifidobacterium breve Improves the Brain Function of Aβ 1-42-Treated Mice via the Modulation of the Gut Microbiome.pdf'],
    expectedTerms: ['Aβ', 'mice', 'brain'],
  },
  {
    id: 'Q07',
    group: 'single-doc',
    prompt: 'BL-99 调节肠道炎症和功能那篇资料里，用的是什么模型？主要结果是什么？',
    expectedDocs: ['（调节肠道炎症和功能）Bifidobacterium lactis BL-99 modulates intestinal inflammation and functions in zebrafish models.pdf'],
    expectedTerms: ['zebrafish', 'intestinal'],
  },
  {
    id: 'Q08',
    group: 'comparison',
    prompt: '这批资料里，哪些更偏减脂/运动，哪些更偏抗敏，哪些更偏肠道炎症或脑健康？',
    expectedTerms: ['减脂', '抗敏', '肠道', '脑'],
  },
];

function includesInsensitive(text: string, needle: string) {
  return text.toLowerCase().includes(needle.toLowerCase());
}

function assess(question: ValidationQuestion, answer: string, matchedDocs: string[], referencesCount: number, sourcesCount: number): ValidationResult {
  const expectedDocs = question.expectedDocs || [];
  const expectedTerms = question.expectedTerms || [];
  const forbiddenDocs = question.forbiddenDocs || [];

  const expectedDocHits = expectedDocs.filter((doc) => matchedDocs.includes(doc));
  const missingExpectedDocs = expectedDocs.filter((doc) => !matchedDocs.includes(doc));
  const forbiddenDocHits = forbiddenDocs.filter((doc) => matchedDocs.includes(doc));
  const expectedTermHits = expectedTerms.filter((term) => includesInsensitive(answer, term));
  const missingExpectedTerms = expectedTerms.filter((term) => !includesInsensitive(answer, term));

  const notes: string[] = [];
  let score = 0;

  if (!expectedDocs.length || expectedDocHits.length > 0) score += 2;
  else notes.push('未命中预期文档');

  if (!forbiddenDocHits.length) score += 1;
  else notes.push(`命中了不期望文档：${forbiddenDocHits.join('、')}`);

  if (!expectedTerms.length || expectedTermHits.length >= Math.max(1, Math.ceil(expectedTerms.length / 2))) score += 2;
  else notes.push('回答缺少较多预期关键词');

  if (!includesInsensitive(answer, '技术文档汇总已完成') && !includesInsensitive(answer, '合同风险归纳已完成')) score += 1;
  else notes.push('回答仍带明显 demo/mocked 场景文案');

  if (referencesCount > 0) score += 1;
  else notes.push('回答未返回 references');

  if (sourcesCount > 0) score += 1;
  else notes.push('回答未返回 sources');

  const status: ValidationResult['status'] = score >= 7 ? 'PASS' : score >= 5 ? 'PARTIAL' : 'FAIL';

  return {
    id: question.id,
    group: question.group,
    prompt: question.prompt,
    expectedDocs,
    matchedDocs,
    expectedDocHits,
    missingExpectedDocs,
    forbiddenDocHits,
    expectedTermHits,
    missingExpectedTerms,
    answerPreview: answer.slice(0, 280) + (answer.length > 280 ? '…' : ''),
    referencesCount,
    sourcesCount,
    status,
    notes,
  };
}

async function main() {
  process.env.DOCUMENT_SCAN_DIR = process.env.DOCUMENT_SCAN_DIR || DEFAULT_SCAN_DIR;

  const app = createApp();
  try {
    const docResponse = await app.inject({ method: 'GET', url: '/api/documents' });
    const docJson = docResponse.json();

    const results: ValidationResult[] = [];

    for (const question of QUESTIONS) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/chat',
        payload: { prompt: question.prompt },
      });
      const json = response.json();
      const matchedDocs = Array.isArray(json?.message?.references)
        ? json.message.references.map((item: { name?: string }) => item.name || 'unknown')
        : [];
      const answer = String(json?.message?.content || '');
      const result = assess(
        question,
        answer,
        matchedDocs,
        Array.isArray(json?.message?.references) ? json.message.references.length : 0,
        Array.isArray(json?.sources) ? json.sources.length : 0,
      );
      result.orchestrationMode = json?.orchestration?.mode || 'unknown';
      results.push(result);
    }

    const pass = results.filter((item) => item.status === 'PASS').length;
    const partial = results.filter((item) => item.status === 'PARTIAL').length;
    const fail = results.filter((item) => item.status === 'FAIL').length;
    const generatedAt = new Date().toISOString();
    const outputDir = path.resolve(process.cwd(), '../../docs/validation-reports');
    await fs.mkdir(outputDir, { recursive: true });

    const jsonPath = path.join(outputDir, 'AU20260316-2026-03-17.json');
    const mdPath = path.join(outputDir, 'AU20260316-2026-03-17.md');

    await fs.writeFile(jsonPath, JSON.stringify({
      generatedAt,
      scanDir: process.env.DOCUMENT_SCAN_DIR,
      documents: {
        totalFiles: docJson?.totalFiles || 0,
        byBizCategory: docJson?.byBizCategory || {},
        byStatus: docJson?.byStatus || {},
      },
      summary: { pass, partial, fail, total: results.length },
      results,
    }, null, 2));

    const markdown = [
      '# Validation Report - AU20260316 (2026-03-17)',
      '',
      `- GeneratedAt: ${generatedAt}`,
      `- ScanDir: ${process.env.DOCUMENT_SCAN_DIR}`,
      `- Documents: total=${docJson?.totalFiles || 0}`,
      `- ByBizCategory: ${JSON.stringify(docJson?.byBizCategory || {})}`,
      `- ByStatus: ${JSON.stringify(docJson?.byStatus || {})}`,
      '',
      '## Summary',
      '',
      `- PASS: ${pass}`,
      `- PARTIAL: ${partial}`,
      `- FAIL: ${fail}`,
      `- TOTAL: ${results.length}`,
      '',
      '## Cases',
      '',
      ...results.flatMap((item) => [
        `### ${item.id} [${item.status}] ${item.prompt}`,
        '',
        `- Group: ${item.group}`,
        `- Orchestration: ${item.orchestrationMode}`,
        `- MatchedDocs: ${item.matchedDocs.join(' | ') || '-'}`,
        `- ExpectedDocHits: ${item.expectedDocHits.join(' | ') || '-'}`,
        `- MissingExpectedDocs: ${item.missingExpectedDocs.join(' | ') || '-'}`,
        `- ExpectedTermHits: ${item.expectedTermHits.join(' | ') || '-'}`,
        `- MissingExpectedTerms: ${item.missingExpectedTerms.join(' | ') || '-'}`,
        `- References: ${item.referencesCount}`,
        `- Sources: ${item.sourcesCount}`,
        `- Notes: ${item.notes.join('；') || '-'}`,
        `- AnswerPreview: ${item.answerPreview}`,
        '',
      ]),
    ].join('\n');

    await fs.writeFile(mdPath, markdown, 'utf8');

    console.log(JSON.stringify({
      status: 'ok',
      generatedAt,
      output: { jsonPath, mdPath },
      summary: { pass, partial, fail, total: results.length },
    }, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
