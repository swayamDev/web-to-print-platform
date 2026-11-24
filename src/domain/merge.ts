import { z } from "zod";

import { layoutDocument, type FontLookup } from "./design/layout";
import type { DesignDocument, PlaceholderValues } from "./design/schema";
import { validateDocument } from "./design/validate";
import type { AssetInfo } from "./uploads";

/**
 * CSV variable-data merge (PRD p6 §07, DECISIONS D-09): one artwork per CSV row, with every
 * row checked by the same layout and print checks as a single design. Pure: used by the
 * designer for instant feedback and by the server, which re-checks everything.
 */

export const MAX_CSV_BYTES = 256 * 1024;
export const MAX_CELL_LENGTH = 200;
export const MAX_COLUMNS = 30;

export type CsvTable = { headers: string[]; rows: string[][] };
export type CsvResult = { ok: true; table: CsvTable } | { ok: false; error: string };

/**
 * Parse CSV text (RFC 4180: quoted fields, doubled quotes, line breaks inside quotes; CRLF or
 * LF; optional UTF-8 BOM). The delimiter is detected from the header line: comma, semicolon
 * (common in European spreadsheet exports) or tab. Blank lines are skipped; cells are trimmed.
 */
export function parseCsv(text: string, maxRows: number): CsvResult {
  const source = text.replace(/^﻿/, "");
  if (source.trim() === "") return { ok: false, error: "The file is empty." };
  if (source.includes("\u0000")) {
    return { ok: false, error: "This does not look like a CSV text file." };
  }
  const delimiter = detectDelimiter(source);

  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let quoted = false;
  let i = 0;
  const endField = () => {
    record.push(field);
    field = "";
  };
  const endRecord = () => {
    endField();
    if (record.some((cell) => cell.trim() !== "")) records.push(record);
    record = [];
  };
  while (i < source.length) {
    const c = source[i]!;
    if (quoted) {
      if (c === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"' && field.trim() === "") {
      quoted = true;
      field = "";
    } else if (c === delimiter) {
      endField();
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && source[i + 1] === "\n") i++;
      endRecord();
    } else {
      field += c;
    }
    i++;
  }
  if (quoted) return { ok: false, error: 'A quoted value is not closed (missing ").' };
  if (field !== "" || record.length > 0) endRecord();

  const [head, ...body] = records;
  if (!head) return { ok: false, error: "The file is empty." };
  const headers = head.map((h) => h.trim());
  if (headers.length > MAX_COLUMNS) {
    return { ok: false, error: `Use at most ${MAX_COLUMNS} columns.` };
  }
  if (headers.some((h) => h === "")) {
    return { ok: false, error: "Every column needs a name in the first row." };
  }
  const seen = new Set<string>();
  for (const h of headers) {
    const key = h.toLowerCase();
    if (seen.has(key)) return { ok: false, error: `The column name "${h}" is used twice.` };
    seen.add(key);
  }
  if (body.length === 0) return { ok: false, error: "The file has column names but no rows." };
  if (body.length > maxRows) {
    return {
      ok: false,
      error: `The file has ${body.length} rows; the maximum is ${maxRows}. Split it into smaller orders.`,
    };
  }

  const rows: string[][] = [];
  for (const [index, raw] of body.entries()) {
    const line = index + 2; // 1-based, after the header
    const extra = raw.slice(headers.length);
    if (extra.some((cell) => cell.trim() !== "")) {
      return { ok: false, error: `Row ${line} has more values than there are columns.` };
    }
    const cells = headers.map((_, c) => (raw[c] ?? "").trim());
    const long = cells.findIndex((cell) => cell.length > MAX_CELL_LENGTH);
    if (long >= 0) {
      return {
        ok: false,
        error: `Row ${line}, column "${headers[long]}" is longer than ${MAX_CELL_LENGTH} characters.`,
      };
    }
    rows.push(cells);
  }
  return { ok: true, table: { headers, rows } };
}

function detectDelimiter(source: string): string {
  const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
  let best = ",";
  let bestCount = 0;
  for (const d of [",", ";", "\t"]) {
    let count = 0;
    let quoted = false;
    for (const c of firstLine) {
      if (c === '"') quoted = !quoted;
      else if (c === d && !quoted) count++;
    }
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

// -----------------------------------------------------------------------------
// Mapping placeholders to columns
// -----------------------------------------------------------------------------

const placeholderKey = z.string().regex(/^[A-Z][A-Z0-9_]{0,31}$/);

/** placeholder key -> column name, or null to print the template's own text on every item. */
export const mergeMappingSchema = z.record(placeholderKey, z.string().max(200).nullable());
export type MergeMapping = z.infer<typeof mergeMappingSchema>;

/** Saved with a design: which uploaded CSV, and how its columns fill the placeholders. */
export const dataMergeSchema = z.object({
  csvAssetId: z.string().uuid(),
  mapping: mergeMappingSchema,
});
export type DataMerge = z.infer<typeof dataMergeSchema>;

/** Placeholder keys used by the design's text, in order of first appearance. */
export function placeholderKeys(document: DesignDocument): string[] {
  const keys: string[] = [];
  for (const el of document.elements) {
    if (el.type === "text" && el.placeholderKey && !keys.includes(el.placeholderKey)) {
      keys.push(el.placeholderKey);
    }
  }
  return keys;
}

const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const SYNONYMS: Record<string, string[]> = {
  bib: ["number", "bibnumber", "bibno", "racenumber", "no"],
  number: ["bib", "no", "num", "racenumber", "platenumber", "bibnumber"],
  name: ["fullname", "ridername", "runnername", "participant", "athlete"],
};

/** Best-guess column for each placeholder (exact name, then common synonyms). */
export function suggestMapping(keys: string[], headers: string[]): MergeMapping {
  const mapping: MergeMapping = {};
  const used = new Set<string>();
  for (const key of keys) {
    const k = normalise(key);
    const candidates = [k, ...(SYNONYMS[k] ?? [])];
    const match = candidates
      .map((c) => headers.find((h) => normalise(h) === c && !used.has(h)))
      .find(Boolean);
    if (match) {
      mapping[key] = match;
      used.add(match);
    }
  }
  return mapping;
}

/** Placeholder values for every row. Unmapped (null) placeholders keep the template text. */
export function rowValues(table: CsvTable, mapping: MergeMapping): PlaceholderValues[] {
  const columns = Object.entries(mapping).flatMap(([key, column]) => {
    if (column === null) return [];
    const index = table.headers.indexOf(column);
    return index >= 0 ? [[key, index] as const] : [];
  });
  return table.rows.map((row) =>
    Object.fromEntries(columns.map(([key, index]) => [key, row[index] ?? ""])),
  );
}

// -----------------------------------------------------------------------------
// Preflight: every row through the print checks
// -----------------------------------------------------------------------------

export type RowIssue = {
  /** 1-based data row (row 1 is the first row under the column names). */
  row: number;
  field: string | null;
  code: string;
  severity: "error" | "warning";
  message: string;
};

export type MergeCheck = {
  rowCount: number;
  issues: RowIssue[];
  errors: number;
  warnings: number;
};

/** Keys whose values identify an item (race numbers): duplicates are worth a warning. */
const IDENTIFYING = /^(BIB|NUMBER|NO|NUM|ID|PLATE)(_|$)/;

export function preflightMerge(
  document: DesignDocument,
  table: CsvTable,
  mapping: MergeMapping,
  fonts: FontLookup,
  assets?: ReadonlyMap<string, AssetInfo>,
): MergeCheck {
  const issues: RowIssue[] = [];
  const keys = placeholderKeys(document);

  if (keys.length === 0) {
    issues.push({
      row: 0,
      field: null,
      code: "no-placeholders",
      severity: "error",
      message: "This design has no personalised fields to fill from the file.",
    });
  }
  for (const key of keys) {
    const column = mapping[key];
    if (column === undefined) {
      issues.push({
        row: 0,
        field: key,
        code: "unmapped",
        severity: "error",
        message: `Choose a column for {${key}}, or keep the same text on every item.`,
      });
    } else if (column !== null && !table.headers.includes(column)) {
      issues.push({
        row: 0,
        field: key,
        code: "missing-column",
        severity: "error",
        message: `The file has no column "${column}".`,
      });
    }
  }
  if (issues.some((i) => i.severity === "error")) return summarise(table.rows.length, issues);

  const valuesList = rowValues(table, mapping);
  const elementKeys = new Map(
    document.elements.flatMap((e) =>
      e.type === "text" && e.placeholderKey ? [[e.id, e.placeholderKey] as const] : [],
    ),
  );
  const seen = new Map<string, Map<string, number>>();

  valuesList.forEach((values, index) => {
    const row = index + 1;
    for (const [key, value] of Object.entries(values)) {
      if (value === "") {
        issues.push({
          row,
          field: key,
          code: "empty",
          severity: "error",
          message: `Row ${row}: {${key}} is empty.`,
        });
      } else if (IDENTIFYING.test(key)) {
        const values = seen.get(key) ?? new Map<string, number>();
        const first = values.get(value);
        if (first) {
          issues.push({
            row,
            field: key,
            code: "duplicate",
            severity: "warning",
            message: `Row ${row}: {${key}} "${value}" is the same as row ${first}.`,
          });
        } else values.set(value, row);
        seen.set(key, values);
      }
    }
    const layout = layoutDocument(document, values, fonts);
    for (const issue of validateDocument(document, layout, assets)) {
      const field = elementKeys.get(issue.elementId) ?? null;
      issues.push({
        row,
        field,
        code: issue.code,
        severity: issue.severity,
        message: `Row ${row}${field ? ` {${field}}` : ""}: ${issue.message}`,
      });
    }
  });
  return summarise(table.rows.length, issues);
}

function summarise(rowCount: number, issues: RowIssue[]): MergeCheck {
  return {
    rowCount,
    issues,
    errors: issues.filter((i) => i.severity === "error").length,
    warnings: issues.filter((i) => i.severity === "warning").length,
  };
}

/** Row file suffix: row-001 … row-100 (sorts correctly in file browsers). */
export const rowLabel = (row: number): `row-${string}` => `row-${String(row).padStart(3, "0")}`;
