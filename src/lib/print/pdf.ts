import fontkit from "@pdf-lib/fontkit";
import {
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

  return doc.save({ useObjectStreams: false });
}
