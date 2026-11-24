import "server-only";

import { z } from "zod";

import { canonicalJson } from "@/domain/canonical";
import type { DesignDocument, PlaceholderValues } from "@/domain/design/schema";
import {
  dataMergeSchema,
  parseCsv,
  preflightMerge,
  rowValues,
  type CsvTable,
  type DataMerge,
  type MergeCheck,
} from "@/domain/merge";
import { sha256 } from "@/server/assets";
import { loadPrintFonts } from "@/server/render";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";

/**
 * Server side of the CSV merge (PRD p6 §07). CSV files are stored in the customer's own
 * folder of the `uploads` bucket as `{userId}/{assetId}.csv` and recorded as `csv` assets.
 * Everything a browser says about a file (rows, mapping, checks) is recomputed here.
 */

export const CSV_PATH = /^([0-9a-f-]{36})\/([0-9a-f-]{36})\.csv$/;

/** The row cap (DECISIONS D-09): a setting, 100 by default. */
export async function maxCsvRows(): Promise<number> {
  const { data } = await createSupabaseAdminClient()
    .from("settings")
    .select("max_csv_rows")
    .single();
  return data?.max_csv_rows ?? 100;
}

export type CsvFile = { id: string; filename: string; table: CsvTable };

/**
 * Read and parse one of a customer's CSV assets. `ownerId` restricts the lookup to that
 * customer; the secret key is used so checkout, proofs and production can call it too.
 */
export async function loadCsv(
  assetId: string,
  ownerId: string,
): Promise<{ ok: true; file: CsvFile } | { ok: false; error: string }> {
  if (!z.string().uuid().safeParse(assetId).success) {
    return { ok: false, error: "The data file could not be found. Upload it again." };
  }
  const admin = createSupabaseAdminClient();
  const { data: asset } = await admin
    .from("assets")
    .select("id, path, original_filename")
    .eq("id", assetId)
    .eq("owner_id", ownerId)
    .eq("kind", "csv")
    .eq("status", "valid")
    .maybeSingle();
  if (!asset) return { ok: false, error: "The data file could not be found. Upload it again." };
  const { data: blob } = await admin.storage.from("uploads").download(asset.path);
  if (!blob) return { ok: false, error: "The data file could not be read. Upload it again." };
  const parsed = parseCsv(await blob.text(), await maxCsvRows());
  if (!parsed.ok) return { ok: false, error: parsed.error };
  return {
    ok: true,
    file: { id: asset.id, filename: asset.original_filename ?? "data.csv", table: parsed.table },
  };
}

/** The signed-in customer's own CSV (for reopening a saved design in the designer). */
export async function getOwnCsv(assetId: string, ownerId: string): Promise<CsvFile | null> {
  // RLS check first: the asset row must be visible to this user.
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("assets")
    .select("id", { count: "exact", head: true })
    .eq("id", assetId);
  if (!count) return null;
  const result = await loadCsv(assetId, ownerId);
  return result.ok ? result.file : null;
}

/** Fingerprint of exactly the data that will be printed (row order matters). */
export const datasetHash = (values: PlaceholderValues[]) =>
  sha256(new TextEncoder().encode(canonicalJson({ v: 1, rows: values })));

export type ResolvedMerge = {
  csvAssetId: string;
  mapping: DataMerge["mapping"];
  values: PlaceholderValues[];
  check: MergeCheck;
  datasetHash: string;
};

/**
 * Resolve a design's data file into checked rows. Every row is laid out and print-checked with
 * the server's fonts; callers refuse to continue when `check.errors > 0`.
 */
export async function resolveMerge(
  dataMerge: unknown,
  ownerId: string,
  document: DesignDocument,
): Promise<{ ok: true; merge: ResolvedMerge } | { ok: false; error: string }> {
  const settings = dataMergeSchema.safeParse(dataMerge);
  if (!settings.success) {
    return { ok: false, error: "Upload a data file (CSV) in the designer to personalise items." };
  }
  const csv = await loadCsv(settings.data.csvAssetId, ownerId);
  if (!csv.ok) return csv;
  const fonts = await loadPrintFonts();
  const check = preflightMerge(
    document,
    csv.file.table,
    settings.data.mapping,
    (id) => fonts.get(id)?.metrics,
  );
  const values = rowValues(csv.file.table, settings.data.mapping);
  return {
    ok: true,
    merge: {
      csvAssetId: csv.file.id,
      mapping: settings.data.mapping,
      values,
      check,
      datasetHash: datasetHash(values),
    },
  };
}
