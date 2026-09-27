// Shared helpers for project hooks. Hooks are Node so they run the same on Windows and CI.
const { execFileSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();

function readInput() {
  try {
    return JSON.parse(fs.readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

function git(args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

function expoVersions(lockText) {
  try {
    const pkgs = JSON.parse(lockText).packages || {};
    const out = {};
    for (const [k, v] of Object.entries(pkgs)) {
      const m = k.match(/^node_modules\/((?:@expo\/)?expo(?:-[\w-]+)?|@expo\/[\w-]+)$/);
      if (m) out[m[1]] = v.version;
    }
    return out;
  } catch {
    return {};
  }
}

// Returns a list of problems if ui/package-lock.json moved expo* versions vs HEAD or the jsi pin check fails.
function lockfileProblems() {
  const lockPath = path.join(root, "ui", "package-lock.json");
  if (!fs.existsSync(lockPath)) return [];
  if (git(["diff", "HEAD", "--name-only", "--", "ui/package-lock.json"]).trim() === "") return [];
  const problems = [];
  const before = expoVersions(git(["show", "HEAD:ui/package-lock.json"]));
  const after = expoVersions(fs.readFileSync(lockPath, "utf8"));
  const moved = [];
  for (const name of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[name] !== after[name]) moved.push(`${name}: ${before[name] ?? "(none)"} -> ${after[name] ?? "(none)"}`);
  }
  if (moved.length) {
    problems.push(
      "ui/package-lock.json moved expo* packages vs HEAD (native change coupled to the expo-modules-jsi pin, this crashed build 1092):\n  " +
        moved.join("\n  ") +
        "\nDon't commit this lockfile as-is. Keep expo* where they were (bump the specific non-Expo package) or re-decide the jsi pin deliberately. See .claude/rules/ios-build-and-deps.md and docs/store-readiness-plan.md.",
    );
  }
  if (fs.existsSync(path.join(root, "ui", "node_modules", "expo-modules-core"))) {
    const r = spawnSync("node", ["scripts/check-jsi-pin.js"], { cwd: path.join(root, "ui"), encoding: "utf8" });
    if (r.status !== 0) problems.push((r.stderr || r.stdout || "check-jsi-pin.js failed").trim());
  }
  return problems;
}

function context(event, text) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } }));
}

module.exports = { root, readInput, git, lockfileProblems, context, spawnSync, fs, path };
