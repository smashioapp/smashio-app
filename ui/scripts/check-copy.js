#!/usr/bin/env node
// Copy hygiene check (docs/short-a-player-ux-plan.md §2.5, F23). CLAUDE.md bans em dashes in
// user-facing text; comments are fine. Walks every .ts/.tsx under app/, components/ and lib/
// with the TypeScript parser and fails on an em dash inside a string literal, template literal
// or JSX text. A lone "—" (an empty-value placeholder in a stat tile) is allowed. For a string
// that genuinely never reaches a user, put `copy-check-ignore` in a comment on the line above.
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
const DIRS = ["app", "components", "lib"];
const EM = "—";

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

const files = DIRS.flatMap((d) => walk(path.join(ROOT, d), []));
const problems = [];

for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  if (!text.includes(EM)) continue;
  const lines = text.split(/\r?\n/);
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

  const visit = (node) => {
    const k = node.kind;
    const isCopy =
      k === ts.SyntaxKind.StringLiteral ||
      k === ts.SyntaxKind.NoSubstitutionTemplateLiteral ||
      k === ts.SyntaxKind.TemplateHead ||
      k === ts.SyntaxKind.TemplateMiddle ||
      k === ts.SyntaxKind.TemplateTail ||
      k === ts.SyntaxKind.JsxText;
    if (isCopy) {
      const value = k === ts.SyntaxKind.JsxText ? node.getText(source) : node.text;
      if (value.includes(EM) && value.trim() !== EM) {
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line;
        if (!(line > 0 && lines[line - 1].includes("copy-check-ignore"))) {
          problems.push(`${path.relative(ROOT, file)}:${line + 1}: ${lines[line].trim()}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

if (problems.length > 0) {
  console.error(`Em dash in user-facing copy (CLAUDE.md: use a comma or full stop instead):\n${problems.join("\n")}`);
  process.exit(1);
}
console.log(`check-copy: ${files.length} files clean`);
