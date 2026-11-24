"use server";

import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { z } from "zod";

import { MAX_CSV_BYTES, parseCsv, type CsvTable } from "@/domain/merge";
import { sha256 } from "@/server/assets";
import { getSessionUser } from "@/server/auth";
import { maxCsvRows } from "@/server/merge";
import { clientIp, rateLimit } from "@/server/rate-limit";
import { createSupabaseAdminClient } from "@/server/supabase/admin";

const uploadSchema = z.object({
  filename: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/\.(csv|txt)$/i, "Choose a .csv file."),
  text: z.string().max(MAX_CSV_BYTES, "The file is too large (maximum 256 KB)."),
});

export type UploadCsvResult =
  | { status: "valid"; file: { id: string; filename: string; table: CsvTable } }
  | { status: "rejected"; reason: string }
  | { status: "login-required" };

/**
 * Upload a CSV data file for a variable-data design. The server parses it with the row cap
 * from settings and refuses anything unusable before storing it in the customer's own folder.
 * (CSV files are small, so the text is sent directly rather than uploaded to storage first.)
 */
export async function uploadCsvAction(input: unknown): Promise<UploadCsvResult> {
  const user = await getSessionUser();
  if (!user) return { status: "login-required" };
  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "rejected", reason: parsed.error.issues[0]?.message ?? "Choose a CSV file." };
  }
  if (!(await rateLimit(`csv:${user.id}:${clientIp(await headers())}`, 30, 600, false))) {
    return { status: "rejected", reason: "Too many uploads. Please wait a few minutes." };
  }

  const table = parseCsv(parsed.data.text, await maxCsvRows());
  if (!table.ok) return { status: "rejected", reason: table.error };

  const id = randomUUID();
  const path = `${user.id}/${id}.csv`;
  const bytes = new TextEncoder().encode(parsed.data.text);
  const admin = createSupabaseAdminClient();
  const { error: uploadError } = await admin.storage
    .from("uploads")
    .upload(path, bytes, { contentType: "text/csv", upsert: false });
  if (uploadError) {
    return { status: "rejected", reason: "The file could not be saved. Please try again." };
  }
  const { error } = await admin.from("assets").insert({
    id,
    owner_id: user.id,
    bucket: "uploads",
    path,
    kind: "csv",
    original_filename: parsed.data.filename,
    mime_type: "text/csv",
    bytes: bytes.length,
    sha256: sha256(bytes),
    status: "valid",
    validation: {
      format: "csv",
      rows: table.table.rows.length,
      columns: table.table.headers,
    },
  });
  if (error) {
    await admin.storage.from("uploads").remove([path]);
    return { status: "rejected", reason: "The file could not be saved. Please try again." };
  }
  return { status: "valid", file: { id, filename: parsed.data.filename, table: table.table } };
}
