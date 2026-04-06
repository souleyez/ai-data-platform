import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  attachDocumentExtractionSettings,
  buildDocumentLibraryContext,
  deleteLibraryDocumentExtractionSettings,
  getDocumentLibraryExtractionSettings,
  loadDocumentExtractionGovernance,
  resolveDocumentExtractionProfile,
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
    });

    let config = loadDocumentExtractionGovernance();
    let settings = getDocumentLibraryExtractionSettings(config, {
      key: 'custom-guidance-library',
      label: '自定义指导库',
    });

    assert.equal(settings.profileId, 'library-custom-guidance-library');
    assert.equal(settings.fieldSet, 'enterprise-guidance');
    assert.equal(settings.fallbackSchemaType, 'technical');

    const attached = attachDocumentExtractionSettings([
      { key: 'custom-guidance-library', label: '自定义指导库' },
    ], config);
    assert.equal(attached[0]?.extractionSettings?.fieldSet, 'enterprise-guidance');

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
