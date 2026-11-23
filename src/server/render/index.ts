import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { layoutDocument } from "@/domain/design/layout";
import type { DesignDocument, PlaceholderValues } from "@/domain/design/schema";
import { validateDocument, type DesignIssue } from "@/domain/design/validate";
import { FONT_IDS, loadFont, type LoadedFont } from "@/lib/print/fonts";
import { renderPdf, type PdfMeta } from "@/lib/print/pdf";
import { renderPng } from "@/lib/print/png";
import { layoutToSvg } from "@/lib/print/svg";

/**
 * Server-side print rendering (PRD p6 §07: heavy processing runs on the server). Fonts are read
 * from src/assets/fonts, which next.config.ts traces into the serverless bundle.
 */

let fontsPromise: Promise<Map<string, LoadedFont>> | null = null;

export function loadPrintFonts(): Promise<Map<string, LoadedFont>> {
  fontsPromise ??= (async () => {
    const entries = await Promise.all(
      FONT_IDS.map(async (id) => {
        const bytes = await readFile(join(process.cwd(), "src", "assets", "fonts", `${id}.ttf`));
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
  meta: PdfMeta;
};

export type RenderResult =
  | { ok: true; bytes: Uint8Array; contentType: string; issues: DesignIssue[] }
  | { ok: false; issues: DesignIssue[] };

/**
 * Lay out, validate and render. Blocking issues (outside print area, overflow, unsupported
 * characters) stop production output; previews may still render with `allowIssues`.
 */
export async function renderDesign(
  request: RenderRequest,
  allowIssues = false,
): Promise<RenderResult> {
  const fonts = await loadPrintFonts();
  const layout = layoutDocument(
    request.document,
    request.values ?? {},
    (id) => fonts.get(id)?.metrics,
  );
  const issues = validateDocument(request.document, layout);
  if (issues.length > 0 && !allowIssues) return { ok: false, issues };

  if (request.format === "pdf") {
    return {
      ok: true,
      bytes: await renderPdf(layout, fonts, request.meta),
      contentType: "application/pdf",
      issues,
    };
  }
  const svg = layoutToSvg(
    layout,
    fonts,
    request.guides ? { guides: { safeMarginMm: request.document.safeMargin } } : {},
  );
  return {
    ok: true,
    bytes: renderPng(svg, layout.pageWidthMm, request.dpi ?? 300),
    contentType: "image/png",
    issues,
  };
}
