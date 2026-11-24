import fontkit from "@pdf-lib/fontkit";
import {
  concatTransformationMatrix,
  degrees,
  PDFDocument,
  type PDFFont,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setCharacterSpacing,
} from "pdf-lib";

import type { DesignLayout } from "@/domain/design/layout";
import { rotatePoint } from "@/domain/design/layout";
import { mmToPt } from "@/domain/design/units";

import type { LoadedFont } from "./fonts";

export type PdfMeta = {
  title: string;
  subject?: string;
  /** Searchable keywords, e.g. order number, proof version, snapshot hash (approved = printed). */
  keywords?: string[];
  /** Fixed timestamp so the same input always produces byte-identical files. */
  date: Date;
};

/** An uploaded image ready for the PDF: the original PNG/JPEG/PDF bytes (SVGs pre-rasterised). */
export type PdfImageSource = { format: "png" | "jpeg" | "pdf"; bytes: Uint8Array };

// Shaping must match the measuring code exactly (DECISIONS D-26).
const NO_SHAPING = { liga: false, clig: false, dlig: false, calt: false, kern: false, ccmp: false };

const hex = (color: string) =>
  rgb(
    parseInt(color.slice(1, 3), 16) / 255,
    parseInt(color.slice(3, 5), 16) / 255,
    parseInt(color.slice(5, 7), 16) / 255,
  );

/**
 * Print-ready PDF: page = trim + bleed, with MediaBox/BleedBox = full page and TrimBox = the
 * finished size; vector shapes; real (subset-embedded) fonts so text stays sharp and
 * searchable. All geometry comes from the shared layout.
 */
export async function renderPdf(
  layout: DesignLayout,
  fonts: Map<string, LoadedFont>,
  meta: PdfMeta,
  images: ReadonlyMap<string, PdfImageSource> = new Map(),
  options: { mirror?: boolean } = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(meta.title);
  if (meta.subject) doc.setSubject(meta.subject);
  if (meta.keywords) doc.setKeywords(meta.keywords);
  doc.setProducer("Digital Heroes Print");
  doc.setCreator("Digital Heroes Print render engine");
  doc.setCreationDate(meta.date);
  doc.setModificationDate(meta.date);

  const W = mmToPt(layout.pageWidthMm);
  const H = mmToPt(layout.pageHeightMm);
  const page = doc.addPage([W, H]);
  page.setMediaBox(0, 0, W, H);
  page.setBleedBox(0, 0, W, H);
  const t = layout.trim;
  page.setTrimBox(mmToPt(t.x), mmToPt(layout.pageHeightMm - t.y - t.h), mmToPt(t.w), mmToPt(t.h));

  // y-down page mm -> PDF points (y-up)
  const X = (mm: number) => mmToPt(mm);
  const Y = (mm: number) => H - mmToPt(mm);

  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: hex(layout.background) });
  // Mirrored output (e.g. stamps): flip the artwork left to right about the page centre. Bleed is
  // equal on both sides, so the trim box stays where it is.
  if (options.mirror)
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(-1, 0, 0, 1, W, 0));

  const embedded = new Map<string, PDFFont>();
  const fontFor = async (id: string) => {
    if (!embedded.has(id)) {
      const loaded = fonts.get(id);
      if (!loaded) throw new Error(`Font ${id} is not loaded`);
      embedded.set(id, await doc.embedFont(loaded.bytes, { subset: true, features: NO_SHAPING }));
    }
    return embedded.get(id)!;
  };

  for (const item of layout.items) {
    if (item.kind === "rect") {
      // pdf-lib rotates about the rectangle's own (x, y) = its bottom-left corner.
      const cx = item.x + item.w / 2;
      const cy = item.y + item.h / 2;
      const corner = rotatePoint(item.x, item.y + item.h, cx, cy, item.rotation);
      page.drawRectangle({
        x: X(corner.x),
        y: Y(corner.y),
        width: mmToPt(item.w),
        height: mmToPt(item.h),
        color: hex(item.fill),
        rotate: degrees(-item.rotation),
      });
    } else if (item.kind === "image") {
      const source = item.assetId ? images.get(item.assetId) : undefined;
      if (!source) continue; // empty template slot
      const cx = item.x + item.w / 2;
      const cy = item.y + item.h / 2;
      const corner = rotatePoint(item.x, item.y + item.h, cx, cy, item.rotation);
      const placement = {
        x: X(corner.x),
        y: Y(corner.y),
        width: mmToPt(item.w),
        height: mmToPt(item.h),
        rotate: degrees(-item.rotation),
      };
      if (source.format === "pdf") {
        // Customer PDFs (and PDF-compatible .ai files) stay vector: the page is embedded as is.
        const [embeddedPage] = await doc.embedPdf(source.bytes, [0]);
        page.drawPage(embeddedPage!, placement);
      } else {
        const image =
          source.format === "png"
            ? await doc.embedPng(source.bytes)
            : await doc.embedJpg(source.bytes);
        page.drawImage(image, placement);
      }
    } else if (item.kind === "text" && item.text !== "") {
      const font = await fontFor(item.fontId);
      // pdf-lib rotates text about its baseline origin; move the origin to match a rotation
      // about the element's centre.
      const origin = rotatePoint(
        item.originX,
        item.originY,
        item.centerX,
        item.centerY,
        item.rotation,
      );
      page.pushOperators(
        pushGraphicsState(),
        setCharacterSpacing((item.trackingPerMille / 1000) * item.fontSizePt),
      );
      page.drawText(item.text, {
        x: X(origin.x),
        y: Y(origin.y),
        size: item.fontSizePt,
        font,
        color: hex(item.color),
        rotate: degrees(-item.rotation),
      });
      page.pushOperators(popGraphicsState());
    }
  }
  if (options.mirror) page.pushOperators(popGraphicsState());

  return doc.save({ useObjectStreams: false });
}

/**
 * Combine single-page PDFs (one per CSV row) into one document, keeping each page's boxes.
 * Used for the all-rows proof and the combined print file of a variable-data order.
 */
export async function combinePdfs(files: Uint8Array[], meta: PdfMeta): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(meta.title);
  if (meta.subject) doc.setSubject(meta.subject);
  if (meta.keywords) doc.setKeywords(meta.keywords);
  doc.setProducer("Digital Heroes Print");
  doc.setCreator("Digital Heroes Print render engine");
  doc.setCreationDate(meta.date);
  doc.setModificationDate(meta.date);
  for (const bytes of files) {
    const source = await PDFDocument.load(bytes);
    const pages = await doc.copyPages(source, source.getPageIndices());
    for (const page of pages) doc.addPage(page);
  }
  return doc.save({ useObjectStreams: false });
}
