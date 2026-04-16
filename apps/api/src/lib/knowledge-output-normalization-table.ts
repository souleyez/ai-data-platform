import {
  isObject,
  normalizeText,
  sanitizeText,
  type JsonRecord,
} from './knowledge-output-normalization-support.js';

function normalizeObjectKeys(row: JsonRecord) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [normalizeText(key), value]),
  );
}

function deriveColumnsFromObjectRows(rows: JsonRecord[]) {
  const orderedKeys: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      const normalized = sanitizeText(key);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      orderedKeys.push(normalized);
    }
  }
  return orderedKeys;
}

export function normalizeColumnNames(columns: string[]) {
  return columns.map((item) => sanitizeText(item)).filter(Boolean);
}

export function sanitizeRows(value: unknown, targetColumns: string[]) {
  if (!Array.isArray(value)) return { columns: targetColumns, rows: [] as string[][] };

  const arrayRows = value.filter((entry) => Array.isArray(entry)) as unknown[][];
  if (arrayRows.length) {
    const rows = arrayRows.map((row) => row.map((cell) => sanitizeText(cell)));
    return { columns: targetColumns, rows };
  }

  const objectRows = value.filter(isObject) as JsonRecord[];
  if (!objectRows.length) {
    return { columns: targetColumns, rows: [] as string[][] };
  }

  const columns = targetColumns.length ? targetColumns : deriveColumnsFromObjectRows(objectRows);
  const normalizedColumns = columns.map((column) => sanitizeText(column)).filter(Boolean);
  const rows = objectRows.map((row) => {
    const normalizedRow = normalizeObjectKeys(row);
    return normalizedColumns.map((column) => {
      const direct = row[column];
      if (direct != null) return sanitizeText(direct);
      const byNormalized = normalizedRow[normalizeText(column)];
      if (byNormalized != null) return sanitizeText(byNormalized);
      return '';
    });
  });

  return { columns: normalizedColumns, rows };
}

export function alignRowsToColumns(rows: string[][], columns: string[]) {
  return rows.map((row) => {
    if (row.length === columns.length) return row;
    if (row.length > columns.length) return row.slice(0, columns.length);
    return [...row, ...new Array(columns.length - row.length).fill('')];
  });
}
