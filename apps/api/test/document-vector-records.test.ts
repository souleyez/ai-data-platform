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

test('buildVectorRecordsForDocument should fold library aliases into canonical profile-field records', () => {
  const records = buildVectorRecordsForDocument({
    path: 'C:\\tmp\\contract-alias.md',
    name: 'contract-alias.md',
    title: '鍚堝悓 A',
    summary: '鍟嗗姟鏈嶅姟鍚堝悓',
    excerpt: '',
    ext: '.md',
    category: 'contract',
    bizCategory: 'contract',
    parseStatus: 'parsed',
    parseStage: 'detailed',
    extractedChars: 220,
    schemaType: 'contract',
    confirmedGroups: ['鍚堝悓鍗忚'],
    groups: ['鍚堝悓鍗忚'],
    topicTags: ['鍚堝悓'],
    structuredProfile: {
      partyA: '骞垮窞杞诲伐闆嗗洟',
      fieldTemplate: {
        fieldSet: 'contract',
        fieldAliases: {
          partyA: '鐢叉柟',
        },
      },
      aliasFields: {
        鐢叉柟: '骞垮窞杞诲伐闆嗗洟',
      },
      focusedAliasFields: {
        鐢叉柟: '骞垮窞杞诲伐闆嗗洟',
      },
    },
    evidenceChunks: [],
    claims: [],
  } as any);

  const partyARecord = records.find(
    (record) => record.kind === 'profile-field' && record.metadata.profileField === 'partyA',
  );

  assert.ok(partyARecord);
  assert.match(partyARecord!.text, /partyA/);
  assert.match(partyARecord!.text, /鐢叉柟/);
  assert.match(partyARecord!.text, /骞垮窞杞诲伐闆嗗洟/);
  assert.deepEqual(partyARecord!.metadata.profileAliases, ['鐢叉柟']);
  assert.deepEqual(partyARecord!.metadata.profileAliasValues, ['骞垮窞杞诲伐闆嗗洟']);

  const metadataOnlyRecord = records.find(
    (record) => record.kind === 'profile-field' && record.metadata.profileField === 'aliasFields',
  );
  assert.equal(metadataOnlyRecord, undefined);
});
