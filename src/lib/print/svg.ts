import type { DesignLayout } from "@/domain/design/layout";

import { textToPathData, type LoadedFont } from "./fonts";

export type SvgOptions = {
  /** Draw trim, bleed and safe-area guides (proofs and previews only, never print files). */
  guides?: { safeMarginMm: number };
  /** Image data by asset id, as data: URIs (PNG/JPEG/SVG; PDFs pre-rasterised by the caller). */
  images?: ReadonlyMap<string, string>;
};

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
const n = (v: number) => Number(v.toFixed(3));

/**
 * Render a layout as SVG in millimetre units, with all text converted to outlines so the
 * result does not depend on fonts installed on the rendering machine.
 */
export function layoutToSvg(
  layout: DesignLayout,
  fonts: Map<string, LoadedFont>,
  options: SvgOptions = {},
): string {
  const { pageWidthMm: W, pageHeightMm: H } = layout;
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(W)}mm" height="${n(H)}mm" viewBox="0 0 ${n(W)} ${n(H)}">`,
  );
  parts.push(`<rect x="0" y="0" width="${n(W)}" height="${n(H)}" fill="${layout.background}"/>`);

  for (const item of layout.items) {
    if (item.kind === "rect") {
      const cx = item.x + item.w / 2;
      const cy = item.y + item.h / 2;
      parts.push(
        `<rect id="${esc(item.id)}" x="${n(item.x)}" y="${n(item.y)}" width="${n(item.w)}" height="${n(item.h)}" fill="${item.fill}"${
          item.rotation ? ` transform="rotate(${n(item.rotation)} ${n(cx)} ${n(cy)})"` : ""
        }/>`,
      );
    } else if (item.kind === "text") {
      const loaded = fonts.get(item.fontId);
      if (!loaded || item.text === "") continue;
      const d = textToPathData(
        loaded,
        item.text,
        item.originX,
        item.originY,
        item.fontSizePt,
        item.trackingPerMille,
      );
      parts.push(
        `<path id="${esc(item.id)}" d="${d}" fill="${item.color}"${
          item.rotation
            ? ` transform="rotate(${n(item.rotation)} ${n(item.centerX)} ${n(item.centerY)})"`
            : ""
        }/>`,
      );
    } else if (item.kind === "image") {
      // Empty template slots ("your logo here") draw nothing in print output.
      const href = item.assetId ? options.images?.get(item.assetId) : undefined;
      if (!href) continue;
      const cx = item.x + item.w / 2;
      const cy = item.y + item.h / 2;
      parts.push(
        `<image id="${esc(item.id)}" x="${n(item.x)}" y="${n(item.y)}" width="${n(item.w)}" height="${n(item.h)}" preserveAspectRatio="none" href="${href}"${
          item.rotation ? ` transform="rotate(${n(item.rotation)} ${n(cx)} ${n(cy)})"` : ""
        }/>`,
      );
    }
  }

  if (options.guides) {
    const { trim } = layout;
    const s = options.guides.safeMarginMm;
    const stroke = `fill="none" stroke-width="0.25" vector-effect="non-scaling-stroke"`;
    parts.push(`<g id="guides" pointer-events="none">`);
    parts.push(
      `<path d="M0 0H${n(W)}V${n(H)}H0Z M${n(trim.x)} ${n(trim.y)}V${n(trim.y + trim.h)}H${n(trim.x + trim.w)}V${n(trim.y)}Z" fill="#ff4d00" fill-opacity="0.12" fill-rule="evenodd"/>`,
    );
    parts.push(
      `<rect x="${n(trim.x)}" y="${n(trim.y)}" width="${n(trim.w)}" height="${n(trim.h)}" stroke="#121212" ${stroke}/>`,
    );
    parts.push(
      `<rect x="${n(trim.x + s)}" y="${n(trim.y + s)}" width="${n(trim.w - 2 * s)}" height="${n(trim.h - 2 * s)}" stroke="#ff4d00" stroke-dasharray="1 1" ${stroke}/>`,
    );
    parts.push(`</g>`);
  }

  parts.push(`</svg>`);
  return parts.join("");
}
