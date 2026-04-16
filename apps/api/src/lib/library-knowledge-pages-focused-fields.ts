import {
  loadDocumentExtractionGovernance,
  normalizeDocumentExtractionFieldValues,
  resolveDocumentExtractionConflictValues,
  resolveDocumentExtractionFieldConflictStrategy,
  resolveDocumentExtractionProfile,
} from './document-extraction-governance.js';
import type { DocumentLibrary } from './document-libraries.js';
import type { ParsedDocument } from './document-parser.js';
import type {
  LibraryKnowledgeFieldConflict,
  LibraryKnowledgeFocusedFieldCoverage,
} from './library-knowledge-pages-types.js';
import { normalizeText } from './library-knowledge-pages-support.js';

function toTextValueList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeText(entry, 160)).filter(Boolean);
  }
  const text = normalizeText(value, 160);
  return text ? [text] : [];
}

function extractDocumentFieldValues(item: ParsedDocument, key: string) {
  const profile = item.structuredProfile && typeof item.structuredProfile === 'object' && !Array.isArray(item.structuredProfile)
    ? item.structuredProfile as Record<string, unknown>
    : null;
  if (!profile) return [];

  const focusedEntries = Array.isArray(profile.focusedFieldEntries) ? profile.focusedFieldEntries : [];
  for (const entry of focusedEntries) {
    if (!entry || typeof entry !== 'object') continue;
    if (String((entry as Record<string, unknown>).key || '').trim() !== key) continue;
    const values = toTextValueList((entry as Record<string, unknown>).value);
    if (values.length) return values;
  }

  const fieldDetails = profile.fieldDetails && typeof profile.fieldDetails === 'object' && !Array.isArray(profile.fieldDetails)
    ? profile.fieldDetails as Record<string, unknown>
    : null;
  const detail = fieldDetails?.[key];
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    const values = toTextValueList((detail as Record<string, unknown>).value);
    if (values.length) return values;
  }

  return toTextValueList(profile[key]);
}

export function buildFocusedFieldCoverage(library: DocumentLibrary, items: ParsedDocument[]) {
  const profile = resolveDocumentExtractionProfile(
    loadDocumentExtractionGovernance(),
    { keys: [library.key], labels: [library.label] },
  );
  if (!profile?.preferredFieldKeys?.length) {
    return {
      fieldSet: '',
      coverage: [] as LibraryKnowledgeFocusedFieldCoverage[],
      conflicts: [] as LibraryKnowledgeFieldConflict[],
    };
  }

  const coverage = profile.preferredFieldKeys.map((fieldKey) => {
    const alias = normalizeText(profile.fieldAliases?.[fieldKey] || fieldKey, 64) || fieldKey;
    const prompt = normalizeText(profile.fieldPrompts?.[fieldKey], 120);
    const valuesByDocument = items.map((item) => {
      const rawValues = extractDocumentFieldValues(item, fieldKey);
      const normalizedValues = resolveDocumentExtractionConflictValues(
        fieldKey,
        normalizeDocumentExtractionFieldValues(fieldKey, rawValues, profile),
        profile,
        'merge-distinct',
      );
      return {
        title: normalizeText(item.title || item.name, 80) || 'Untitled document',
        values: normalizedValues,
      };
    }).filter((entry) => entry.values.length);

    const distinctValues = [...new Set(valuesByDocument.flatMap((entry) => entry.values))];
    return {
      key: fieldKey,
      alias,
      prompt,
      conflictStrategy: resolveDocumentExtractionFieldConflictStrategy(fieldKey, profile, 'merge-distinct'),
      populatedDocumentCount: valuesByDocument.length,
      totalDocumentCount: items.length,
      coverageRatio: items.length ? Number((valuesByDocument.length / items.length).toFixed(2)) : 0,
      resolvedValues: resolveDocumentExtractionConflictValues(fieldKey, distinctValues, profile, 'merge-distinct').slice(0, 4),
      sampleValues: distinctValues.slice(0, 4),
      sampleDocumentTitles: valuesByDocument.slice(0, 3).map((entry) => entry.title),
    };
  });

  const conflicts = coverage
    .filter((entry) => entry.sampleValues.length > 1)
    .slice(0, 6)
    .map((entry) => ({
      key: entry.key,
      alias: entry.alias,
      conflictStrategy: entry.conflictStrategy,
      values: entry.sampleValues,
      sampleDocumentTitles: (entry as typeof entry & { sampleDocumentTitles?: string[] }).sampleDocumentTitles || [],
    }));

  return {
    fieldSet: profile.fieldSet,
    coverage: coverage.map(({ sampleDocumentTitles: _sampleDocumentTitles, ...entry }) => entry),
    conflicts,
  };
}

export function collectKeyFacts(items: ParsedDocument[], focusedFieldCoverage: LibraryKnowledgeFocusedFieldCoverage[] = []) {
  const facts = new Set<string>();

  for (const entry of focusedFieldCoverage) {
    if (!entry.resolvedValues.length) continue;
    facts.add(`${entry.alias}: ${entry.resolvedValues.join(' / ')}`);
    if (facts.size >= 8) return [...facts];
  }

  for (const item of items) {
    const profile = item.structuredProfile && typeof item.structuredProfile === 'object'
      ? (item.structuredProfile as Record<string, unknown>)
      : null;
    if (profile) {
      const focusedEntries = Array.isArray(profile.focusedFieldEntries) ? profile.focusedFieldEntries : [];
      for (const entry of focusedEntries) {
        if (!entry || typeof entry !== 'object') continue;
        const key = normalizeText((entry as Record<string, unknown>).alias || (entry as Record<string, unknown>).key, 80);
        const value = normalizeText((entry as Record<string, unknown>).value, 120);
        if (key && value) facts.add(`${key}: ${value}`);
        if (facts.size >= 8) return [...facts];
      }

      const focusedFields = profile.focusedFields && typeof profile.focusedFields === 'object'
        ? (profile.focusedFields as Record<string, unknown>)
        : null;
      for (const [key, value] of Object.entries(focusedFields || {})) {
        const normalizedKey = normalizeText(key, 80);
        const normalizedValue = normalizeText(value, 120);
        if (normalizedKey && normalizedValue) facts.add(`${normalizedKey}: ${normalizedValue}`);
        if (facts.size >= 8) return [...facts];
      }
    }

    const summary = normalizeText(item.summary, 160);
    if (summary) facts.add(summary);
    if (facts.size >= 8) return [...facts];
  }

  return [...facts];
}
