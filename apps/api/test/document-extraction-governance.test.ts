import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  applyDocumentExtractionFieldGovernance,
  attachDocumentExtractionSettings,
  buildDocumentLibraryContext,
  deleteLibraryDocumentExtractionSettings,
  getDocumentLibraryExtractionSettings,
  loadDocumentExtractionGovernance,
  normalizeDocumentExtractionFieldValues,
  resolveDocumentExtractionProfile,
  resolveDocumentExtractionConflictValues,
  updateLibraryDocumentExtractionSettings,
} from '../src/lib/document-extraction-governance.js';

test('document extraction governance should resolve profile from library context', () => {
  const governance = loadDocumentExtractionGovernance();
  const context = buildDocumentLibraryContext(
    [
      { key: 'contract', label: '合同协议' },
      { key: 'order', label: '订单分析' },
    ],
    ['contract'],
  );

  const profile = resolveDocumentExtractionProfile(governance, context);

  assert.ok(profile);
  assert.equal(profile?.id, 'contract-standard');
  assert.equal(profile?.fieldSet, 'contract');
  assert.equal(profile?.fallbackSchemaType, 'contract');
  assert.deepEqual(profile?.preferredFieldKeys, ['partyA', 'partyB', 'amount', 'signDate', 'paymentTerms']);
  assert.deepEqual(profile?.requiredFieldKeys, ['partyA', 'partyB', 'amount']);
  assert.equal(profile?.fieldAliases?.partyA, '甲方');
});

test('document extraction governance should resolve xinshijie ioa library profile', () => {
  const governance = loadDocumentExtractionGovernance();
  const context = buildDocumentLibraryContext(
    [
      { key: 'xinshijie-ioa', label: '新世界IOA' },
    ],
    ['xinshijie-ioa'],
  );

  const profile = resolveDocumentExtractionProfile(governance, context);

  assert.ok(profile);
  assert.equal(profile?.id, 'xinshijie-ioa-guidance');
  assert.equal(profile?.fieldSet, 'enterprise-guidance');
  assert.equal(profile?.fallbackSchemaType, 'technical');
  assert.deepEqual(profile?.requiredFieldKeys, ['businessSystem', 'documentKind', 'operationEntry']);
  assert.equal(profile?.fieldAliases?.approvalLevels, '审批层级');
  assert.ok(profile?.fieldPrompts?.operationEntry);
  assert.ok(profile?.fieldNormalizationRules?.businessSystem?.includes('新中iOA=>IOA'));
  assert.equal(profile?.fieldConflictStrategies?.approvalLevels, 'merge-distinct');
});

test('document extraction governance should upsert and remove library-specific override settings', async () => {
  const storageFile = path.join(process.cwd(), 'storage', 'config', 'document-extraction-governance.json');
  const previous = existsSync(storageFile) ? readFileSync(storageFile, 'utf8') : null;

  try {
    await updateLibraryDocumentExtractionSettings({
      key: 'custom-guidance-library',
      label: '自定义指导库',
      fieldSet: 'enterprise-guidance',
      fallbackSchemaType: 'technical',
      preferredFieldKeys: ['businessSystem', 'policyFocus'],
      requiredFieldKeys: ['businessSystem'],
      fieldAliases: {
        businessSystem: '业务系统',
        policyFocus: '规范重点',
      },
      fieldPrompts: {
        businessSystem: '统一提取业务系统',
      },
      fieldNormalizationRules: {
        businessSystem: ['新中iOA=>IOA'],
      },
      fieldConflictStrategies: {
        policyFocus: 'merge-distinct',
      },
    });

    let config = loadDocumentExtractionGovernance();
    let settings = getDocumentLibraryExtractionSettings(config, {
      key: 'custom-guidance-library',
      label: '自定义指导库',
    });

    assert.equal(settings.profileId, 'library-custom-guidance-library');
    assert.equal(settings.fieldSet, 'enterprise-guidance');
    assert.equal(settings.fallbackSchemaType, 'technical');
    assert.deepEqual(settings.preferredFieldKeys, ['businessSystem', 'policyFocus']);
    assert.deepEqual(settings.requiredFieldKeys, ['businessSystem']);
    assert.equal(settings.fieldAliases?.businessSystem, '业务系统');
    assert.equal(settings.fieldAliases?.policyFocus, '规范重点');
    assert.equal(settings.fieldPrompts?.businessSystem, '统一提取业务系统');
    assert.deepEqual(settings.fieldNormalizationRules?.businessSystem, ['新中iOA=>IOA']);
    assert.equal(settings.fieldConflictStrategies?.policyFocus, 'merge-distinct');

    const attached = attachDocumentExtractionSettings([
      { key: 'custom-guidance-library', label: '自定义指导库' },
    ], config);
    assert.equal(attached[0]?.extractionSettings?.fieldSet, 'enterprise-guidance');
    assert.deepEqual(attached[0]?.extractionSettings?.preferredFieldKeys, ['businessSystem', 'policyFocus']);
    assert.deepEqual(attached[0]?.extractionSettings?.requiredFieldKeys, ['businessSystem']);
    assert.equal(attached[0]?.extractionSettings?.fieldAliases?.policyFocus, '规范重点');
    assert.equal(attached[0]?.extractionSettings?.fieldPrompts?.businessSystem, '统一提取业务系统');
    assert.deepEqual(attached[0]?.extractionSettings?.fieldNormalizationRules?.businessSystem, ['新中iOA=>IOA']);
    assert.equal(attached[0]?.extractionSettings?.fieldConflictStrategies?.policyFocus, 'merge-distinct');

    await updateLibraryDocumentExtractionSettings({
      key: 'custom-guidance-library',
      label: '自定义指导库',
      fieldSet: 'auto',
      fallbackSchemaType: 'auto',
    });

    config = loadDocumentExtractionGovernance();
    settings = getDocumentLibraryExtractionSettings(config, {
      key: 'custom-guidance-library',
      label: '自定义指导库',
    });
    assert.deepEqual(settings, {});

    await updateLibraryDocumentExtractionSettings({
      key: 'order-custom',
      label: '订单运营',
      fallbackSchemaType: 'order',
    });

    config = loadDocumentExtractionGovernance();
    settings = getDocumentLibraryExtractionSettings(config, {
      key: 'order-custom',
      label: '订单运营',
    });
    assert.equal(settings.fieldSet, 'order');
    assert.equal(settings.fallbackSchemaType, 'order');

    await deleteLibraryDocumentExtractionSettings('order-custom');
    config = loadDocumentExtractionGovernance();
    settings = getDocumentLibraryExtractionSettings(config, {
      key: 'order-custom',
      label: '订单运营',
    });
    assert.deepEqual(settings, {});
  } finally {
    if (previous === null) {
      await fs.rm(storageFile, { force: true }).catch(() => undefined);
    } else {
      await fs.mkdir(path.dirname(storageFile), { recursive: true });
      await fs.writeFile(storageFile, previous, 'utf8');
    }
  }
});

test('document extraction governance should normalize field values and resolve conflicts', () => {
  const profile = {
    fieldNormalizationRules: {
      businessSystem: ['新中iOA=>IOA', '新世界IOA=>IOA'],
    },
    fieldConflictStrategies: {
      businessSystem: 'keep-last',
      approvalLevels: 'merge-distinct',
    },
  } as const;

  assert.deepEqual(
    normalizeDocumentExtractionFieldValues('businessSystem', ['新中iOA', 'IOA'], profile),
    ['IOA'],
  );
  assert.deepEqual(
    resolveDocumentExtractionConflictValues('businessSystem', ['ERP', 'IOA'], profile),
    ['IOA'],
  );
  assert.deepEqual(
    applyDocumentExtractionFieldGovernance({
      businessSystem: '新中iOA',
      approvalLevels: ['部门负责人', '部门负责人', '集团审批'],
    }, profile),
    {
      businessSystem: 'IOA',
      approvalLevels: ['部门负责人', '集团审批'],
    },
  );
});
