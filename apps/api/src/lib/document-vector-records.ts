import { createHash } from 'node:crypto';
import type { ParsedDocument } from './document-parser.js';

export type DocumentVectorRecordKind =
  | 'summary'
  | 'profile'
  | 'profile-field'
  | 'evidence'
  | 'claim';

export type DocumentVectorRecord = {
  id: string;
  documentPath: string;
  documentName: string;
  schemaType: NonNullable<ParsedDocument['schemaType']>;
  parseStage: NonNullable<ParsedDocument['parseStage']>;
  kind: DocumentVectorRecordKind;
  text: string;
  metadata: Record<string, unknown>;
};

function normalizeText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function buildContextPrefix(item: ParsedDocument) {
  const groups = (item.confirmedGroups || item.groups || []).filter(Boolean).join(' ');
  const tags = (item.topicTags || []).filter(Boolean).join(' ');
  return [
    item.schemaType || 'generic',
    item.category || '',
    item.bizCategory || '',
    groups,
    tags,
  ]
    .filter(Boolean)
    .join(' ');
}

function buildTemplateTaskTags(item: ParsedDocument) {
  const tags = new Set<string>();

  if (item.bizCategory === 'order') {
    tags.add('order-static-page');
    tags.add('order-table');
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
  }
  if (item.schemaType === 'contract') {
    tags.add('contract-risk');
    tags.add('contract-table');
  }
  if (item.schemaType === 'report') {
    tags.add('report-dashboard');
    if (item.bizCategory === 'order') {
      tags.add('order-static-page');
      tags.add('order-table');
    }
  }

  const groupText = `${(item.confirmedGroups || []).join(' ')} ${(item.groups || []).join(' ')}`.toLowerCase();
  if (/(bids?|tender|标书|招标|投标)/.test(groupText)) {
    tags.add('bids-table');
    tags.add('bids-static-page');
  }

  return [...tags];
}

function stableHash(parts: Array<string | number | undefined>) {
  const hash = createHash('sha1');
  hash.update(parts.map((part) => String(part || '')).join('|'));
  return hash.digest('hex').slice(0, 20);
}

function buildRecord(
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

function joinProfileFields(profile: Record<string, unknown>) {
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

function buildFieldAliases(): Record<string, string[]> {
  return {
    candidateName: ['candidate', 'name', 'person'],
    yearsOfExperience: ['experience', 'work years', 'seniority'],
    education: ['degree', 'education', 'schooling', 'first degree'],
    latestCompany: ['company', 'employer', 'latest company', 'recent employer'],
    companies: ['company', 'employer', 'organization', 'work history', 'company history'],
    skills: ['core skills', 'capability', 'skillset', 'competency'],
    projectHighlights: ['project', 'project experience', 'delivery', 'implementation', 'project summary'],
    itProjectHighlights: ['it project', 'system project', 'platform project', 'api project', 'technology project'],
    methodology: ['study design', 'research method', 'method', 'trial design'],
    subjectType: ['population', 'subject', 'cohort', 'sample type'],
    metricSignals: ['metric', 'result metric', 'business metric', 'indicator'],
    publicationSignals: ['journal', 'publication', 'publisher', 'peer reviewed'],
    interfaceType: ['api type', 'interface', 'endpoint type'],
    deploymentMode: ['deploy mode', 'deployment', 'runtime mode'],
    integrationSignals: ['integration', 'integration points', 'connector'],
    moduleSignals: ['module', 'component', 'service'],
    ingredientSignals: ['ingredients', 'ingredient', 'actives'],
    strainSignals: ['strain', 'probiotic strain', 'bacteria'],
    targetScenario: ['scenario', 'use case', 'target scenario'],
    platformSignals: ['platform', 'channel', 'commerce platform'],
    categorySignals: ['category', 'sku category', 'product category'],
    replenishmentSignals: ['replenishment', 'restock', 'stock-up'],
    salesCycleSignals: ['sales cycle', 'weekly', 'monthly', 'quarterly', 'time period'],
    forecastSignals: ['forecast', 'prediction', 'sales forecast', 'demand planning'],
    anomalySignals: ['anomaly', 'volatility', 'alert', 'exception', 'abnormal swing'],
    operatingSignals: ['operating insight', 'business signal', 'operating recommendation', 'business recommendation'],
    keyMetrics: ['yoy', 'mom', 'inventory index', 'sell-through', 'gmv', 'revenue metric'],
    platforms: ['platform list', 'multi-platform', 'channel mix', 'platform mix'],
    productForm: ['product form', 'dosage form', 'presentation'],
    section: ['section', 'chapter', 'requirement section', 'response section'],
    responseFocus: ['response focus', 'response point', 'compliance point', 'answer point'],
    supplementaryMaterials: ['supplementary materials', 'attachments', 'required material', 'supporting documents'],
    riskNote: ['risk note', 'risk warning', 'compliance risk'],
    evidenceSource: ['evidence source', 'source clause', 'evidence reference'],
  };
}

function buildProfileFieldRecords(item: ParsedDocument, profile: Record<string, unknown>, baseMetadata: Record<string, unknown>) {
  const records: DocumentVectorRecord[] = [];
  const fieldAliases = buildFieldAliases();

  for (const [field, value] of Object.entries(profile)) {
    if (value == null) continue;

    if (Array.isArray(value)) {
      const normalizedValues = value.map((entry) => normalizeText(entry)).filter(Boolean).slice(0, 8);
      if (!normalizedValues.length) continue;
      const record = buildRecord(
        item,
        'profile-field',
        `${field} ${(fieldAliases[field] || []).join(' ')} ${item.schemaType || 'generic'} ${normalizedValues.join(' / ')}`,
        {
          ...baseMetadata,
          profileField: field,
          profileValueCount: normalizedValues.length,
          profileAliases: fieldAliases[field] || [],
        },
      );
      if (record) records.push(record);
      continue;
    }

    if (typeof value === 'object') {
      const compact = joinProfileFields(value as Record<string, unknown>);
      if (!compact) continue;
      const record = buildRecord(
        item,
        'profile-field',
        `${field} ${(fieldAliases[field] || []).join(' ')} ${item.schemaType || 'generic'} ${compact}`,
        {
          ...baseMetadata,
          profileField: field,
          profileAliases: fieldAliases[field] || [],
        },
      );
      if (record) records.push(record);
      continue;
    }

    const normalized = normalizeText(value);
    if (!normalized || normalized.length < 2) continue;
    const record = buildRecord(
      item,
      'profile-field',
      `${field} ${(fieldAliases[field] || []).join(' ')} ${item.schemaType || 'generic'} ${normalized}`,
      {
        ...baseMetadata,
        profileField: field,
        profileAliases: fieldAliases[field] || [],
      },
    );
    if (record) records.push(record);
  }

  return records;
}

function buildSyntheticTemplateFieldRecords(
  item: ParsedDocument,
  baseMetadata: Record<string, unknown>,
  contextPrefix: string,
) {
  const tasks = Array.isArray(baseMetadata.templateTasks)
    ? baseMetadata.templateTasks.map((entry) => String(entry))
    : [];
  const summaryText = normalizeText([item.title, item.summary, (item.topicTags || []).join(' ')].join(' '));
  if (!summaryText) return [] as DocumentVectorRecord[];

  const fieldAliases = buildFieldAliases();
  const syntheticFields: Array<{ field: string; enabled: boolean }> = [
    { field: 'section', enabled: tasks.includes('bids-table') || tasks.includes('bids-static-page') },
    { field: 'responseFocus', enabled: tasks.includes('bids-table') || tasks.includes('bids-static-page') },
    { field: 'supplementaryMaterials', enabled: tasks.includes('bids-table') || tasks.includes('bids-static-page') },
    { field: 'riskNote', enabled: tasks.includes('bids-table') || tasks.includes('bids-static-page') },
    { field: 'evidenceSource', enabled: tasks.includes('bids-table') || tasks.includes('bids-static-page') },
  ];

  return syntheticFields
    .filter((entry) => entry.enabled)
    .map((entry) =>
      buildRecord(
        item,
        'profile-field',
        `${contextPrefix} ${entry.field} ${(fieldAliases[entry.field] || []).join(' ')} ${summaryText}`,
        {
          ...baseMetadata,
          profileField: entry.field,
          profileAliases: fieldAliases[entry.field] || [],
          synthetic: true,
        },
      ),
    )
    .filter(Boolean) as DocumentVectorRecord[];
}

export function buildVectorRecordsForDocument(item: ParsedDocument): DocumentVectorRecord[] {
  if (item.parseStatus !== 'parsed') return [];
  if (item.parseStage !== 'detailed') return [];

  const records: DocumentVectorRecord[] = [];
  const contextPrefix = buildContextPrefix(item);
  const baseMetadata = {
    category: item.category,
    bizCategory: item.bizCategory,
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
