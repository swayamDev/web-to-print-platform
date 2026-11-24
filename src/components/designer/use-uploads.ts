"use client";

import { useState } from "react";

import { checkFormat, detectFormat, extensionOf, type UploadKind } from "@/domain/uploads";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { registerUploadAction } from "@/server/actions/assets";
import type { ClientAsset } from "@/server/assets";

export type UploadState =
  { kind: "idle" } | { kind: "busy"; message: string } | { kind: "error"; message: string };

/**
 * Upload a logo or finished artwork:
 *  1. quick checks in the browser (real file type from its first bytes, size, extension);
 *  2. upload straight to the customer's own folder in storage (RLS allows only their folder);
 *  3. the server re-reads the stored file, checks it properly, makes a preview and records it.
 */
export function useUploads(userId: string | null) {
  const [state, setState] = useState<UploadState>({ kind: "idle" });

  async function upload(file: File, kind: UploadKind): Promise<ClientAsset | null> {
    if (!userId) return null;
    const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
    const check = checkFormat(kind, file.name, detectFormat(head), file.size);
    if (!check.ok) {
      setState({ kind: "error", message: check.reason });
      return null;
    }

    setState({ kind: "busy", message: "Uploading…" });
    const id = crypto.randomUUID();
    const path = `${userId}/${id}.${extensionOf(file.name)}`;
    const { error } = await createSupabaseBrowserClient()
      .storage.from("uploads")
      .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (error) {
      setState({
        kind: "error",
        message: /size/i.test(error.message)
          ? "This file is too large to upload."
          : "The upload failed. Please check your connection and try again.",
      });
      return null;
    }

    setState({ kind: "busy", message: "Checking your file…" });
    const result = await registerUploadAction({ path, originalFilename: file.name, kind });
    if (result.status !== "valid") {
      setState({
        kind: "error",
        message: result.status === "rejected" ? result.reason : "Please log in to upload files.",
      });
      return null;
    }
    setState({ kind: "idle" });
    return result.asset;
  }

  return { state, upload, clear: () => setState({ kind: "idle" }) };
}
