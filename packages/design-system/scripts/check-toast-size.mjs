/**
 * The toast must stay small enough for the storefront's guest pages (feature 120, research R7). It is bundled the way
 * the storefront ships it - `toast` and `Toaster` only, minified, React left to the app, code that is fetched on
 * demand (the sound set) split off - and the first load fails above its budget.
 */
import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// research R7: the rules and live regions only (3.2 KB, 2026-11-13); the drawing code is fetched on demand.
// The storefront's own page budget is the final word.
const LIMIT = 4 * 1024;
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const result = await build({
  // What the storefront uses. Through the package it is the same: `sideEffects: false` lets its bundler drop the rest.
  stdin: {
    contents: 'export { toast } from "./src/toast/instance.ts"; export { Toaster } from "./src/toast/Toaster.tsx";',
    resolveDir: root,
    loader: "ts",
  },
  bundle: true,
  minify: true,
  splitting: true,
  format: "esm",
  platform: "browser",
  outdir: resolve(root, ".toast-size"),
  write: false,
  metafile: true,
  jsx: "automatic",
  external: ["react", "react-dom", "react/jsx-runtime"],
});

// The first load is the entry plus whatever it imports statically; a dynamic import() is fetched only when used.
const outputs = result.metafile.outputs;
const entry = Object.keys(outputs).find((k) => outputs[k].entryPoint);
const firstLoad = new Set();
const walk = (key) => {
  if (firstLoad.has(key)) return;
  firstLoad.add(key);
  for (const i of outputs[key].imports) if (i.kind === "import-statement" && outputs[i.path]) walk(i.path);
};
walk(entry);

const files = new Map(result.outputFiles.map((f) => [f.path, f.contents]));
const gz = (key) => gzipSync(files.get(resolve(process.cwd(), key)) ?? files.get(resolve(root, key)) ?? new Uint8Array()).length;
const bytes = [...firstLoad].reduce((n, k) => n + gz(k), 0);
const later = Object.keys(outputs).filter((k) => !firstLoad.has(k) && k.endsWith(".js")).reduce((n, k) => n + gz(k), 0);

const kb = (n) => `${(n / 1024).toFixed(2)} KB`;
if (bytes > LIMIT) {
  console.error(`check-toast-size: FAILED - the toast's first load is ${kb(bytes)} gzipped, over its ${kb(LIMIT)} budget.`);
  process.exit(1);
}
console.log(`check-toast-size: OK - first load ${kb(bytes)} gzipped (budget ${kb(LIMIT)}); fetched on demand ${kb(later)}`);
