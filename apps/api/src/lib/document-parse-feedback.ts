import {
  hasMeaningfulValue,
  buildFeedbackSnapshot,
  collectFieldMap,
  collectVisibleFeedbackValues,
  mergeLibrarySchemaFields,
  normalizeLibraryKeys,
  normalizeSchemaType,
  normalizeText,
  normalizeTextForMatch,
} from './document-parse-feedback-support.js';
import { loadDocumentParseFeedback, saveDocumentParseFeedback } from './document-parse-feedback-store.js';
export type {
  DocumentParseFeedbackSchemaType,
  DocumentParseFeedbackSnapshot,
  DocumentParseFeedbackSnapshotField,
  DocumentParseFeedbackStore,
} from './document-parse-feedback-types.js';
import type {
  ApplyInput,
  ClearInput,
  CollectInput,
  DocumentParseFeedbackStore,
  RecordInput,
  SnapshotInput,
} from './document-parse-feedback-types.js';
import { FEEDBACK_FIELD_DEFINITIONS } from './document-parse-feedback-types.js';

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
