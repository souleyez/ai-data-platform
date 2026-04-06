import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parseDocument } from '../src/lib/document-parser.js';

const fixtureDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../default-samples/assets');

test('document parse benchmark should keep core domains above baseline', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-parse-benchmark-'));

  try {
    const contractPath = path.join(tempDir, 'benchmark-contract.txt');
    const ioaPath = path.join(tempDir, 'benchmark-ioa.txt');

    await fs.writeFile(
      contractPath,
      [
        '合同编号：HT-2026-018',
        '甲方：广州轻工集团',
        '乙方：广州廉明建筑有限公司',
        '签订日期：2026-04-01',
        '生效日期：2026-04-02',
        '合同金额：¥120000',
      ].join('\n'),
      'utf8',
    );

    await fs.writeFile(
      ioaPath,
      [
        '新世界 IOA 系统 Q&A',
        '适用范围：非工程类合同流程',
        '操作入口：IOA > 合同 > 预算调整',
        '审批层级：部门负责人、集团审批',
        'IT 政策和守则适用于集团内部系统管理。',
      ].join('\n'),
      'utf8',
    );

    const cases = [
      {
        name: 'contract',
        path: contractPath,
        assert(doc) {
          assert.equal(doc.schemaType, 'contract');
          assert.equal(doc.structuredProfile?.contractNo, 'HT-2026-018');
          assert.equal(doc.structuredProfile?.partyA, '广州轻工集团');
        },
      },
      {
        name: 'resume',
        path: path.join(fixtureDir, 'resume-senior-ops-manager.md'),
        assert(doc) {
          assert.equal(doc.schemaType, 'resume');
          assert.ok(doc.structuredProfile?.latestCompany);
          assert.ok(Array.isArray(doc.structuredProfile?.skills));
        },
      },
      {
        name: 'ioa-guidance',
        path: ioaPath,
        assert(doc) {
          assert.equal(doc.schemaType, 'technical');
          assert.equal(doc.structuredProfile?.businessSystem, 'IOA');
          assert.ok((doc.structuredProfile?.policyFocus || []).includes('企业规范'));
        },
      },
      {
        name: 'order-table',
        path: path.join(fixtureDir, 'order-electronics-omni-1000-orders-q1-2026.csv'),
        assert(doc) {
          assert.equal(doc.schemaType, 'order');
          assert.equal(doc.structuredProfile?.tableSummary?.rowCount, 1000);
          assert.ok((doc.structuredProfile?.tableSummary?.columns || []).includes('order_id'));
        },
      },
    ];

    let passed = 0;
    for (const entry of cases) {
      const doc = await parseDocument(entry.path);
      entry.assert(doc);
      passed += 1;
    }

    assert.equal(passed, cases.length);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
});
