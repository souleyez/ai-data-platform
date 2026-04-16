import {
  CONFIG_VERSION,
  FEEDBACK_FIELD_DEFINITIONS,
  type CollectInput,
  type DocumentParseFeedbackLibraryEntry,
  type DocumentParseFeedbackLibrarySchema,
  type DocumentParseFeedbackSchemaType,
  type DocumentParseFeedbackSnapshot,
  type DocumentParseFeedbackSnapshotField,
  type DocumentParseFeedbackStore,
  type FeedbackFieldKind,
  type SnapshotInput,
} from './document-parse-feedback-types.js';

export function normalizeText(value: unknown) {
  return String(value ?? '').trim();
}

export function normalizeTextForMatch(value: string) {
  return normalizeText(value).toLowerCase().replace(/\s+/g, '');
}

export function normalizeLibraryKeys(values: string[]) {
  return [...new Set((values || []).map((item) => normalizeText(item)).filter(Boolean))];
}

export function normalizeSchemaType(value: unknown): DocumentParseFeedbackSchemaType | undefined {
  const normalized = normalizeText(value);
  return normalized === 'contract'
    || normalized === 'resume'
    || normalized === 'technical'
    || normalized === 'order'
    ? normalized
    : undefined;
}

export function normalizeFeedbackValues(value: unknown, kind: FeedbackFieldKind) {
  const values = kind === 'multi'
    ? (Array.isArray(value) ? value : [])
    : [value];
  return [...new Set(
    values
      .map((item) => normalizeText(item))
      .filter(Boolean),
  )].slice(0, 20);
}

export function normalizeStore(input: unknown): DocumentParseFeedbackStore {
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

export function createEmptyStore(): DocumentParseFeedbackStore {
  return {
    version: CONFIG_VERSION,
    updatedAt: new Date().toISOString(),
    libraries: {},
  };
}

export function hasMeaningfulValue(value: unknown) {
  if (Array.isArray(value)) return value.some((item) => normalizeText(item));
  return normalizeText(value).length > 0;
}

export function mergeFeedbackValues(existing: string[], incoming: string[]) {
  return [...new Set([...incoming, ...existing])].slice(0, 20);
}

export function collectFieldMap(schemaType: DocumentParseFeedbackSchemaType, input: CollectInput) {
  if (!input) return {};
  const definitions = FEEDBACK_FIELD_DEFINITIONS[schemaType];
  return Object.fromEntries(
    definitions
      .map((definition) => [definition.name, normalizeFeedbackValues(input[definition.name], definition.kind)] as const)
      .filter(([, values]) => values.length),
  ) as Record<string, string[]>;
}

export function mergeLibrarySchemaFields(
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

export function collectVisibleFeedbackValues(
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

export function buildFeedbackSnapshot(input: SnapshotInput) {
  const schemaType = normalizeSchemaType(input.schemaType);
  const libraryKeys = normalizeLibraryKeys(input.libraryKeys);
  if (!schemaType || !libraryKeys.length) return null;

  const feedback = input.feedback;
  if (!feedback) return null;
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
