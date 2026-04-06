import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDocumentLibraryContext,
  loadDocumentExtractionGovernance,
  resolveDocumentExtractionProfile,
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
