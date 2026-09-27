// Stop: if ui/** changed, run tsc before the turn can end; also re-check the lockfile.
const crypto = require("crypto");
const os = require("os");
const { root, readInput, git, lockfileProblems, spawnSync, fs, path } = require("./lib");

const input = readInput();
if (input.stop_hook_active) process.exit(0); // already blocked once this turn, don't loop

const reasons = [];
reasons.push(...lockfileProblems());

const changed = (git(["diff", "HEAD", "--name-only", "--", "ui"]) + git(["ls-files", "--others", "--exclude-standard", "--", "ui"]))
  .split("\n")
  .filter((f) => /^ui\/.*\.(tsx?|json)$/.test(f) && !f.endsWith("package-lock.json"));

if (changed.length && fs.existsSync(path.join(root, "ui", "node_modules"))) {
  // Skip if this exact tree already passed, so idle turns stay instant.
  const hash = crypto.createHash("sha1").update(git(["diff", "HEAD", "--", "ui"]) + changed.join("\n")).digest("hex");
  const stamp = path.join(os.tmpdir(), "smashio-tsc-ok");
  const last = fs.existsSync(stamp) ? fs.readFileSync(stamp, "utf8") : "";
  if (last !== hash) {
    const r = spawnSync("npx", ["tsc", "--noEmit"], { cwd: path.join(root, "ui"), encoding: "utf8", shell: true, timeout: 240000 });
    if (r.status === 0) fs.writeFileSync(stamp, hash);
    else reasons.push("`npx tsc --noEmit` failed in ui/. Fix before finishing:\n" + ((r.stdout || "") + (r.stderr || "")).trim().split("\n").slice(0, 40).join("\n"));
  }
}

if (reasons.length) process.stdout.write(JSON.stringify({ decision: "block", reason: reasons.join("\n\n") }));
