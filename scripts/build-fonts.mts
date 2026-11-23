/**
 * Build the print fonts: convert the OFL-licensed Latin WOFF files shipped by @fontsource into
 * plain TrueType (.ttf) in src/assets/fonts.
 *
 *   node scripts/build-fonts.mts
 *
 * Why: the designer (browser), the text-fitting engine (opentype.js) and the PDF writer
 * (pdf-lib) must measure and draw with byte-identical font files, or layouts drift between
 * screen and print. TTF is the one format all three read. The output is committed, so this
 * only needs re-running when fonts are added.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "src", "assets", "fonts");

const FONTS = [
  { id: "sora-bold", pkg: "@fontsource/sora", file: "sora-latin-700-normal.woff" },
  { id: "inter-semibold", pkg: "@fontsource/inter", file: "inter-latin-600-normal.woff" },
  { id: "inter-regular", pkg: "@fontsource/inter", file: "inter-latin-400-normal.woff" },
];

/** Convert a WOFF 1.0 file to an sfnt (TrueType/OpenType) file. */
function woffToSfnt(woff: Buffer): Buffer {
  if (woff.toString("ascii", 0, 4) !== "wOFF") throw new Error("Not a WOFF 1.0 file");
  const flavor = woff.readUInt32BE(4);
  const numTables = woff.readUInt16BE(12);

  const tables: { tag: string; checksum: number; data: Buffer }[] = [];
  for (let i = 0; i < numTables; i++) {
    const entry = 44 + i * 20;
    const tag = woff.toString("ascii", entry, entry + 4);
    const offset = woff.readUInt32BE(entry + 4);
    const compLength = woff.readUInt32BE(entry + 8);
    const origLength = woff.readUInt32BE(entry + 12);
    const checksum = woff.readUInt32BE(entry + 16);
    const raw = woff.subarray(offset, offset + compLength);
    const data = compLength < origLength ? inflateSync(raw) : Buffer.from(raw);
    if (data.length !== origLength) throw new Error(`Table ${tag}: bad length`);
    tables.push({ tag, checksum, data });
  }
  tables.sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));

  const entrySelector = Math.floor(Math.log2(numTables));
  const searchRange = 2 ** entrySelector * 16;
  const headerSize = 12 + numTables * 16;
  const pad4 = (n: number) => (n + 3) & ~3;
  const total = tables.reduce((size, t) => size + pad4(t.data.length), headerSize);

  const out = Buffer.alloc(total);
  out.writeUInt32BE(flavor, 0);
  out.writeUInt16BE(numTables, 4);
  out.writeUInt16BE(searchRange, 6);
  out.writeUInt16BE(entrySelector, 8);
  out.writeUInt16BE(numTables * 16 - searchRange, 10);

  let offset = headerSize;
  tables.forEach((table, i) => {
    const record = 12 + i * 16;
    out.write(table.tag, record, 4, "ascii");
    out.writeUInt32BE(table.checksum, record + 4);
    out.writeUInt32BE(offset, record + 8);
    out.writeUInt32BE(table.data.length, record + 12);
    table.data.copy(out, offset);
    offset += pad4(table.data.length);
  });
  return out;
}

mkdirSync(outDir, { recursive: true });
for (const font of FONTS) {
  const pkgDir = join(root, "node_modules", font.pkg);
  const ttf = woffToSfnt(readFileSync(join(pkgDir, "files", font.file)));
  writeFileSync(join(outDir, `${font.id}.ttf`), ttf);
  console.log(`✔ ${font.id}.ttf (${(ttf.length / 1024).toFixed(1)} KB)`);
}
copyFileSync(join(root, "node_modules/@fontsource/inter/LICENSE"), join(outDir, "OFL-Inter.txt"));
copyFileSync(join(root, "node_modules/@fontsource/sora/LICENSE"), join(outDir, "OFL-Sora.txt"));
console.log("Licences copied (SIL Open Font License 1.1).");
