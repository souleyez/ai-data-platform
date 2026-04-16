import type { ParsedDocument } from './document-parser.js';
import type { DocumentVectorRecord } from './document-vector-records-types.js';
import {
  buildRecord,
  joinProfileFields,
  normalizeText,
} from './document-vector-records-support.js';

const PROFILE_FIELD_VECTOR_SKIP_SET = new Set([
  'fieldTemplate',
  'fieldDetails',
  'focusedFieldDetails',
  'focusedFieldEntries',
  'focusedFields',
  'aliasFieldDetails',
  'focusedAliasFieldDetails',
  'aliasFields',
  'focusedAliasFields',
]);

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
    resultSignals: ['result', 'finding', 'research result', 'conclusion signal'],
    interfaceType: ['api type', 'interface', 'endpoint type'],
    deploymentMode: ['deploy mode', 'deployment', 'runtime mode'],
    integrationSignals: ['integration', 'integration points', 'connector'],
    moduleSignals: ['module', 'component', 'service'],
    valueSignals: ['value', 'benefit', 'roi', 'business value'],
    benefitSignals: ['benefit', 'business benefit', 'outcome', 'gain'],
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
    totalFootfall: ['footfall total', 'visitor total', '客流总量', '总客流'],
    topMallZone: ['top mall zone', 'head zone', '核心分区', '头部分区', '商场分区'],
    mallZoneCount: ['mall zone count', 'zone count', '分区数', '商场分区数'],
    aggregationLevel: ['aggregation level', 'summary level', '汇总口径', '展示口径'],
    mallZones: ['mall zones', 'shopping zones', '商场分区', '分区列表'],
    productForm: ['product form', 'dosage form', 'presentation'],
    section: ['section', 'chapter', 'requirement section', 'response section'],
    responseFocus: ['response focus', 'response point', 'compliance point', 'answer point'],
    supplementaryMaterials: ['supplementary materials', 'attachments', 'required material', 'supporting documents'],
    riskNote: ['risk note', 'risk warning', 'compliance risk'],
    evidenceSource: ['evidence source', 'source clause', 'evidence reference'],
  };
}

function normalizeStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeText(entry)).filter(Boolean);
  }
  const normalized = normalizeText(value);
  return normalized ? [normalized] : [];
}

function shouldSkipProfileFieldForVectorization(field: string) {
  return PROFILE_FIELD_VECTOR_SKIP_SET.has(field);
}

function getLibraryFieldAliases(profile: Record<string, unknown>, field: string) {
  const fieldTemplate =
    profile.fieldTemplate && typeof profile.fieldTemplate === 'object'
      ? (profile.fieldTemplate as Record<string, unknown>)
      : null;
  const fieldAliases =
    fieldTemplate?.fieldAliases && typeof fieldTemplate.fieldAliases === 'object'
      ? (fieldTemplate.fieldAliases as Record<string, unknown>)
      : null;
  return normalizeStringArray(fieldAliases?.[field]);
}

function getAliasValuesForField(profile: Record<string, unknown>, field: string, aliasNames: string[]) {
  if (!aliasNames.length) return [];

  const aliasSources = [profile.focusedAliasFields, profile.aliasFields]
    .filter((entry) => entry && typeof entry === 'object') as Array<Record<string, unknown>>;

  const values = new Set<string>();
  for (const aliasName of aliasNames) {
    for (const source of aliasSources) {
      const aliasValue = normalizeText(source[aliasName]);
      if (aliasValue) values.add(aliasValue);
    }
  }

  return [...values];
}

export function buildProfileFieldRecords(
  item: ParsedDocument,
  profile: Record<string, unknown>,
  baseMetadata: Record<string, unknown>,
) {
  const records: DocumentVectorRecord[] = [];
  const fieldAliases = buildFieldAliases();

  for (const [field, value] of Object.entries(profile)) {
    if (shouldSkipProfileFieldForVectorization(field)) continue;
    if (value == null) continue;
    const builtInAliases = fieldAliases[field] || [];
    const libraryAliases = getLibraryFieldAliases(profile, field);
    const aliasValues = getAliasValuesForField(profile, field, libraryAliases);
    const allAliases = [...new Set([...builtInAliases, ...libraryAliases])];

    if (Array.isArray(value)) {
      const normalizedValues = value.map((entry) => normalizeText(entry)).filter(Boolean).slice(0, 8);
      if (!normalizedValues.length) continue;
      const record = buildRecord(
        item,
        'profile-field',
        [
          field,
          allAliases.join(' '),
          item.schemaType || 'generic',
          normalizedValues.join(' / '),
          aliasValues.join(' / '),
        ]
          .filter(Boolean)
          .join(' '),
        {
          ...baseMetadata,
          profileField: field,
          profileValueCount: normalizedValues.length,
          profileAliases: allAliases,
          profileAliasValues: aliasValues,
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
        [
          field,
          allAliases.join(' '),
          item.schemaType || 'generic',
          compact,
          aliasValues.join(' / '),
        ]
          .filter(Boolean)
          .join(' '),
        {
          ...baseMetadata,
          profileField: field,
          profileAliases: allAliases,
          profileAliasValues: aliasValues,
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
      [
        field,
        allAliases.join(' '),
        item.schemaType || 'generic',
        normalized,
        aliasValues.join(' / '),
      ]
        .filter(Boolean)
        .join(' '),
      {
        ...baseMetadata,
        profileField: field,
        profileAliases: allAliases,
        profileAliasValues: aliasValues,
      },
    );
    if (record) records.push(record);
  }

  return records;
}

export function buildSyntheticTemplateFieldRecords(
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
    { field: 'targetScenario', enabled: tasks.includes('iot-static-page') || tasks.includes('iot-table') },
    { field: 'moduleSignals', enabled: tasks.includes('iot-static-page') || tasks.includes('iot-table') },
    { field: 'interfaceType', enabled: tasks.includes('iot-static-page') || tasks.includes('iot-table') },
    { field: 'integrationSignals', enabled: tasks.includes('iot-static-page') || tasks.includes('iot-table') },
    { field: 'deploymentMode', enabled: tasks.includes('iot-static-page') || tasks.includes('iot-table') },
    { field: 'valueSignals', enabled: tasks.includes('iot-static-page') || tasks.includes('iot-table') },
    { field: 'benefitSignals', enabled: tasks.includes('iot-static-page') || tasks.includes('iot-table') },
    { field: 'metricSignals', enabled: tasks.includes('iot-static-page') || tasks.includes('iot-table') },
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
