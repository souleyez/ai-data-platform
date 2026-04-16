import { createHash } from 'node:crypto';
import type { ParsedDocument } from './document-parser.js';
import {
  isFootfallDocumentSignal,
  isInventoryDocumentSignal,
  isIotDocumentSignal,
  isOrderDocumentSignal,
} from './document-domain-signals.js';
import type { DocumentVectorRecord, DocumentVectorRecordKind } from './document-vector-records-types.js';

export function normalizeText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function buildContextPrefix(item: ParsedDocument) {
  const groups = (item.confirmedGroups || item.groups || []).filter(Boolean).join(' ');
  const tags = (item.topicTags || []).filter(Boolean).join(' ');
  return [
    item.schemaType || 'generic',
    item.category || '',
    groups,
    tags,
  ]
    .filter(Boolean)
    .join(' ');
}

export function buildTemplateTaskTags(item: ParsedDocument) {
  const tags = new Set<string>();

  if (isOrderDocumentSignal(item) || isInventoryDocumentSignal(item)) {
    tags.add('order-static-page');
    tags.add('order-table');
  }
  if (isFootfallDocumentSignal(item)) {
    tags.add('footfall-static-page');
    tags.add('footfall-table');
  }
  if (item.schemaType === 'formula') {
    tags.add('formula-table');
    tags.add('formula-static-page');
  }
  if (item.schemaType === 'resume') {
    tags.add('resume-comparison');
    tags.add('resume-table');
  }
  if (item.schemaType === 'technical') {
    tags.add('technical-summary');
    tags.add('technical-runbook');
  }
  if (item.schemaType === 'paper') {
    tags.add('paper-evidence');
    tags.add('paper-summary');
    tags.add('paper-static-page');
    tags.add('paper-table');
  }
  if (item.schemaType === 'contract') {
    tags.add('contract-risk');
    tags.add('contract-table');
  }
  if (item.schemaType === 'report') {
    tags.add('report-dashboard');
    if (isOrderDocumentSignal(item) || isInventoryDocumentSignal(item)) {
      tags.add('order-static-page');
      tags.add('order-table');
    }
    if (isFootfallDocumentSignal(item)) {
      tags.add('footfall-static-page');
      tags.add('footfall-table');
    }
  }

  const groupText = `${(item.confirmedGroups || []).join(' ')} ${(item.groups || []).join(' ')}`.toLowerCase();
  if (/(bids?|tender|标书|招标|投标)/.test(groupText)) {
    tags.add('bids-table');
    tags.add('bids-static-page');
  }
  if (/(iot|物联网|设备|网关|解决方案)/.test(groupText) || isIotDocumentSignal(item)) {
    tags.add('iot-static-page');
    tags.add('iot-table');
  }

  return [...tags];
}

function stableHash(parts: Array<string | number | undefined>) {
  const hash = createHash('sha1');
  hash.update(parts.map((part) => String(part || '')).join('|'));
  return hash.digest('hex').slice(0, 20);
}

export function buildRecord(
  item: ParsedDocument,
  kind: DocumentVectorRecordKind,
  text: string,
  metadata: Record<string, unknown>,
) {
  const normalizedText = normalizeText(text);
  if (!normalizedText) return null;

  return {
    id: stableHash([item.path, kind, normalizedText]),
    documentPath: item.path,
    documentName: item.name,
    schemaType: item.schemaType || 'generic',
    parseStage: item.parseStage || 'quick',
    kind,
    text: normalizedText,
    metadata,
  } satisfies DocumentVectorRecord;
}

export function joinProfileFields(profile: Record<string, unknown>) {
  return Object.entries(profile)
    .flatMap(([key, value]) => {
      if (Array.isArray(value)) {
        const joined = value.map((entry) => normalizeText(entry)).filter(Boolean).join(' / ');
        return joined ? `${key}: ${joined}` : [];
      }

      const normalized = normalizeText(value);
      return normalized ? `${key}: ${normalized}` : [];
    })
    .join('\n');
}
