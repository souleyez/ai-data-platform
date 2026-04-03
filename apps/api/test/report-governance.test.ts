import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-report-governance-test-'));
process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;

function importFresh<T>(specifier: string): Promise<T> {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`) as Promise<T>;
}

const governanceModule = await importFresh<typeof import('../src/lib/report-governance.js')>(
  '../src/lib/report-governance.js',
);

test.after(async () => {
  await fs.rm(storageRoot, { recursive: true, force: true });
  delete process.env.AI_DATA_PLATFORM_STORAGE_ROOT;
});

test('report governance should expose defaults and honor storage overrides', async () => {
  const defaultConfig = governanceModule.readReportGovernanceConfig();
  assert.equal(Array.isArray(defaultConfig.datasourceProfiles), true);
  assert.equal(Array.isArray(defaultConfig.templateProfiles), true);
  assert.equal(Array.isArray(defaultConfig.requestAdapterProfiles), true);

  const resumeProfile = governanceModule.resolveDatasourceGovernanceProfile('Resume candidates', 'resume-library');
  assert.equal(resumeProfile.id, 'resume');

  const defaultEnvelope = governanceModule.resolveTemplateEnvelopeProfile({
    type: 'static-page',
    label: 'Order Operations Page',
    description: '',
  });
  assert.equal(defaultEnvelope?.id, 'static-page-order');

  const requestAdapter = governanceModule.resolveRequestAdapterEnvelope({
    key: '订单分析',
    label: '订单分析',
    description: '订单经营知识库',
    triggerKeywords: ['订单', '库存'],
  }, 'page', '请按平台维度输出订单静态页');
  assert.equal(requestAdapter?.profileId, 'order');
  assert.equal(requestAdapter?.viewId, 'platform');
  assert.equal(requestAdapter?.kind, 'page');

  const overrideFile = path.join(storageRoot, 'control-plane', 'report-governance.json');
  await fs.mkdir(path.dirname(overrideFile), { recursive: true });
  await fs.writeFile(overrideFile, JSON.stringify({
    ...defaultConfig,
    datasourceProfiles: defaultConfig.datasourceProfiles.map((profile) => (
      profile.id === 'resume'
        ? { ...profile, defaultTemplateSuffix: 'ppt' }
        : profile
    )),
  }, null, 2), 'utf8');

  const overriddenProfile = governanceModule.resolveDatasourceGovernanceProfile('Resume candidates', 'resume-library');
  assert.equal(overriddenProfile.defaultTemplateSuffix, 'ppt');
});
