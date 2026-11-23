import { crc32 } from "node:zlib";

import { Resvg } from "@resvg/resvg-js";

import { mmToPx } from "@/domain/design/units";

/**
 * Rasterise an SVG (in mm) to a PNG at an exact print resolution, and record that resolution
 * in the PNG's pHYs chunk so print software opens it at the right physical size.
 * Server-only: resvg is a native module.
 */
export function renderPng(svg: string, pageWidthMm: number, dpi: number): Uint8Array {
  const widthPx = mmToPx(pageWidthMm, dpi);
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: widthPx },
    font: { loadSystemFonts: false }, // text is already outlined; never depend on system fonts
    shapeRendering: 2, // geometricPrecision
    textRendering: 2,
    imageRendering: 0,
  });
  const png = resvg.render().asPng();
  return setPngDpi(new Uint8Array(png), dpi);
}

/** Insert (or replace) the pHYs chunk: pixels per metre on both axes. */
export function setPngDpi(png: Uint8Array, dpi: number): Uint8Array {
  const view = Buffer.from(png);
  if (view.readUInt32BE(0) !== 0x89504e47) throw new Error("Not a PNG");
  const ppm = Math.round(dpi / 0.0254);

  const data = Buffer.alloc(9);
  data.writeUInt32BE(ppm, 0);
  data.writeUInt32BE(ppm, 4);
  data.writeUInt8(1, 8); // unit: metre
  const type = Buffer.from("pHYs", "ascii");
  const chunk = Buffer.alloc(21);
  chunk.writeUInt32BE(9, 0);
  type.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([type, data])) >>> 0, 17);

  // Walk the chunks: drop any existing pHYs, insert ours right after IHDR.
  const out: Buffer[] = [view.subarray(0, 8)];
  let offset = 8;
  while (offset < view.length) {
    const length = view.readUInt32BE(offset);
    const chunkType = view.toString("ascii", offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (chunkType !== "pHYs") out.push(view.subarray(offset, end));
    if (chunkType === "IHDR") out.push(chunk);
    offset = end;
  }
  return new Uint8Array(Buffer.concat(out));
}

/** Read width, height and DPI back from a PNG (used by preflight tests). */
export function readPngInfo(png: Uint8Array) {
  const view = Buffer.from(png);
  const width = view.readUInt32BE(16);
  const height = view.readUInt32BE(20);
  let dpi: number | null = null;
  let offset = 8;
  while (offset < view.length) {
    const length = view.readUInt32BE(offset);
    if (
      view.toString("ascii", offset + 4, offset + 8) === "pHYs" &&
      view.readUInt8(offset + 16) === 1
    ) {
      dpi = Math.round(view.readUInt32BE(offset + 8) * 0.0254);
    }
    offset += 12 + length;
  }
  return { width, height, dpi };
}
