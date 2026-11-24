"use client";

import { ChevronLeft, ChevronRight, FileSpreadsheet } from "lucide-react";
import { useId, useRef, useState } from "react";

import type { CsvTable, MergeCheck, MergeMapping } from "@/domain/merge";
import { cn } from "@/lib/utils";
import { uploadCsvAction } from "@/server/actions/merge";

export type MergeFile = { id: string; filename: string; table: CsvTable };

const KEEP = "__template__";

/**
 * Data file for variable-data products (PRD p6 §07): upload a CSV, choose which column fills
 * each personalised field, step through rows on the canvas and see every row's print check.
 * One printed item per row. The server repeats all of these checks at checkout.
 */
export function DataMergePanel({
  keys,
  file,
  mapping,
  check,
  previewRow,
  disabled,
  onLoginRequired,
  onFile,
  onMapping,
  onPreviewRow,
}: {
  keys: string[];
  file: MergeFile | null;
  mapping: MergeMapping;
  check: MergeCheck | null;
  /** 0 shows the template text; 1..n shows that row. */
  previewRow: number;
  disabled: boolean;
  onLoginRequired: () => boolean;
  onFile: (file: MergeFile) => void;
  onMapping: (mapping: MergeMapping) => void;
  onPreviewRow: (row: number) => void;
}) {
  const ids = useId();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({
    busy: false,
    error: null,
  });
  const rows = file?.table.rows.length ?? 0;

  const choose = async (chosen: File | undefined) => {
    if (!chosen) return;
    setState({ busy: true, error: null });
    const result = await uploadCsvAction({ filename: chosen.name, text: await chosen.text() });
    if (result.status === "valid") {
      setState({ busy: false, error: null });
      onFile(result.file);
    } else {
      setState({
        busy: false,
        error: result.status === "rejected" ? result.reason : "Please log in to upload files.",
      });
    }
  };

  const sample = `data:text/csv;charset=utf-8,${encodeURIComponent(
    `${keys.join(",")}\n${keys.map((k) => (/BIB|NUMBER/.test(k) ? "101" : "Example")).join(",")}\n`,
  )}`;

  return (
    <section
      aria-labelledby={`${ids}-heading`}
      className="bg-card grid gap-3 rounded-xl border p-4 text-sm"
      data-testid="data-merge"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id={`${ids}-heading`} className="spec-label text-muted-foreground">
          Personalise from a file
        </h2>
        <a href={sample} download="template.csv" className="text-xs underline underline-offset-4">
          Sample CSV
        </a>
      </div>

      {keys.length === 0 ? (
        <p className="text-muted-foreground">
          This design has no personalised fields. Start from a race number or board template.
        </p>
      ) : (
        <p className="text-muted-foreground">
          One item is printed per row. Fields: {keys.map((k) => `{${k}}`).join(", ")}.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled || state.busy}
          onClick={() => {
            if (onLoginRequired()) return;
            input.current?.click();
          }}
          className="hover:border-ink inline-flex h-9 items-center gap-1.5 rounded-md border px-3 disabled:opacity-40"
        >
          <FileSpreadsheet className="size-4" aria-hidden="true" />
          {state.busy ? "Checking…" : file ? "Replace CSV" : "Upload CSV"}
        </button>
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose a CSV file"
          data-testid="csv-input"
          onChange={(e) => {
            void choose(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {file ? (
          <span className="text-muted-foreground min-w-0 truncate" data-testid="csv-summary">
            {file.filename} · {rows} {rows === 1 ? "row" : "rows"}
          </span>
        ) : null}
      </div>
      {state.error ? (
        <p role="alert" className="text-destructive" data-testid="csv-error">
          {state.error}
        </p>
      ) : null}

      {file && keys.length > 0 ? (
        <>
          <fieldset className="grid gap-2" disabled={disabled}>
            <legend className="mb-1 font-medium">Columns</legend>
            {keys.map((key) => (
              <label key={key} className="grid grid-cols-[6rem_1fr] items-center gap-2">
                <span className="font-mono text-xs">{`{${key}}`}</span>
                <select
                  className="border-input bg-background h-9 min-w-0 rounded-md border px-2"
                  value={mapping[key] === null ? KEEP : (mapping[key] ?? "")}
                  aria-label={`Column for ${key}`}
                  onChange={(e) => {
                    const value = e.target.value;
                    const next = { ...mapping };
                    if (value === "") delete next[key];
                    else next[key] = value === KEEP ? null : value;
                    onMapping(next);
                  }}
                >
                  <option value="">Choose a column…</option>
                  {file.table.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                  <option value={KEEP}>Same text on every item</option>
                </select>
              </label>
            ))}
          </fieldset>

          <div className="flex items-center justify-between gap-2" aria-label="Preview a row">
            <button
              type="button"
              aria-label="Previous row"
              disabled={previewRow <= 0}
              onClick={() => onPreviewRow(previewRow - 1)}
              className="hover:border-ink grid size-9 place-items-center rounded-md border disabled:opacity-40"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-center" data-testid="preview-row" aria-live="polite">
              {previewRow === 0 ? "Showing the template" : `Showing row ${previewRow} of ${rows}`}
            </span>
            <button
              type="button"
              aria-label="Next row"
              disabled={previewRow >= rows}
              onClick={() => onPreviewRow(previewRow + 1)}
              className="hover:border-ink grid size-9 place-items-center rounded-md border disabled:opacity-40"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          {check ? (
            <div
              className={cn(
                "grid gap-1.5 rounded-lg border p-3",
                check.errors
                  ? "border-destructive/40 bg-destructive/5"
                  : check.warnings
                    ? "border-warning/40 bg-warning/5"
                    : "",
              )}
              data-testid="merge-check"
            >
              <p className={cn("font-medium", check.errors ? "text-destructive" : "text-success")}>
                {check.errors
                  ? `${check.errors} ${check.errors === 1 ? "problem" : "problems"} to fix before ordering`
                  : `All ${check.rowCount} rows are ready to print`}
                {check.warnings
                  ? ` · ${check.warnings} ${check.warnings === 1 ? "note" : "notes"}`
                  : ""}
              </p>
              {check.issues.length > 0 ? (
                <ul className="grid max-h-48 gap-1 overflow-y-auto">
                  {check.issues.map((issue, index) => (
                    <li key={`${issue.row}-${issue.code}-${issue.field}-${index}`}>
                      <button
                        type="button"
                        disabled={issue.row === 0}
                        onClick={() => onPreviewRow(issue.row)}
                        className={cn(
                          "text-left underline-offset-4 enabled:hover:underline",
                          issue.severity === "error" ? "text-destructive" : "text-warning",
                        )}
                      >
                        {issue.message}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
