import type { ParsedDocument } from './document-parser.js';
import {
  buildProfileFieldRecords,
  buildSyntheticTemplateFieldRecords,
} from './document-vector-records-profile.js';
import {
  buildContextPrefix,
  buildRecord,
  buildTemplateTaskTags,
  joinProfileFields,
} from './document-vector-records-support.js';
import type { DocumentVectorRecord } from './document-vector-records-types.js';
export type {
  DocumentVectorRecord,
  DocumentVectorRecordKind,
} from './document-vector-records-types.js';

export function buildVectorRecordsForDocument(item: ParsedDocument): DocumentVectorRecord[] {
  if (item.parseStatus !== 'parsed') return [];
  if (item.parseStage !== 'detailed') return [];

  const records: DocumentVectorRecord[] = [];
  const contextPrefix = buildContextPrefix(item);
  const baseMetadata = {
    category: item.category,
    groups: item.confirmedGroups || item.groups || [],
    topicTags: item.topicTags || [],
    cloudStructuredAt: item.cloudStructuredAt,
    templateTasks: buildTemplateTaskTags(item),
  };

  const summaryRecord = buildRecord(
    item,
    'summary',
    [contextPrefix, item.title, item.summary].filter(Boolean).join('\n'),
    {
      ...baseMetadata,
      title: item.title,
    },
  );
  if (summaryRecord) records.push(summaryRecord);

  if (item.structuredProfile && typeof item.structuredProfile === 'object') {
    const profileDomain = (item.structuredProfile as Record<string, unknown>).domain;
    const profileRecord = buildRecord(
      item,
      'profile',
      [contextPrefix, joinProfileFields(item.structuredProfile as Record<string, unknown>)].filter(Boolean).join('\n'),
      {
        ...baseMetadata,
        profileDomain,
      },
    );
    if (profileRecord) records.push(profileRecord);

    records.push(
      ...buildProfileFieldRecords(item, item.structuredProfile as Record<string, unknown>, {
        ...baseMetadata,
        profileDomain,
      }),
    );
  }

  records.push(...buildSyntheticTemplateFieldRecords(item, baseMetadata, contextPrefix));

  for (const chunk of item.evidenceChunks || []) {
    const record = buildRecord(
      item,
      'evidence',
      [contextPrefix, chunk.title, chunk.text].filter(Boolean).join('\n'),
      {
        ...baseMetadata,
        chunkId: chunk.id,
        chunkTitle: chunk.title,
        chunkOrder: chunk.order,
      },
    );
    if (record) records.push(record);
  }

  for (const claim of item.claims || []) {
    const record = buildRecord(
      item,
      'claim',
      [contextPrefix, claim.subject, claim.predicate, claim.object].filter(Boolean).join(' '),
      {
        ...baseMetadata,
        predicate: claim.predicate,
        confidence: claim.confidence,
        evidenceChunkId: claim.evidenceChunkId,
      },
    );
    if (record) records.push(record);
  }

  return records;
}
