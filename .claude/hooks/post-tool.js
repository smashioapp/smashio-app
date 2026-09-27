// PostToolUse: lockfile guard (after Bash/Edit/Write), em-dash copy check (ui/app), migration reminder.
const { root, readInput, lockfileProblems, context, fs, path } = require("./lib");

const input = readInput();
const notes = [];
const rel = (p) => path.relative(root, p).split(path.sep).join("/");
const file = input.tool_input?.file_path ? rel(path.resolve(root, input.tool_input.file_path)) : "";

// 1. Lockfile guard. Lockfile changes usually come from `npm install`/`npm audit fix` via Bash, so run for any tool.
notes.push(...lockfileProblems());

// 2. Copy check: em dashes are banned in user-facing text. Code comments are exempt.
if (/^ui\/app\/.+\.tsx?$/.test(file) && fs.existsSync(path.join(root, file))) {
  const hits = [];
  fs.readFileSync(path.join(root, file), "utf8")
    .split(/\r?\n/)
    .forEach((line, i) => {
      const t = line.trim();
      if (/^(\/\/|\/\*|\*|\{\/\*)/.test(t)) return;
      const code = line.replace(/\s\/\/.*$/, "").replace(/\{\/\*.*?\*\/\}/g, "").replace(/\/\*.*?\*\//g, "");
      if (code.includes("—")) hits.push(`  ${file}:${i + 1}: ${t.slice(0, 100)}`);
    });
  if (hits.length) {
    notes.push(
      "Em dash in user-facing copy (CLAUDE.md bans them, use a comma or full stop). If a hit is a code comment or dev-only string, ignore it:\n" +
        hits.join("\n"),
    );
  }
}

// 3. Migration check: the PUBLIC-execute trap.
if (/^supabase\/migrations\/.+\.sql$/.test(file) && fs.existsSync(path.join(root, file))) {
  const sql = fs.readFileSync(path.join(root, file), "utf8");
  const creates = (sql.match(/create\s+(?:or\s+replace\s+)?function\s+[\w."]+/gi) || []).length;
  let msg = `Migration ${file} written. Before it ships: run \`supabase db reset\` (CI also runs assert_no_public_definer_execute()).`;
  if (creates) {
    const grants = (sql.match(/\bgrant\s+execute\s+on\s+function/gi) || []).length;
    msg +=
      `\nIt creates ${creates} function(s) and has ${grants} explicit \`grant execute on function\` statement(s). Since 20260914000400 new functions are callable by NOBODY in anon/authenticated until granted, ` +
      "including security invoker RPCs, helpers used in RLS policies and helpers called from security invoker triggers. Drop+recreate also resets grants. " +
      "Any `grant ... to public` must be paired with `revoke execute ... from public`.";
    if (grants < creates) msg += "\nWARNING: fewer grants than functions, check each function has the grant it needs (or is intentionally internal).";
  }
  notes.push(msg);
}

if (notes.length) context("PostToolUse", notes.join("\n\n"));
