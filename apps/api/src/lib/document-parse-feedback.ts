import { existsSync, readFileSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { STORAGE_CONFIG_DIR } from './paths.js';

export type DocumentParseFeedbackSchemaType = 'contract' | 'resume' | 'technical' | 'order';

type FeedbackFieldKind = 'single' | 'multi';

type FeedbackFieldDefinition = {
  name: string;
  kind: FeedbackFieldKind;
};

type DocumentParseFeedbackLibrarySchema = {
  fields: Record<string, string[]>;
};

type DocumentParseFeedbackLibraryEntry = {
  schemas: Partial<Record<DocumentParseFeedbackSchemaType, DocumentParseFeedbackLibrarySchema>>;
};

export type DocumentParseFeedbackStore = {
  version: number;
  updatedAt: string;
  libraries: Record<string, DocumentParseFeedbackLibraryEntry>;
};

type CollectInput = Record<string, unknown> | null | undefined;

type ApplyInput<T extends Record<string, unknown>> = {
  feedback: DocumentParseFeedbackStore;
  libraryKeys: string[];
  schemaType?: string;
  text: string;
  fields?: T;
};

type RecordInput = {
  libraryKeys: string[];
  schemaType?: string;
  structuredProfile?: Record<string, unknown> | null;
};

type SnapshotInput = {
  feedback?: DocumentParseFeedbackStore;
  libraryKeys: string[];
  schemaType?: string;
  text?: string;
};

type ClearInput = {
  libraryKeys: string[];
  schemaType?: string;
  fieldName?: string;
  feedback?: DocumentParseFeedbackStore;
};

export type DocumentParseFeedbackSnapshotField = {
  name: string;
  values: string[];
  valueCount: number;
  matchedValues: string[];
  matchedValueCount: number;
};

export type DocumentParseFeedbackSnapshot = {
  schemaType: DocumentParseFeedbackSchemaType;
  libraryKeys: string[];
  updatedAt: string;
  fieldCount: number;
  totalValueCount: number;
  matchedFieldCount: number;
  fields: DocumentParseFeedbackSnapshotField[];
};

const DOCUMENT_PARSE_FEEDBACK_FILE = path.join(STORAGE_CONFIG_DIR, 'document-parse-feedback.json');
const CONFIG_VERSION = 1;

const FEEDBACK_FIELD_DEFINITIONS: Record<DocumentParseFeedbackSchemaType, FeedbackFieldDefinition[]> = {
  contract: [
    { name: 'partyA', kind: 'single' },
    { name: 'partyB', kind: 'single' },
    { name: 'paymentTerms', kind: 'single' },
    { name: 'duration', kind: 'single' },
  ],
  resume: [
    { name: 'targetRole', kind: 'single' },
    { name: 'currentRole', kind: 'single' },
    { name: 'latestCompany', kind: 'single' },
    { name: 'expectedCity', kind: 'single' },
    { name: 'skills', kind: 'multi' },
  ],
  technical: [
    { name: 'businessSystem', kind: 'single' },
    { name: 'documentKind', kind: 'single' },
    { name: 'applicableScope', kind: 'single' },
    { name: 'operationEntry', kind: 'single' },
    { name: 'approvalLevels', kind: 'multi' },
    { name: 'policyFocus', kind: 'multi' },
    { name: 'contacts', kind: 'multi' },
  ],
  order: [
    { name: 'platform', kind: 'single' },
    { name: 'topCategory', kind: 'single' },
    { name: 'inventoryStatus', kind: 'single' },
    { name: 'replenishmentAction', kind: 'single' },
  ],
};

function normalizeText(value: unknown) {
  return String(value ?? '').trim();
}

function normalizeLibraryKeys(values: string[]) {
  return [...new Set((values || []).map((item) => normalizeText(item)).filter(Boolean))];
}

function normalizeSchemaType(value: unknown): DocumentParseFeedbackSchemaType | undefined {
  const normalized = normalizeText(value);
  return normalized === 'contract'
    || normalized === 'resume'
    || normalized === 'technical'
    || normalized === 'order'
    ? normalized
    : undefined;
}

function normalizeFeedbackValues(value: unknown, kind: FeedbackFieldKind) {
  const values = kind === 'multi'
    ? (Array.isArray(value) ? value : [])
    : [value];
  return [...new Set(
    values
      .map((item) => normalizeText(item))
      .filter(Boolean),
  )].slice(0, 20);
}

function normalizeStore(input: unknown): DocumentParseFeedbackStore {
  const source = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const librariesSource = source.libraries && typeof source.libraries === 'object' && !Array.isArray(source.libraries)
    ? source.libraries as Record<string, unknown>
    : {};

  const libraries = Object.fromEntries(
    Object.entries(librariesSource).map(([libraryKey, libraryValue]) => {
      const schemasSource = libraryValue && typeof libraryValue === 'object' && !Array.isArray(libraryValue)
        ? ((libraryValue as Record<string, unknown>).schemas && typeof (libraryValue as Record<string, unknown>).schemas === 'object' && !Array.isArray((libraryValue as Record<string, unknown>).schemas)
          ? (libraryValue as { schemas: Record<string, unknown> }).schemas
          : {})
        : {};
      const schemas = Object.fromEntries(
        Object.entries(schemasSource)
          .map(([schemaKey, schemaValue]) => {
            const schemaType = normalizeSchemaType(schemaKey);
            if (!schemaType) return null;
            const fieldSource = schemaValue && typeof schemaValue === 'object' && !Array.isArray(schemaValue)
              ? ((schemaValue as Record<string, unknown>).fields && typeof (schemaValue as Record<string, unknown>).fields === 'object' && !Array.isArray((schemaValue as Record<string, unknown>).fields)
                ? (schemaValue as { fields: Record<string, unknown> }).fields
                : {})
              : {};
            const definitions = FEEDBACK_FIELD_DEFINITIONS[schemaType];
            const fields = Object.fromEntries(
              definitions
                .map((definition) => [definition.name, normalizeFeedbackValues(fieldSource[definition.name], definition.kind)] as const)
                .filter(([, values]) => values.length),
            );
            return Object.keys(fields).length ? [schemaType, { fields }] : null;
          })
          .filter((entry): entry is [DocumentParseFeedbackSchemaType, DocumentParseFeedbackLibrarySchema] => Boolean(entry)),
      );
      return Object.keys(schemas).length ? [libraryKey, { schemas }] : null;
    }).filter((entry): entry is [string, DocumentParseFeedbackLibraryEntry] => Boolean(entry)),
  );

  return {
    version: Number(source.version) || CONFIG_VERSION,
    updatedAt: normalizeText(source.updatedAt) || new Date().toISOString(),
    libraries,
  };
}

function createEmptyStore(): DocumentParseFeedbackStore {
  return {
    version: CONFIG_VERSION,
    updatedAt: new Date().toISOString(),
    libraries: {},
  };
}

function readJsonObject(filePath: string) {
  return JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>;
}

function normalizeTextForMatch(value: string) {
  return normalizeText(value).toLowerCase().replace(/\s+/g, '');
}

function hasMeaningfulValue(value: unknown) {
  if (Array.isArray(value)) return value.some((item) => normalizeText(item));
  return normalizeText(value).length > 0;
}

function mergeFeedbackValues(existing: string[], incoming: string[]) {
  return [...new Set([...incoming, ...existing])].slice(0, 20);
}

function collectFieldMap(schemaType: DocumentParseFeedbackSchemaType, input: CollectInput) {
  if (!input) return {};
  const definitions = FEEDBACK_FIELD_DEFINITIONS[schemaType];
  return Object.fromEntries(
    definitions
      .map((definition) => [definition.name, normalizeFeedbackValues(input[definition.name], definition.kind)] as const)
      .filter(([, values]) => values.length),
  ) as Record<string, string[]>;
}

function mergeLibrarySchemaFields(
  target: DocumentParseFeedbackLibrarySchema | undefined,
  incoming: Record<string, string[]>,
) {
  const nextFields = { ...(target?.fields || {}) };
  let changed = false;

  for (const [fieldName, values] of Object.entries(incoming)) {
    const merged = mergeFeedbackValues(nextFields[fieldName] || [], values);
    if (JSON.stringify(merged) !== JSON.stringify(nextFields[fieldName] || [])) {
      nextFields[fieldName] = merged;
      changed = true;
    }
  }

  return {
    changed,
    schema: {
      fields: nextFields,
    } satisfies DocumentParseFeedbackLibrarySchema,
  };
}

function collectVisibleFeedbackValues(
  feedback: DocumentParseFeedbackStore,
  libraryKeys: string[],
  schemaType: DocumentParseFeedbackSchemaType,
) {
  const aggregated: Record<string, string[]> = {};

  for (const libraryKey of normalizeLibraryKeys(libraryKeys)) {
    const schema = feedback.libraries[libraryKey]?.schemas?.[schemaType];
    if (!schema) continue;
    for (const [fieldName, values] of Object.entries(schema.fields || {})) {
      aggregated[fieldName] = [...new Set([...(aggregated[fieldName] || []), ...values])];
    }
  }

  return aggregated;
}

function buildFeedbackSnapshot(input: SnapshotInput) {
  const schemaType = normalizeSchemaType(input.schemaType);
  const libraryKeys = normalizeLibraryKeys(input.libraryKeys);
  if (!schemaType || !libraryKeys.length) return null;

  const feedback = input.feedback || loadDocumentParseFeedback();
  const visibleValues = collectVisibleFeedbackValues(feedback, libraryKeys, schemaType);
  const normalizedText = normalizeTextForMatch(String(input.text || ''));
  const fields = Object.entries(visibleValues)
    .map(([name, values]) => {
      const matchedValues = values.filter((value) => {
        const normalizedValue = normalizeTextForMatch(value);
        return normalizedValue && normalizedText.includes(normalizedValue);
      });
      return {
        name,
        values,
        valueCount: values.length,
        matchedValues,
        matchedValueCount: matchedValues.length,
      } satisfies DocumentParseFeedbackSnapshotField;
    })
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));

  return {
    schemaType,
    libraryKeys,
    updatedAt: feedback.updatedAt,
    fieldCount: fields.length,
    totalValueCount: fields.reduce((sum, field) => sum + field.valueCount, 0),
    matchedFieldCount: fields.filter((field) => field.matchedValueCount > 0).length,
    fields,
  } satisfies DocumentParseFeedbackSnapshot;
}

export function loadDocumentParseFeedback() {
  return existsSync(DOCUMENT_PARSE_FEEDBACK_FILE)
    ? normalizeStore(readJsonObject(DOCUMENT_PARSE_FEEDBACK_FILE))
    : createEmptyStore();
}

export async function saveDocumentParseFeedback(feedback: DocumentParseFeedbackStore) {
  await fs.mkdir(STORAGE_CONFIG_DIR, { recursive: true });
  await fs.writeFile(
    DOCUMENT_PARSE_FEEDBACK_FILE,
    JSON.stringify({
      ...feedback,
      version: CONFIG_VERSION,
      updatedAt: new Date().toISOString(),
    }, null, 2),
    'utf8',
  );
}

export function collectDocumentParseFeedbackValues(
  schemaType?: string,
  structuredProfile?: CollectInput,
) {
  const normalizedSchemaType = normalizeSchemaType(schemaType);
  if (!normalizedSchemaType || !structuredProfile) return {};
  return collectFieldMap(normalizedSchemaType, structuredProfile);
}

export function applyDocumentParseFeedbackToFields<T extends Record<string, unknown>>(input: ApplyInput<T>) {
  const schemaType = normalizeSchemaType(input.schemaType);
  if (!schemaType) return input.fields;

  const candidateValues = collectVisibleFeedbackValues(input.feedback, input.libraryKeys, schemaType);
  if (!Object.keys(candidateValues).length) return input.fields;

  const definitions = FEEDBACK_FIELD_DEFINITIONS[schemaType];
  const nextFields = { ...(input.fields || {}) } as Record<string, unknown>;
  const normalizedText = normalizeTextForMatch(input.text);
  let changed = false;

  for (const definition of definitions) {
    if (hasMeaningfulValue(nextFields[definition.name])) continue;

    const matchedValues = (candidateValues[definition.name] || []).filter((value) => {
      const normalizedValue = normalizeTextForMatch(value);
      return normalizedValue && normalizedText.includes(normalizedValue);
    });
    if (!matchedValues.length) continue;

    nextFields[definition.name] = definition.kind === 'multi' ? matchedValues : matchedValues[0];
    changed = true;
  }

  if (!input.fields && !changed) return undefined;
  return changed ? nextFields as T : input.fields;
}

export function applyDocumentParseFeedback<T extends Record<string, unknown>>(input: Omit<ApplyInput<T>, 'feedback'>) {
  return applyDocumentParseFeedbackToFields({
    ...input,
    feedback: loadDocumentParseFeedback(),
  });
}

export function getDocumentParseFeedbackSnapshot(input: SnapshotInput) {
  return buildFeedbackSnapshot({
    ...input,
    feedback: input.feedback || loadDocumentParseFeedback(),
  });
}

export async function recordDocumentParseFeedback(input: RecordInput) {
  const schemaType = normalizeSchemaType(input.schemaType);
  const libraryKeys = normalizeLibraryKeys(input.libraryKeys);
  if (!schemaType || !libraryKeys.length || !input.structuredProfile) return false;

  const fieldValues = collectFieldMap(schemaType, input.structuredProfile);
  if (!Object.keys(fieldValues).length) return false;

  const current = loadDocumentParseFeedback();
  const next: DocumentParseFeedbackStore = {
    ...current,
    libraries: { ...current.libraries },
  };
  let changed = false;

  for (const libraryKey of libraryKeys) {
    const currentLibrary = next.libraries[libraryKey] || { schemas: {} };
    const merged = mergeLibrarySchemaFields(currentLibrary.schemas[schemaType], fieldValues);
    if (!merged.changed) continue;
    next.libraries[libraryKey] = {
      schemas: {
        ...currentLibrary.schemas,
        [schemaType]: merged.schema,
      },
    };
    changed = true;
  }

  if (!changed) return false;
  await saveDocumentParseFeedback(next);
  return true;
}

export async function clearDocumentParseFeedback(input: ClearInput) {
  const schemaType = normalizeSchemaType(input.schemaType);
  const libraryKeys = normalizeLibraryKeys(input.libraryKeys);
  if (!schemaType || !libraryKeys.length) {
    return {
      changed: false,
      clearedFieldCount: 0,
      clearedLibraryCount: 0,
      snapshot: null,
    };
  }

  const fieldName = normalizeText(input.fieldName);
  const current = input.feedback || loadDocumentParseFeedback();
  const next: DocumentParseFeedbackStore = {
    ...current,
    libraries: { ...current.libraries },
  };
  let changed = false;
  let clearedLibraryCount = 0;
  let clearedFieldCount = 0;

  for (const libraryKey of libraryKeys) {
    const library = next.libraries[libraryKey];
    const schema = library?.schemas?.[schemaType];
    if (!library || !schema) continue;

    if (fieldName) {
      if (!Object.prototype.hasOwnProperty.call(schema.fields, fieldName)) continue;
      const nextFields = { ...schema.fields };
      delete nextFields[fieldName];
      clearedFieldCount += 1;
      changed = true;

      if (Object.keys(nextFields).length) {
        next.libraries[libraryKey] = {
          schemas: {
            ...library.schemas,
            [schemaType]: {
              fields: nextFields,
            },
          },
        };
      } else {
        const nextSchemas = { ...library.schemas };
        delete nextSchemas[schemaType];
        if (Object.keys(nextSchemas).length) {
          next.libraries[libraryKey] = { schemas: nextSchemas };
        } else {
          delete next.libraries[libraryKey];
        }
        clearedLibraryCount += 1;
      }
      continue;
    }

    const nextSchemas = { ...library.schemas };
    delete nextSchemas[schemaType];
    clearedFieldCount += Object.keys(schema.fields || {}).length;
    clearedLibraryCount += 1;
    changed = true;

    if (Object.keys(nextSchemas).length) {
      next.libraries[libraryKey] = { schemas: nextSchemas };
    } else {
      delete next.libraries[libraryKey];
    }
  }

  if (!changed) {
    return {
      changed: false,
      clearedFieldCount: 0,
      clearedLibraryCount: 0,
      snapshot: buildFeedbackSnapshot({
        feedback: current,
        libraryKeys,
        schemaType,
      }),
    };
  }

  if (!input.feedback) {
    await saveDocumentParseFeedback(next);
  }
  return {
    changed: true,
    clearedFieldCount,
    clearedLibraryCount,
    snapshot: buildFeedbackSnapshot({
      feedback: next,
      libraryKeys,
      schemaType,
    }),
  };
}
