import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseDocument } from '../src/lib/document-parser.js';

test('parseDocument should extract enterprise guidance fields from IOA guidance text', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-ioa-'));
  const filePath = path.join(tempDir, 'ioa-guide.md');
  const content = [
    '# 新中IOA应用技巧',
    '',
    '适用范围：非工程合同预算调整申请。',
    '系统登录：IOA 内网入口与外网入口均可使用。',
    '操作路径：IOA > 合同 > 预算调整。',
    '审批流程：部门负责人 -> 集团审批。',
    '支持联系方式：ioa-support@example.com。',
    '本指引用于企业规范执行与常见问题处理。',
  ].join('\n');

  try {
    await fs.writeFile(filePath, content, 'utf8');
    const doc = await parseDocument(filePath, undefined, { stage: 'detailed' });

    assert.equal(doc.parseStatus, 'parsed');
    assert.equal(doc.schemaType, 'technical');
    assert.ok(doc.enterpriseGuidanceFields);
    assert.equal(doc.enterpriseGuidanceFields?.businessSystem, 'IOA');
    assert.ok(['faq', 'operation-guide', 'approval-flow', 'guidance'].includes(String(doc.enterpriseGuidanceFields?.documentKind || '')));
    assert.ok((doc.enterpriseGuidanceFields?.policyFocus || []).includes('企业规范'));
    assert.ok((doc.topicTags || []).includes('审批流程'));
    assert.equal(doc.structuredProfile?.businessSystem, 'IOA');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
