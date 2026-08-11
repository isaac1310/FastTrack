/* Build FastTrack from source into deploy/.
 *
 *   fast-tracker.html ──┬──> deploy/index.html      (scripts inlined)
 *   app.js  ui.js       ├──> deploy/fasttrack.html  (standalone, one file)
 *   selftest.js         └──> deploy/{sw.js,assets/*}
 *
 * Nothing in deploy/ is edited by hand and nothing there is committed —
 * Vercel runs this on every deploy, so a stale build is impossible.
 *
 *   node build.mjs
 *
 * Node stdlib only. Zero dependencies is a hard constraint of this project.
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SRC = "fast-tracker.html";
const OUT = "deploy";
const SCRIPTS = ["app.js", "ui.js", "selftest.js"];

const shell = readFileSync(SRC, "utf8");
const sources = Object.fromEntries(SCRIPTS.map((f) => [f, readFileSync(f, "utf8")]));

/* Fail loudly rather than shipping a broken app. A syntax error in any
   source file must stop the build, not reach the phone. */
for (const [name, code] of Object.entries(sources)) {
  try { new Function(code); }
  catch (e) { throw new Error(`syntax error in ${name}: ${e.message}`); }
}

const version = (sources["app.js"].match(/APP_VERSION\s*=\s*"([^"]+)"/) || [])[1];
if (!version) throw new Error("could not read APP_VERSION from app.js");

/* The service worker's cache key must track the app version, or a deploy
   is served from a stale cache and the fix is invisible on the phone. */
let sw = readFileSync("sw.js", "utf8");
const swVersion = (sw.match(/VERSION\s*=\s*"ft-([^"]+)"/) || [])[1];
if (swVersion !== version) {
  console.warn(`  ! sw.js cache key was ft-${swVersion}, bumping to ft-${version}`);
  sw = sw.replace(/VERSION\s*=\s*"ft-[^"]+"/, `VERSION = "ft-${version}"`);
  writeFileSync("sw.js", sw);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "assets"), { recursive: true });

/* ---- 1. hosted build: real files, cacheable separately ---- */
writeFileSync(join(OUT, "index.html"), shell);
for (const f of SCRIPTS) writeFileSync(join(OUT, f), sources[f]);
writeFileSync(join(OUT, "sw.js"), sw);
for (const f of readdirSync("assets")) copyFileSync(join("assets", f), join(OUT, "assets", f));

/* ---- 2. standalone: everything inlined into one openable file ---- */
let standalone = shell;
for (const f of SCRIPTS) {
  const tag = `<script src="${f}"></script>`;
  if (!standalone.includes(tag)) throw new Error(`shell is missing the ${f} script tag`);
  standalone = standalone.replace(tag, `<script>\n${sources[f]}\n</script>`);
}
// no service worker and no separate manifest in a file:// build
standalone = standalone
  .replace(/<link rel="manifest"[^>]*>\n?/, "")
  .replace(/<link rel="apple-touch-icon"[^>]*>\n?/, "");
writeFileSync(join(OUT, "fasttrack.html"), standalone);

/* ---- 3. demo entry points, for design review ---- */
for (const [name, val] of [["fasting", "1"], ["behind", "behind"], ["empty", "empty"]]) {
  writeFileSync(
    join(OUT, `demo-${name}.html`),
    shell.replace('<script src="app.js"></script>', `<script>window.__DEMO="${val}";</script>\n<script src="app.js"></script>`)
  );
}

const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(1) + "kb";
console.log(`FastTrack v${version} → ${OUT}/`);
console.log(`  index.html      ${kb(shell)}  (+ ${SCRIPTS.length} scripts)`);
console.log(`  fasttrack.html  ${kb(standalone)}  standalone`);
console.log(`  sw.js           cache key ft-${version}`);
