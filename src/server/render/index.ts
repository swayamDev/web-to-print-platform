import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { DesignDocument, PlaceholderValues } from "@/domain/design/schema";
import { FONT_IDS, loadFont, type LoadedFont } from "@/lib/print/fonts";
import type { PdfMeta } from "@/lib/print/pdf";
import { renderDocument, type RenderAsset, type RenderResult } from "@/lib/print/render";

/**
 * Server-side print rendering (PRD p6 §07: heavy processing runs on the server). Fonts are read
 * from public/fonts, which next.config.ts traces into the serverless bundle.
 */

let fontsPromise: Promise<Map<string, LoadedFont>> | null = null;

export function loadPrintFonts(): Promise<Map<string, LoadedFont>> {
  fontsPromise ??= (async () => {
    const entries = await Promise.all(
      FONT_IDS.map(async (id) => {
        const bytes = await readFile(join(process.cwd(), "public", "fonts", `${id}.ttf`));
        return [id, loadFont(id, new Uint8Array(bytes))] as const;
      }),
    );
    return new Map(entries);
  })();
  return fontsPromise;
}

export type RenderRequest = {
  document: DesignDocument;
  values?: PlaceholderValues;
  format: "pdf" | "png";
  /** PNG resolution; production uses the product's output DPI. */
  dpi?: number;
  /** Draw trim, bleed and safe-area guides (proofs/previews only). */
  guides?: boolean;
  /** Diagonal watermark text (PNG proofs only). */
  watermark?: string;
  meta: PdfMeta;
  /** Uploaded files referenced by the design (see loadAssetFiles). */
  assets?: ReadonlyMap<string, RenderAsset>;
};

export type { RenderResult };

/**
 * Lay out, validate and render. Blocking issues (outside print area, overflow, unsupported
 * characters, missing or very low-resolution images) stop production output; previews may
 * still render with `allowIssues`.
 */
export async function renderDesign(
  request: RenderRequest,
  allowIssues = false,
): Promise<RenderResult> {
  return renderDocument({ ...request, fonts: await loadPrintFonts(), allowIssues });
}
