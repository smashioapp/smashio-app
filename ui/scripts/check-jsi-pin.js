// Fails the job when the installed expo-modules-core declares an expo-modules-jsi range the pinned
// jsi does not satisfy. ExpoModulesCore ships precompiled against the jsi version in its own
// dependency range, and we compile jsi from source at the pinned version, so a mismatch links clean
// and crashes at launch on a missing Swift symbol (builds 1077/1079, and 1092 after `npm audit fix`
// moved core to 57.0.18, which wants jsi ~57.1.0). Necessary, not sufficient: jsi 57.0.6 satisfies
// core 57.0.10's ~57.0.4 and still crashes. See docs/store-readiness-plan.md
// §"iOS runner image / Xcode / expo-modules-jsi".
const semver = require("semver");

const core = require("expo-modules-core/package.json");
const jsi = require("expo-modules-jsi/package.json");
const pin = require("../package.json").dependencies["expo-modules-jsi"];

const wanted = core.dependencies?.["expo-modules-jsi"];
const problems = [];
if (jsi.version !== pin) problems.push(`installed expo-modules-jsi@${jsi.version} is not the pinned ${pin}`);
if (wanted && !semver.satisfies(jsi.version, wanted)) {
  problems.push(`expo-modules-core@${core.version} wants expo-modules-jsi ${wanted}, pinned is ${jsi.version}`);
}

if (problems.length > 0) {
  console.error("expo-modules-jsi pin check failed:\n  " + problems.join("\n  "));
  console.error("Do not bump expo/expo-modules-core without re-deciding the jsi pin (docs/store-readiness-plan.md).");
  process.exit(1);
}
console.log(`expo-modules-jsi pin ok: core ${core.version} wants ${wanted}, jsi ${jsi.version}`);
