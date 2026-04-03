import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReportOutput } from '../src/lib/knowledge-output.js';

test('normalizeReportOutput should support doc and markdown narrative outputs', () => {
  const raw = JSON.stringify({
    title: '合同库摘要',
    content: '根据合同库整理的书面摘要',
    page: {
      summary: '根据合同库整理的书面摘要',
      sections: [{ title: '重点', body: '付款条款和违约责任需要优先复核。' }],
    },
  });

  const docOutput = normalizeReportOutput(
    'doc',
    '按合同库输出正式文档',
    raw,
    {
      title: '合同书面摘要',
      fixedStructure: [],
      variableZones: [],
      outputHint: '输出书面摘要',
      pageSections: ['重点'],
    },
  );
  assert.equal(docOutput.type, 'doc');
  assert.equal(docOutput.format, 'docx');
  assert.equal(docOutput.page?.sections?.[0]?.title, '重点');

  const markdownOutput = normalizeReportOutput(
    'md',
    '按合同库输出 markdown 文档',
    raw,
    {
      title: '合同 Markdown 摘要',
      fixedStructure: [],
      variableZones: [],
      outputHint: '输出 markdown 摘要',
      pageSections: ['重点'],
    },
  );
  assert.equal(markdownOutput.type, 'md');
  assert.equal(markdownOutput.format, 'md');
  assert.equal(markdownOutput.page?.sections?.[0]?.title, '重点');
});
