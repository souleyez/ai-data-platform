import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseDocument } from '../src/lib/document-parser.js';

test('parseDocument should extract xinshijie ioa enterprise guidance fields from library context', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-xinshijie-ioa-'));
  const filePath = path.join(tempDir, '新世界中国IT政策和守则.md');
  const content = [
    '# 新世界中国IT政策和守则 v2.0.0',
    '',
    '适用范围：适用于新世界中国区员工、合作伙伴及外包服务团队。',
    '系统登录：新中iOA 内网入口与外网入口均可使用。',
    '操作路径：iOA > 合同 > 付款 > 印章申请。',
    '审批流程：部门负责人 -> IT服务台 -> 集团审批。',
    '支持联系方式：ioa-support@example.com。',
    '本守则用于企业规范执行、系统操作要求与固定资产流程协同。',
  ].join('\n');

  try {
    await fs.writeFile(filePath, content, 'utf8');
    const doc = await parseDocument(filePath, undefined, {
      stage: 'detailed',
      libraryContext: {
        keys: ['xinshijie-ioa'],
        labels: ['新世界IOA'],
      },
    });

    assert.equal(doc.parseStatus, 'parsed');
    assert.equal(doc.schemaType, 'technical');
    assert.equal(doc.structuredProfile?.domain, 'technical');
    assert.ok(doc.enterpriseGuidanceFields);
    assert.equal(doc.enterpriseGuidanceFields?.businessSystem, 'IOA');
    assert.equal(doc.enterpriseGuidanceFields?.documentKind, 'policy-standard');
    assert.ok((doc.enterpriseGuidanceFields?.policyFocus || []).includes('企业规范'));
    assert.ok((doc.enterpriseGuidanceFields?.policyFocus || []).includes('IT治理'));
    assert.equal(doc.structuredProfile?.businessSystem, 'IOA');
    assert.equal(doc.structuredProfile?.documentKind, 'policy-standard');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
