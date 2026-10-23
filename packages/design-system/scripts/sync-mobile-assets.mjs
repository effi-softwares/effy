// Syncs the shared mobile assets (icons and Geist) into each KMP app. Compose resources must sit inside
// the consuming module, so each app holds committed copies and `mobile-assets:check` fails on drift.
// Never hand-edit an app's composeResources/{drawable,font}: edit mobile-assets/ and re-run this.

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(here, "../mobile-assets");

/** The apps that consume the shared assets. */
export const APPS = [
  { name: "customer-mobile", root: resolve(here, "../../../apps/customer-mobile/shared/src/commonMain/composeResources") },
  { name: "driver-mobile", root: resolve(here, "../../../apps/driver-mobile/shared/src/commonMain/composeResources") },
];

const KINDS = ["drawable", "font"];

/** Every (kind, file) pair the source declares. */
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

/** Files present in an app's composeResources that the shared source does not declare. */
export function orphansFor(app, declared) {
  const known = new Set(declared.map((f) => `${f.kind}/${f.name}`));
  const out = [];
  for (const kind of KINDS) {
    const dir = join(app.root, kind);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!statSync(join(dir, name)).isFile()) continue;
      // compose-multiplatform.xml is the KMP template's own placeholder, owned by the app.
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

// Only sync when run directly; the check imports the helpers above.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  sync();
}
