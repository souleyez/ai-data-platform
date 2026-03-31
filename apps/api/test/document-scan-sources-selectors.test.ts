import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDirectoryOptions } from '../../web/app/documents/selectors.js';

test('buildDirectoryOptions should flatten hotspot child directories into selectable options', () => {
  const candidateSources = [
    {
      key: 'documents',
      label: 'Documents',
      reason: '系统默认文档目录',
      path: 'C:/Users/demo/Documents',
      exists: true,
      fileCount: 12,
      latestModifiedAt: 1711111111111,
      truncated: false,
      pendingScan: false,
      sampleExtensions: ['.pdf', '.docx'],
      discoverySource: 'seed',
      discoveryExplanation: '系统兜底目录：系统默认文档目录。已检测到 12 个可扫描文件。',
      hotspots: [
        {
          key: 'documents-hotspot-contracts',
          label: 'Contracts',
          reason: 'Documents 下文档更集中的子目录',
          path: 'C:/Users/demo/Documents/Contracts',
          exists: true,
          fileCount: 6,
          latestModifiedAt: 1711111110000,
          truncated: false,
          pendingScan: false,
          sampleExtensions: ['.pdf'],
          discoverySource: 'hotspot',
          discoveryExplanation: '热点子目录：Documents 下文档更集中的子目录。已检测到 6 个可扫描文件。',
          sourceKey: 'documents',
          sourceLabel: 'Documents',
        },
      ],
    },
  ];

  const options = buildDirectoryOptions({
    candidateSources,
    scanSources: ['C:/Users/demo/Documents/Contracts'],
    scanRoot: 'C:/Users/demo/Documents',
  });

  const rootOption = options.find((item) => item.path === 'C:/Users/demo/Documents');
  const hotspotOption = options.find((item) => item.path === 'C:/Users/demo/Documents/Contracts');

  assert.ok(rootOption);
  assert.equal(rootOption?.alreadyAdded, false);
  assert.deepEqual(rootOption?.sampleExtensions, ['.pdf', '.docx']);
  assert.match(rootOption?.discoveryExplanation || '', /系统兜底目录/);

  assert.ok(hotspotOption);
  assert.equal(hotspotOption?.alreadyAdded, true);
  assert.equal(hotspotOption?.hotspot, true);
  assert.equal(hotspotOption?.label, 'Documents / Contracts');
  assert.deepEqual(hotspotOption?.sampleExtensions, ['.pdf']);
  assert.match(hotspotOption?.discoveryExplanation || '', /热点子目录/);
});
