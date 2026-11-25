import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

// Check authored strings and JSX text without treating source comments as interface copy.
const prohibited =
  /[\u2014\u2015\u2e3a\u2e3b]|&(?:amp;)*(?:mdash|horbar|#0*(?:8212|8213|11834|11835)|#x0*(?:2014|2015|2e3a|2e3b));|\s--\s/i;
const findings: string[] = [];

function check(file: string, line: number, text: string) {
  if (prohibited.test(text)) findings.push(`${file}:${line}`);
}

for (const entry of readdirSync("src", { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || !/\.tsx?$/.test(entry.name) || /\.(?:test|d)\.tsx?$/.test(entry.name))
    continue;
  const file = join(entry.parentPath, entry.name);
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  function visit(node: ts.Node) {
    if (ts.isJsxText(node) || ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      check(file, line, node.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

const seed = "supabase/seed.sql";
readFileSync(seed, "utf8")
  .split(/\r?\n/)
  .forEach((line, index) => {
    if (!line.trimStart().startsWith("--")) check(seed, index + 1, line);
  });

if (findings.length > 0) {
  console.error("Prohibited punctuation in authored copy:\n" + [...new Set(findings)].join("\n"));
  process.exitCode = 1;
} else {
  console.log("Authored copy punctuation check passed.");
}
