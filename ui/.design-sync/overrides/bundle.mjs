// forked from design-sync lib/bundle.mjs — this repo's source is React
// Native/Expo, not a DOM component library. esbuild has no built-in
// react-native -> react-native-web resolution, so the runtime bundle and the
// export-evidence pass (both built from sharedBuildOptions) fail to resolve
// `react-native` imports at all without it. Added: rnWebAliasPlugin +
// RN_WEB_EXTENSIONS in sharedBuildOptions. Everything else — entry
// resolution, the react/react-dom shims, the IIFE header stamp, the
// export-evidence pass — is untouched from upstream, so the output contract
// with the app's self-check is unaffected; this fork only changes what
// module a bare `react-native` import resolves to.
//
// esbuild bundling: dist entry → IIFE at window.<GLOBAL>, plus the
// `/* @ds-bundle: {...} */` first-line header the claude.ai/design app's
// self-check parses.

import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { IIFE_IMPORT_META_DEFINE } from '../../.ds-sync/lib/common.mjs';

// Resolve the package's browser entry. Prefer ESM (tree-shakes cleaner).
// `soft` → return null on miss instead of exiting (caller synthesizes from src/).
export function resolveDistEntry({ pkgDir, pkgJson, override, pkgName, soft = false }) {
  if (override) {
    const p = resolve(override);
    if (!existsSync(p)) {
      console.error(`[NO_DIST] --entry ${override} doesn't exist — run the DS's build.`);
      if (soft) return null;
      process.exit(1);
    }
    return p;
  }
  // exports conditions can nest ({types, default:{types, default}}) — flatten.
  const str = (v) => (typeof v === 'string' ? v : v?.default ? str(v.default) : null);
  const cand = [
    pkgJson.module,
    str(pkgJson.exports?.['.']?.import),
    str(pkgJson.exports?.['.']?.default),
    str(pkgJson.exports?.['.']),
    pkgJson.main,
  ].filter((c) => typeof c === 'string');
  for (const c of cand) {
    const p = join(pkgDir, c);
    if (existsSync(p)) return p;
  }
  if (soft) return null;
  console.error(
    `[NO_DIST] ${pkgName} has no built entry (tried ${cand.join(', ')} under ${pkgDir}). ` +
      `Run the DS's build script, or use 'npm install ${pkgName}@latest' in a scratch dir and pass --node-modules.`,
  );
  process.exit(1);
}

// react/react-dom are externals → resolved to window.React / window.ReactDOM.
// Everything else is bundled from NODE_MODULES.
export const reactShim = {
  name: 'react-global',
  setup(b) {
    b.onResolve({ filter: /^react(\/(jsx-(dev-)?runtime|compiler-runtime))?$/ }, () => ({
      path: 'react-shim',
      namespace: 'shim',
    }));
    b.onResolve({ filter: /^react-dom(\/client)?$/ }, () => ({
      path: 'react-dom-shim',
      namespace: 'shim',
    }));
    // react-is must match window.React's $$typeof symbols. A bundled copy
    // from node_modules can be a different major (e.g. react-is@19 checks
    // for 'react.transitional.element' while react@18 emits 'react.element'),
    // which makes isElement() always false and breaks components that
    // branch on it (count badges, nav indicators, …).
    b.onResolve({ filter: /^react-is$/ }, () => ({ path: 'react-is-shim', namespace: 'shim' }));
    // scheduler must be the same instance window.React uses internally; a
    // second bundled copy breaks concurrent rendering.
    b.onResolve({ filter: /^scheduler(\/|$)/ }, () => ({ path: 'scheduler-shim', namespace: 'shim' }));
    b.onLoad({ filter: /^react-shim$/, namespace: 'shim' }, () => ({
      // Automatic-runtime jsx/jsxs → createElement. Two invariants matter:
      //  · key is the 3rd ARG, never in props — lift it into the createElement
      //    config object.
      //  · jsxs means "static children array": the compiler emits it for
      //    <div><A/><B/></div> as jsxs("div",{children:[A,B]}). The real
      //    react/jsx-runtime suppresses key validation for that array. We
      //    must SPREAD it into createElement variadic args — passing the
      //    array via props.children makes React's reconciler treat it as a
      //    dynamic list and warn "missing key" on every component with 2+
      //    static children. jsx (single child slot) keeps the child as one
      //    arg so a runtime .map() array there is still key-validated.
      contents: `var R=window.React;
function np(p,k){var o={};for(var x in p)if(x!=="children")o[x]=p[x];if(k!==void 0)o.key=k;return o}
function jsx(t,p,k){var c=p&&p.children;return c===void 0?R.createElement(t,np(p,k)):R.createElement(t,np(p,k),c)}
function jsxs(t,p,k){return R.createElement.apply(R,[t,np(p,k)].concat(p.children))}
module.exports=R;
module.exports.jsx=jsx;module.exports.jsxs=jsxs;module.exports.jsxDEV=function(t,p,k,s){return(s?jsxs:jsx)(t,p,k)};
module.exports.Fragment=R.Fragment;`,
      loader: 'js',
    }));
    b.onLoad({ filter: /^react-dom-shim$/, namespace: 'shim' }, () => ({
      // preload/preinit/preconnect/prefetchDNS (React 18.3+/19 resource
      // hints) must exist — some DSes call them at Provider mount.
      contents: 'var D=window.ReactDOM,n=function(){};' +
        'module.exports=Object.assign({preload:n,preinit:n,preconnect:n,prefetchDNS:n,preloadModule:n,preinitModule:n},D);',
      loader: 'js',
    }));
    b.onLoad({ filter: /^react-is-shim$/, namespace: 'shim' }, () => ({
      contents: `var R=window.React;
var FWD=Symbol.for("react.forward_ref"),MEMO=Symbol.for("react.memo"),PORTAL=Symbol.for("react.portal"),LAZY=Symbol.for("react.lazy");
function tt(o){return o!=null&&typeof o==="object"?(R.isValidElement(o)?(o.type&&o.type.$$typeof)||o.type:o.$$typeof):undefined}
exports.typeOf=tt;
exports.isElement=R.isValidElement;
exports.isValidElementType=function(t){return typeof t==="string"||typeof t==="function"||t===R.Fragment||t===R.Suspense||t===R.StrictMode||t===R.Profiler||(t!=null&&typeof t==="object"&&t.$$typeof!=null)};
exports.isFragment=function(o){return R.isValidElement(o)&&o.type===R.Fragment};
exports.isSuspense=function(o){return R.isValidElement(o)&&o.type===R.Suspense};
exports.isPortal=function(o){return o!=null&&o.$$typeof===PORTAL};
exports.isForwardRef=function(o){return tt(o)===FWD};
exports.isMemo=function(o){return tt(o)===MEMO};
exports.isLazy=function(o){return tt(o)===LAZY};
exports.isContextProvider=exports.isContextConsumer=exports.isProfiler=exports.isStrictMode=function(){return false};
exports.ForwardRef=FWD;exports.Memo=MEMO;exports.Portal=PORTAL;exports.Lazy=LAZY;
exports.Fragment=R.Fragment;exports.Suspense=R.Suspense;exports.StrictMode=R.StrictMode;exports.Profiler=R.Profiler;`,
      loader: 'js',
    }));
    b.onLoad({ filter: /^scheduler-shim$/, namespace: 'shim' }, () => ({
      // A DS dist/ rarely imports scheduler directly — when it does, it
      // means react-dom leaked into the dist. Surface it.
      contents: `throw new Error("[SCHEDULER_MISSING] this DS's dist/ imports 'scheduler' directly — usually react-dom leaked into the dist. Check the DS build's externals.");`,
      loader: 'js',
    }));
  },
};

// react-native -> react-native-web. Metro does this via platform-specific
// resolution (`.web.tsx` extension order + a `react-native` alias) baked
// into its resolver; esbuild has neither, so both are reproduced here.
// Resolution is done through Node's own algorithm (createRequire) rather
// than esbuild's resolver so it matches exactly what `node_modules` would
// hand Metro, including react-native-web's own package.json `exports`.
export function rnWebAliasPlugin(nodePaths) {
  const req = createRequire(join(nodePaths, '__rn_web_alias__.js'));
  return {
    name: 'rn-web-alias',
    setup(b) {
      b.onResolve({ filter: /^react-native(\/.*)?$/ }, (args) => {
        const sub = args.path === 'react-native' ? '' : args.path.slice('react-native/'.length);
        const target = sub ? `react-native-web/${sub}` : 'react-native-web';
        try {
          return { path: req.resolve(target) };
        } catch (e) {
          return {
            errors: [{
              text: `[RN_WEB_ALIAS] cannot resolve ${target} (for import "${args.path}"): ${e.message}`,
            }],
          };
        }
      });
    },
  };
}

// `external` leaves a literal require("node:async_hooks") in the bundle;
// esbuild's own browser-platform shim for an external CJS require throws
// "Dynamic require of ... is not supported" the moment the module (expo-font's
// serverContext.web.js) is evaluated — not just when the feature is used. A
// real (fake) module avoids that: AsyncLocalStorage is never actually
// exercised in a static preview, so a no-op stub is enough.
const nodeShimPlugin = {
  name: 'node-builtin-shim',
  setup(b) {
    b.onResolve({ filter: /^node:async_hooks$/ }, () => ({ path: 'node-async-hooks-shim', namespace: 'shim' }));
    b.onLoad({ filter: /^node-async-hooks-shim$/, namespace: 'shim' }, () => ({
      contents: `class AsyncLocalStorage{constructor(){this._s=undefined}run(store,fn,...a){var p=this._s;this._s=store;try{return fn(...a)}finally{this._s=p}}getStore(){return this._s}exit(fn,...a){return fn(...a)}enterWith(store){this._s=store}disable(){}}
exports.AsyncLocalStorage=AsyncLocalStorage;`,
      loader: 'js',
    }));
  },
};

// Metro's platform resolution prefers <name>.web.<ext> over <name>.<ext>
// for any relative/bare import when targeting web — several RN/Expo
// packages (and this repo's own components, e.g. GameMap.web.tsx) ship a
// web-specific file this way. esbuild's default resolveExtensions has no
// concept of platform suffixes, so it's prepended here.
export const RN_WEB_EXTENSIONS = [
  '.web.tsx', '.web.ts', '.web.jsx', '.web.js',
  '.tsx', '.ts', '.jsx', '.js', '.css', '.json',
];

// Build a resolve plugin from tsconfig compilerOptions.paths. esbuild's
// built-in `tsconfig` option only applies paths to files covered by that
// tsconfig, which the synth entry (in OUT) isn't — so we resolve explicitly.
export function tsconfigPathsPlugin(tsconfigPath) {
  let paths, baseUrl;
  try {
    // Strip // and /* */ comments — tsconfig.json permits them, JSON.parse doesn't.
    const raw = readFileSync(tsconfigPath, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    ({ paths, baseUrl = '.' } = JSON.parse(raw).compilerOptions ?? {});
  } catch { return null; }
  if (!paths) return null;
  const base = resolve(dirname(tsconfigPath), baseUrl);
  const rules = Object.entries(paths).map(([k, v]) => ({
    prefix: k.replace(/\*$/, ''),
    targets: (Array.isArray(v) ? v : [v]).map((t) => resolve(base, t.replace(/\*$/, ''))),
    wild: k.endsWith('*'),
  }));
  // Filter on the alias prefixes so the plugin only fires for @/-style paths,
  // not every node_modules import.
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const filter = new RegExp(`^(?:${rules.map((r) => esc(r.prefix)).join('|')})`);
  const exts = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
  return {
    name: 'tsconfig-paths',
    setup(b) {
      b.onResolve({ filter }, (args) => {
        for (const r of rules) {
          if (r.wild ? !args.path.startsWith(r.prefix) : args.path !== r.prefix) continue;
          const tail = r.wild ? args.path.slice(r.prefix.length) : '';
          for (const t of r.targets) {
            const stem = join(t, tail);
            for (const ext of exts) {
              if (existsSync(stem + ext)) return { path: stem + ext };
            }
          }
        }
        return undefined;
      });
    },
  };
}

// Bundle `entry` to a single IIFE at the project root. Returns paths +
// inlinedExternals (npm packages esbuild pulled in, derived from the
// metafile — react/react-dom/react-is are externalized so excluded).
// Options shared by the runtime bundle pass and the export-evidence pass —
// one source so the two resolutions can never drift: a loader or plugin
// present in one but not the other would either throw the evidence pass
// into its silent null-fallback or, worse, make the evidence diverge from
// what the runtime bundle actually contains.
function sharedBuildOptions({ nodePaths, tsconfig }) {
  const pathsPlugin = tsconfig ? tsconfigPathsPlugin(tsconfig) : null;
  const plugins = [reactShim, rnWebAliasPlugin(nodePaths), nodeShimPlugin];
  if (pathsPlugin) plugins.unshift(pathsPlugin);
  return {
    bundle: true,
    platform: 'browser',
    target: 'es2020',
    nodePaths: [nodePaths],
    resolveExtensions: RN_WEB_EXTENSIONS,
    plugins,
    metafile: true,
    loader: {
      '.svg': 'dataurl',
      '.png': 'dataurl',
      '.woff': 'dataurl',
      '.woff2': 'dataurl',
      // RN/Expo asset requires (icon fonts, sfx) that esbuild has no
      // built-in loader for. dataurl is self-contained in the bundle —
      // simplest given the output is a single uploaded _ds_bundle.js.
      '.ttf': 'dataurl',
      '.otf': 'dataurl',
      '.wav': 'dataurl',
      '.mp3': 'dataurl',
      // @expo/vector-icons ships JSX inside plain .js files (not .jsx) —
      // esbuild's default '.js' loader rejects JSX syntax.
      '.js': 'jsx',
    },
    // No '.css' loader override: some DSes ship scss already compiled to
    // .css with css-modules hashes pre-baked, and esbuild's default 'css'
    // loader (unlike 'local-css') preserves them.
    minify: false,
    // RN/Expo source reads `process.*` beyond just NODE_ENV (process.platform,
    // other process.env.* keys, bare `process` for feature checks) — none of
    // that exists as a browser global. `process.env.NODE_ENV` keeps its own
    // entry (most specific match wins in esbuild); the bare `process` entry
    // catches everything else via the banner-defined shim below. Without
    // this the IIFE throws "process is not defined" before its footer can
    // ever assign window.<GLOBAL> — which is why every component then also
    // fails the [BUNDLE_EXPORT] smoke check, not just render.
    define: {
      'process.env.NODE_ENV': '"development"',
      process: '__dsProcessShim',
      // Metro injects __DEV__ as a real global at bundle time; nothing does
      // that for a plain esbuild bundle. false (not true): true pulls in
      // react-native's own dev-mode HMR bootstrap (HMRClient.setup), which
      // expects Metro-injected globals (__METRO_GLOBAL_PREFIX__ etc.) this
      // bundle doesn't have and throws "Missing required parameter `platform`".
      // A static preview has no use for HMR anyway.
      __DEV__: 'false',
      // RN's JS environment (Hermes/JSC via Metro) provides `global` as an
      // alias for the environment's global object; browsers don't.
      global: 'globalThis',
    },
    banner: {
      // EXPO_PUBLIC_SUPABASE_* values are the documented `supabase start`
      // local-dev defaults from ui/.env.example (same anon key on every
      // machine, not a secret) — lib/supabase.ts throws at module init if
      // these are unset, which previously took down every component that
      // transitively imports it. Sentry DSN / Google Maps key stay blank,
      // same as .env.example's own defaults (Sentry disabled, blank map).
      js: 'var __dsProcessShim={env:{NODE_ENV:"development",EXPO_PUBLIC_SUPABASE_URL:"http://127.0.0.1:54321",EXPO_PUBLIC_SUPABASE_ANON_KEY:"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlLWRlbW8iLCJpYXQiOjE2NDE3Njk2MDAsImV4cCI6MTc5OTUzNjAwMH0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE",EXPO_PUBLIC_SENTRY_DSN:"",EXPO_PUBLIC_GOOGLE_MAPS_API_KEY:""},platform:"web",browser:true,version:"",versions:{node:""},nextTick:function(fn){setTimeout(fn,0)},cwd:function(){return "/"},argv:[]};',
    },
  };
}

export async function bundleToIife({ entry, globalName, nodePaths, out, tsconfig }) {
  const bundleJs = join(out, '_ds_bundle.js');
  const bundleCss = join(out, '_ds_bundle.css');
  const shared = sharedBuildOptions({ nodePaths, tsconfig });
  let buildResult;
  try {
    buildResult = await build({
      ...shared,
      entryPoints: [entry],
      format: 'iife',
      globalName,
      // __dsMainNs (set by package-build when extraEntries are present) is
      // the main package's runtime namespace — Object.assign it over the
      // merged IIFE exports so main-package names win over icon collisions.
      footer: { js: `window.${globalName}=${globalName}.__dsMainNs?Object.assign({},${globalName},${globalName}.__dsMainNs,{__dsMainNs:undefined}):${globalName};` },
      outfile: bundleJs,
      logLevel: 'warning',
      // iife can't evaluate import.meta.url natively — define it here only.
      // The esm evidence pass supports it natively, and a define is not
      // resolution-affecting, so the two graphs still resolve identically.
      // Merged over the shared define (a bare override would drop NODE_ENV).
      define: { ...shared.define, ...IIFE_IMPORT_META_DEFINE },
    });
  } catch (e) {
    // Tag unbuilt workspace siblings — package exists in node_modules but its
    // entry points at a dist/ that hasn't been built.
    const unresolved = [...new Set((e.errors ?? []).map((er) => er.text.match(/Could not resolve "([^"]+)"/)?.[1]).filter(Boolean))];
    const siblings = unresolved.filter((p) => {
      const pj = join(nodePaths, p, 'package.json');
      if (!existsSync(pj)) return false;
      try {
        const j = JSON.parse(readFileSync(pj, 'utf8'));
        const ent = j.module ?? j.main ?? 'index.js';
        return !existsSync(join(nodePaths, p, ent));
      } catch { return false; }
    });
    if (siblings.length) {
      console.error(
        `[WORKSPACE_SIBLING] ${siblings.join(', ')} exist in node_modules but aren't built (no dist entry). ` +
          `Run their build, or npm install the published versions.`,
      );
    } else if (unresolved.length) {
      console.error(`[UNRESOLVED_IMPORT] ${unresolved.join(', ')} — missing from node_modules.`);
    }
    throw e;
  }
  const REACT_PKGS = new Set(['react', 'react-dom', 'react-is']);
  const inlinedExternals = [
    ...new Set(
      Object.keys(buildResult?.metafile?.inputs ?? {})
        .map((p) => p.match(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)\//)?.[1])
        .filter((pkg) => pkg && !REACT_PKGS.has(pkg)),
    ),
  ].sort();
  console.error(`  bundle: ${(statSync(bundleJs).size / 1024).toFixed(0)} KB`);
  console.error(`  inlined npm packages: ${inlinedExternals.length}`);
  return { bundleJs, bundleCss, inlinedExternals };
}

// Evidence pass for the provider gate: rebuild the same entry as ESM
// (write:false, nothing touches disk) and read esbuild's own export list —
// the same resolution that produced the runtime bundle, so presence/absence
// is provable where a .d.ts scan is heuristic. One residual unknowable:
// `export * from <cjs>` isn't statically enumerable (esbuild emits a
// runtime __reExport and the names are missing from `exports`), and the
// metafile carries no signal for WHICH import is a star — so any bundled
// CJS input downgrades absence from provable to unverifiable (cjsPresent).
// That over-triggers for plain CJS imports (a bundled lodash softens the
// gate), which is the accepted price of never minting a false fatal.
// Returns null on ANY failure: the caller must fall back to scan evidence —
// this pass may only ever change a gate verdict, never fail a build the
// real bundle pass accepted.
export async function bundleExportEvidence({ entry, nodePaths, tsconfig }) {
  try {
    const r = await build({
      ...sharedBuildOptions({ nodePaths, tsconfig }),
      entryPoints: [entry],
      format: 'esm',
      write: false,
      outfile: '__ds_export_evidence.mjs',
      logLevel: 'silent',
    });
    const out = Object.values(r.metafile?.outputs ?? {})[0];
    const exports = new Set((out?.exports ?? []).filter((n) => n !== '__dsMainNs'));
    // The react-family shims are authored as CJS and appear in every build's
    // inputs under the 'shim:' namespace — they can't hide DS names, so
    // only genuinely-bundled CJS counts toward the unverifiable signal.
    const cjsPresent = Object.entries(r.metafile?.inputs ?? {}).some(
      ([k, i]) => i.format === 'cjs' && !k.startsWith('shim:'),
    );
    return { exports, cjsPresent };
  } catch {
    return null;
  }
}

// Prepend the `/* @ds-bundle: {…} */` first-line header. The
// claude.ai/design app reads this; format is load-bearing — namespace +
// components feed the consuming agent and the ds_manifest;
// sourceHashes + inlinedExternals drive the keep-vs-rebuild decision.
// `*/` inside the JSON is escaped so the comment can't terminate early.
export function stampHeader(bundleJs, { namespace, components, inlinedExternals }) {
  const body = readFileSync(bundleJs, 'utf8');
  const out = dirname(bundleJs);
  // Keyed by per-component output paths — what decideBundleRebuild compares
  // against. Includes .d.ts and .prompt.md so contract/doc-only edits also
  // surface in the incremental-upload diff.
  const sourceHashes = Object.fromEntries(
    components.flatMap((c) => {
      const base = `components/${c.group}/${c.name}/${c.name}`;
      return ['.jsx', '.d.ts', '.prompt.md']
        .map((ext) => base + ext)
        .filter((rel) => existsSync(join(out, rel)))
        .map((rel) => [rel, createHash('sha256').update(readFileSync(join(out, rel))).digest('hex').slice(0, 12)]);
    }),
  );
  const meta = {
    namespace,
    components: components.map((c) => ({
      name: c.name,
      sourcePath: `components/${c.group}/${c.name}/${c.name}.jsx`,
    })),
    sourceHashes,
    inlinedExternals,
    builtBy: 'cc-design-sync',
  };
  const headerJson = JSON.stringify(meta).replace(/\*\//g, '*\\/');
  writeFileSync(bundleJs, `/* @ds-bundle: ${headerJson} */\n` + body);
}
