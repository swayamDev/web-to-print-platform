import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { FONT_IDS, loadFont, type LoadedFont } from "@/lib/print/fonts";

import { designDocumentSchema, type DesignDocument } from "./design/schema";
import {
  parseCsv,
  placeholderKeys,
  preflightMerge,
  rowLabel,
  rowValues,
  suggestMapping,
  type CsvTable,
} from "./merge";

const fonts = new Map<string, LoadedFont>();
const lookup = (id: string) => fonts.get(id)?.metrics;

function raceBib(): DesignDocument {
  const sql = readFileSync(join(process.cwd(), "supabase/seed.sql"), "utf8");
  return [...sql.matchAll(/\$json\$([\s\S]*?)\$json\$/g)]
    .map((m) => designDocumentSchema.parse(JSON.parse(m[1]!)))
    .find((t) => t.trim.w === 148 && t.trim.h === 210)!;
}

beforeAll(() => {
  for (const id of FONT_IDS) {
    const bytes = readFileSync(join(process.cwd(), "public/fonts", `${id}.ttf`));
    fonts.set(id, loadFont(id, new Uint8Array(bytes)));
  }
});

const table = (text: string, max = 100): CsvTable => {
  const result = parseCsv(text, max);
  if (!result.ok) throw new Error(result.error);
  return result.table;
};

describe("parseCsv", () => {
  it("reads quoted values, doubled quotes, embedded line breaks, CRLF and a BOM", () => {
    expect(
      table('﻿Bib,Name\r\n1,"Shah, Priya"\r\n2,"Ann ""Speedy"" Lee"\r\n3,"Two\nLines"\r\n'),
    ).toEqual({
      headers: ["Bib", "Name"],
      rows: [
        ["1", "Shah, Priya"],
        ["2", 'Ann "Speedy" Lee'],
        ["3", "Two\nLines"],
      ],
    });
  });

  it("detects semicolon and tab delimiters, trims cells and skips blank lines", () => {
    expect(table("bib;name\n 7 ; Jo \n\n;;\n8;Max").rows).toEqual([
      ["7", "Jo"],
      ["8", "Max"],
    ]);
    expect(table("bib\tname\n9\tKim").rows).toEqual([["9", "Kim"]]);
  });

  it("pads short rows and refuses rows with extra values", () => {
    expect(table("a,b,c\n1").rows).toEqual([["1", "", ""]]);
    expect(parseCsv("a,b\n1,2,3", 100)).toMatchObject({
      ok: false,
      error: /Row 2 has more values/,
    });
  });

  it("explains every way a file can be unusable", () => {
    const error = (text: string, max = 100) => {
      const r = parseCsv(text, max);
      return r.ok ? null : r.error;
    };
    expect(error("")).toMatch(/empty/);
    expect(error("bib,name")).toMatch(/no rows/);
    expect(error("bib,,name\n1,2,3")).toMatch(/needs a name/);
    expect(error("Name,name\n1,2")).toMatch(/used twice/);
    expect(error('a\n"open')).toMatch(/not closed/);
    expect(error("a\n1\n2\n3", 2)).toMatch(/3 rows; the maximum is 2/);
    expect(error(`a\n${"x".repeat(201)}`)).toMatch(/longer than 200/);
    expect(error("a\u0000b\n1")).toMatch(/not look like a CSV/);
  });
});

describe("mapping", () => {
  it("lists placeholders and suggests columns by name and common synonyms", () => {
    const keys = placeholderKeys(raceBib());
    expect(keys).toEqual(["BIB", "NAME"]);
    expect(suggestMapping(keys, ["Race Number", "Full name", "Club"])).toEqual({
      BIB: "Race Number",
      NAME: "Full name",
    });
    expect(suggestMapping(["BIB", "NAME"], ["bib", "Name"])).toEqual({ BIB: "bib", NAME: "Name" });
  });

  it("fills values per row; null keeps the template text", () => {
    const t = table("No,Rider\n12,Ana\n13,Ben");
    expect(rowValues(t, { BIB: "No", NAME: null })).toEqual([{ BIB: "12" }, { BIB: "13" }]);
  });
});

describe("preflightMerge", () => {
  it("passes a clean file", () => {
    const check = preflightMerge(
      raceBib(),
      table("bib,name\n101,PRIYA SHAH\n102,SAM LEE"),
      { BIB: "bib", NAME: "name" },
      lookup,
    );
    expect(check).toMatchObject({ rowCount: 2, errors: 0, warnings: 0 });
  });

  it("finds empty values, text that cannot fit, unprintable characters and duplicate numbers", () => {
    const check = preflightMerge(
      raceBib(),
      table(
        [
          "bib,name",
          "101,ANA",
          "102,",
          `103,${"VERY LONG NAME ".repeat(8)}`,
          "101,BEN",
          "105,田中",
        ].join("\n"),
      ),
      { BIB: "bib", NAME: "name" },
      lookup,
    );
    const codes = check.issues.map((i) => `${i.row}:${i.code}:${i.severity}`);
    expect(codes).toContain("2:empty:error");
    expect(codes).toContain("3:overflow:error");
    expect(codes).toContain("4:duplicate:warning");
    expect(codes).toContain("5:missing-glyphs:error");
    expect(check.issues.find((i) => i.row === 3)?.message).toMatch(/^Row 3 \{NAME\}: /);
    expect(codes.filter((c) => c.startsWith("1:"))).toEqual([]);
  });

  it("requires a decision for every placeholder before checking rows", () => {
    const check = preflightMerge(raceBib(), table("bib\n1"), { BIB: "bib" }, lookup);
    expect(check.issues).toEqual([
      expect.objectContaining({ row: 0, field: "NAME", code: "unmapped" }),
    ]);
    const missing = preflightMerge(raceBib(), table("bib\n1"), { BIB: "bib", NAME: "Nom" }, lookup);
    expect(missing.issues[0]).toMatchObject({ code: "missing-column", field: "NAME" });
  });

  it("names row files so they sort", () => {
    expect([rowLabel(1), rowLabel(42), rowLabel(100)]).toEqual(["row-001", "row-042", "row-100"]);
  });
});
