import { describe, expect, it } from "vitest";

import {
  acceptAttribute,
  checkFormat,
  detectFormat,
  effectiveDpiOf,
  jpegSize,
  pngSize,
  svgSafetyIssue,
  svgSize,
  type AssetInfo,
} from "./uploads";

const text = (s: string) => new TextEncoder().encode(s);

/** A minimal PNG header: signature + IHDR with the given size. */
function pngHeader(width: number, height: number) {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

/** A minimal JPEG: SOI, an APP0 segment, then SOF0 with the given size. */
function jpegHeader(width: number, height: number) {
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x04,
    0x00,
    0x00,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    0x03,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
  ]);
}

describe("detectFormat (magic bytes, not extensions)", () => {
  it("recognises PNG, JPEG, PDF and SVG", () => {
    expect(detectFormat(pngHeader(1, 1))).toBe("png");
    expect(detectFormat(jpegHeader(1, 1))).toBe("jpeg");
    expect(detectFormat(text("%PDF-1.7\n..."))).toBe("pdf");
    expect(
      detectFormat(text('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"/>')),
    ).toBe("svg");
    expect(detectFormat(text('﻿  <!-- logo --><svg viewBox="0 0 10 10"></svg>'))).toBe("svg");
  });

  it("spots old PostScript-only Illustrator files and unknown data", () => {
    expect(detectFormat(text("%!PS-Adobe-3.0\n%%Creator: Adobe Illustrator"))).toBe("ai-legacy");
    expect(detectFormat(text("GIF89a..."))).toBe("unknown");
    expect(detectFormat(text("<html><body>not an svg</body></html>"))).toBe("unknown");
  });
});

describe("checkFormat", () => {
  it("accepts PDF-compatible .ai files as PDFs", () => {
    expect(checkFormat("artwork", "Logo FINAL.AI", "pdf", 1000)).toEqual({
      ok: true,
      format: "pdf",
    });
  });

  it("explains how to fix a legacy Illustrator file", () => {
    const result = checkFormat("artwork", "logo.ai", "ai-legacy", 1000);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Create PDF Compatible File/);
  });

  it("rejects files whose contents do not match their extension", () => {
    expect(checkFormat("logo", "photo.png", "jpeg", 1000)).toEqual({
      ok: false,
      reason: "This file is not a valid .png file.",
    });
    expect(checkFormat("logo", "evil.png", "unknown", 1000).ok).toBe(false);
  });

  it("limits logos to images and enforces size limits", () => {
    expect(checkFormat("logo", "brochure.pdf", "pdf", 1000).ok).toBe(false);
    expect(checkFormat("logo", "big.png", "png", 11 * 1024 * 1024).ok).toBe(false);
    expect(checkFormat("artwork", "empty.pdf", "pdf", 0).ok).toBe(false);
  });

  it("builds the file picker accept list", () => {
    expect(acceptAttribute("logo")).toBe(".png,.jpg,.jpeg,.svg");
  });
});

describe("image dimensions", () => {
  it("reads PNG and JPEG pixel sizes", () => {
    expect(pngSize(pngHeader(1200, 800))).toEqual({ width: 1200, height: 800 });
    expect(jpegSize(jpegHeader(640, 480))).toEqual({ width: 640, height: 480 });
  });

  it("reads SVG proportions from viewBox, else width and height", () => {
    expect(svgSize('<svg viewBox="0 0 200 100" width="20mm">')).toEqual({
      width: 200,
      height: 100,
    });
    expect(svgSize('<svg width="300" height="150">')).toEqual({ width: 300, height: 150 });
    expect(svgSize("<svg>")).toBeNull();
  });
});

describe("svgSafetyIssue", () => {
  it("accepts plain vector logos", () => {
    expect(
      svgSafetyIssue('<svg viewBox="0 0 1 1"><path d="M0 0h1v1z" fill="#000"/></svg>'),
    ).toBeNull();
    expect(
      svgSafetyIssue('<svg><image href="data:image/png;base64,AAAA" width="1" height="1"/></svg>'),
    ).toBeNull();
  });

  it.each([
    ["<svg><script>alert(1)</script></svg>", /scripts/],
    ['<svg onload="alert(1)"></svg>', /event handlers/],
    ['<svg><a href="javascript:alert(1)">x</a></svg>', /javascript/],
    ["<svg><foreignObject><div/></foreignObject></svg>", /embedded HTML/],
    ['<svg><image href="https://tracker.example/x.png"/></svg>', /other websites/],
    ['<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><svg>&e;</svg>', /entity/],
  ])("refuses %s", (svg, reason) => {
    expect(svgSafetyIssue(svg)).toMatch(reason);
  });
});

describe("effectiveDpiOf", () => {
  const raster: AssetInfo = { id: "a", format: "png", vector: false, widthPx: 600, heightPx: 300 };

  it("is the lower of the two axes", () => {
    // 600 px across 50.8 mm (2 in) = 300 DPI; 300 px across 50.8 mm = 150 DPI
    expect(effectiveDpiOf(raster, 50.8, 50.8)).toBe(150);
  });

  it("does not apply to vector artwork", () => {
    expect(effectiveDpiOf({ ...raster, format: "svg", vector: true }, 1000, 1000)).toBeNull();
  });
});
