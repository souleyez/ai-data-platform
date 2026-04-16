import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseDocument } from '../src/lib/document-parser.js';

test('parseDocument should prefer a candidate-name resume title over leading skill-list noise', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-resume-title-'));
  const filePath = path.join(tempDir, 'resume.txt');

  try {
    await fs.writeFile(filePath, [
      '技能：Java, Python, React, 微服务, ERP, 数据平台',
      '姓名：李明',
      '目标岗位：后端工程师',
      '工作经验：5年',
      '学历：本科',
      '最近公司：某科技有限公司',
      '项目经历：负责企业数据平台与 ERP 集成。',
    ].join('\n'), 'utf8');

    const doc = await parseDocument(filePath, undefined, { stage: 'detailed' });

    assert.equal(doc.schemaType, 'resume');
    assert.equal(doc.resumeFields?.candidateName, '李明');
    assert.equal(doc.title, '李明简历');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
