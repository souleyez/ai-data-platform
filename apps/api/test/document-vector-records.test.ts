import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVectorRecordsForDocument } from '../src/lib/document-vector-records.js';

test('buildVectorRecordsForDocument should synthesize iot template field records from summary text', () => {
  const records = buildVectorRecordsForDocument({
    path: 'C:\\tmp\\iot-architecture.md',
    name: 'iot-architecture.md',
    title: 'Smart Warehouse IOT Architecture',
    summary: 'Covers smart warehouse scenarios, edge gateways, REST APIs, cloud deployment, ROI, and inventory visibility.',
    excerpt: '',
    ext: '.md',
    category: 'technical',
    bizCategory: 'iot',
    parseStatus: 'parsed',
    parseStage: 'detailed',
    extractedChars: 320,
    schemaType: 'technical',
    confirmedGroups: ['IOT解决方案'],
    groups: ['IOT解决方案'],
    topicTags: ['智慧仓储', '设备接入'],
    structuredProfile: null,
    evidenceChunks: [],
    claims: [],
  } as any);

  const summaryRecord = records.find((record) => record.kind === 'summary');
  assert.ok(summaryRecord);
  assert.ok(Array.isArray(summaryRecord?.metadata?.templateTasks));
  assert.ok((summaryRecord?.metadata?.templateTasks as string[]).includes('iot-static-page'));
  assert.ok((summaryRecord?.metadata?.templateTasks as string[]).includes('iot-table'));

  const syntheticFields = records
    .filter((record) => record.kind === 'profile-field')
    .filter((record) => record.metadata.synthetic === true)
    .map((record) => String(record.metadata.profileField));

  assert.ok(syntheticFields.includes('targetScenario'));
  assert.ok(syntheticFields.includes('moduleSignals'));
  assert.ok(syntheticFields.includes('interfaceType'));
  assert.ok(syntheticFields.includes('integrationSignals'));
  assert.ok(syntheticFields.includes('deploymentMode'));
  assert.ok(syntheticFields.includes('valueSignals'));
  assert.ok(syntheticFields.includes('benefitSignals'));
  assert.ok(syntheticFields.includes('metricSignals'));
});
