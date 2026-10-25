import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(here, "../mobile-assets");

export const APPS = [
  { name: "customer-mobile", root: resolve(here, "../../../apps/customer-mobile/shared/src/commonMain/composeResources") },
  { name: "driver-mobile", root: resolve(here, "../../../apps/driver-mobile/shared/src/commonMain/composeResources") },
];

const KINDS = ["drawable", "font"];

export function sourceFiles() {
  const out = [];
  for (const kind of KINDS) {
    const dir = join(SOURCE, kind);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).sort()) {
      if (statSync(join(dir, name)).isFile()) out.push({ kind, name });
    }
  }
  return out;
}

export function orphansFor(app, declared) {
  const known = new Set(declared.map((f) => `${f.kind}/${f.name}`));
  const out = [];
  for (const kind of KINDS) {
    const dir = join(app.root, kind);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!statSync(join(dir, name)).isFile()) continue;
      if (name === "compose-multiplatform.xml") continue;
      if (!known.has(`${kind}/${name}`)) out.push({ kind, name });
    }
  }
  return out;
}

export function isStale(app, file) {
  const from = join(SOURCE, file.kind, file.name);
  const to = join(app.root, file.kind, file.name);
  if (!existsSync(to)) return true;
  return !readFileSync(from).equals(readFileSync(to));
}

function sync() {
  const files = sourceFiles();
  if (files.length === 0) {
    console.error("sync-mobile-assets: no source assets found under packages/design-system/mobile-assets");
    process.exit(1);
  }

  let written = 0;
  let total = 0;
  for (const app of APPS) {
    total += files.length;
    for (const kind of KINDS) mkdirSync(join(app.root, kind), { recursive: true });
    for (const file of files) {
      if (!isStale(app, file)) continue;
      copyFileSync(join(SOURCE, file.kind, file.name), join(app.root, file.kind, file.name));
      written += 1;
    }
  }
  console.log(
    `sync-mobile-assets: ${total} asset copies across ${APPS.length} apps (${written} file(s) updated)`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  sync();
}
