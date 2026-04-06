import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseDocument } from '../src/lib/document-parser.js';

test('parseDocument should apply contract library fallback schema and focused fields', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-contract-template-'));
  const filePath = path.join(tempDir, 'business-note.md');
  const content = [
    '# 商务服务说明',
    '',
    '委托方：广州轻工集团',
    '服务方：广州廉明建筑有限公司',
    '签订日期：2026-04-01',
    '生效日期：2026-04-02',
    '金额：￥120000',
    '服务期限：12个月',
    '付款条款：签约后7日内付款',
  ].join('\n');

  try {
    await fs.writeFile(filePath, content, 'utf8');
    const contractDoc = await parseDocument(filePath, undefined, {
      stage: 'detailed',
      libraryContext: {
        keys: ['contract'],
        labels: ['合同协议'],
      },
    });

    assert.equal(contractDoc.schemaType, 'contract');
    assert.equal(contractDoc.contractFields?.partyA, '广州轻工集团');
    assert.equal(contractDoc.contractFields?.partyB, '广州廉明建筑有限公司');
    assert.equal(contractDoc.structuredProfile?.partyA, '广州轻工集团');
    assert.equal(contractDoc.structuredProfile?.effectiveDate, '2026-04-02');
    assert.equal(contractDoc.structuredProfile?.fieldTemplate?.fieldSet, 'contract');
    assert.deepEqual(contractDoc.structuredProfile?.fieldTemplate?.preferredFieldKeys, [
      'partyA',
      'partyB',
      'amount',
      'signDate',
      'paymentTerms',
    ]);
    assert.deepEqual(contractDoc.structuredProfile?.fieldTemplate?.requiredFieldKeys, ['partyA', 'partyB', 'amount']);
    assert.equal(contractDoc.structuredProfile?.fieldTemplate?.fieldAliases?.partyA, '甲方');
    assert.equal(contractDoc.structuredProfile?.focusedFields?.partyA, contractDoc.structuredProfile?.partyA);
    assert.equal(contractDoc.structuredProfile?.focusedFieldDetails?.amount?.value, '￥120000');
    assert.equal(contractDoc.structuredProfile?.focusedFieldEntries?.[0]?.key, 'partyA');
    assert.equal(contractDoc.structuredProfile?.focusedFieldEntries?.[0]?.alias, '甲方');
    assert.equal(contractDoc.structuredProfile?.focusedFieldEntries?.[0]?.required, true);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
