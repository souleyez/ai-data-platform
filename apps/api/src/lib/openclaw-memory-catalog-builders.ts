import { loadParsedDocuments } from './document-store.js';
import { loadDocumentLibraries } from './document-libraries.js';
import { loadReportCenterStateWithOptions } from './report-center.js';
import { OPENCLAW_MEMORY_STATE_VERSION } from './openclaw-memory-changes.js';
import {
  buildCatalogDocumentSnapshots,
  buildCatalogMemoryDetail,
  resolveCatalogMemoryDetailLevel,
  selectCatalogMemoryTitle,
} from './openclaw-memory-catalog-documents.js';
import { buildReportOutputMemorySnapshots } from './openclaw-memory-catalog-outputs.js';
import { buildTemplateSnapshots } from './openclaw-memory-catalog-templates.js';
import type { OpenClawMemoryCatalogSnapshot } from './openclaw-memory-catalog-types.js';

const CATALOG_DOCUMENT_LIMIT = Math.max(1000, Number(process.env.OPENCLAW_MEMORY_CATALOG_DOCUMENT_LIMIT || 20000));

export {
  buildCatalogMemoryDetail,
  resolveCatalogMemoryDetailLevel,
  selectCatalogMemoryTitle,
} from './openclaw-memory-catalog-documents.js';
export {
  buildReportOutputMemorySnapshots,
  buildReportOutputMemorySnapshots as buildCatalogOutputSnapshots,
} from './openclaw-memory-catalog-outputs.js';

export async function buildOpenClawMemoryCatalogSnapshot(): Promise<OpenClawMemoryCatalogSnapshot> {
  const [libraries, loadedDocuments, reportCenterState] = await Promise.all([
    loadDocumentLibraries(),
    loadParsedDocuments(CATALOG_DOCUMENT_LIMIT, false, undefined, {
      skipBackgroundTasks: true,
    }),
    loadReportCenterStateWithOptions({
      refreshDynamicPages: false,
      persistFixups: false,
    }),
  ]);

  const { cards, librarySnapshots } = buildCatalogDocumentSnapshots({
    libraries,
    documents: loadedDocuments.items,
  });
  const templateSnapshots = buildTemplateSnapshots(reportCenterState);
  const outputSnapshots = buildReportOutputMemorySnapshots(reportCenterState.outputs);

  return {
    version: OPENCLAW_MEMORY_STATE_VERSION,
    generatedAt: new Date().toISOString(),
    libraryCount: librarySnapshots.length,
    documentCount: cards.length,
    templateCount: templateSnapshots.length,
    outputCount: outputSnapshots.length,
    libraries: librarySnapshots.sort((left, right) => right.documentCount - left.documentCount || left.label.localeCompare(right.label, 'zh-CN')),
    documents: cards,
    templates: templateSnapshots,
    outputs: outputSnapshots,
  };
}
