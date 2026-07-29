// Sync the shared mobile assets (navigation icons + the platform typeface) into every KMP app that
// consumes them.
//
// ── Why a sync rather than a shared source directory ────────────────────────────────────────────
//
// Kotlin source CAN be shared by pointing a Gradle `kotlin.srcDir` at packages/mobile-kit — that is
// how EffyComponents, ResponsiveNavigation and the rest are shared, with no copies at all.
//
// Compose RESOURCES cannot. The `composeResources` convention requires the files to sit inside the
// consuming module, and the generated `Res` accessors are minted per module. No srcDir can change
// that.
//
// So the assets follow the pattern this repo already uses for exactly this situation — the one
// packages/brand uses for its 57 committed icon/splash artifacts: ONE authored source, derived copies
// committed per surface, and a drift check that fails the build and names the stale surface. The
// copies are build outputs that happen to live in git, not duplicated sources of truth.
//
// ⚠ Do NOT hand-edit anything under an app's composeResources/{drawable,font}. Edit
// packages/design-system/mobile-assets/ and re-run this.

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(here, "../mobile-assets");

/**
 * The apps that consume the shared assets.
 *
 * ⚠ driver-mobile takes FONTS ONLY (026 T025a). It is still the untouched KMP template with no
 * navigation, so syncing the nav icons would create files nothing references and a drift surface
 * nobody maintains — but the TYPEFACE is different: constitution Principle V requires it on every
 * surface, and its generated EffyTypography.kt imports the font accessors, so the files must be
 * there for the theme to compile. It gains `drawable` when it gets its shell.
 */
export const APPS = [
  { name: "customer-mobile", kinds: ["drawable", "font"], root: resolve(here, "../../../apps/customer-mobile/shared/src/commonMain/composeResources") },
  { name: "shop-mobile", kinds: ["drawable", "font"], root: resolve(here, "../../../apps/shop-mobile/shared/src/commonMain/composeResources") },
  { name: "driver-mobile", kinds: ["font"], root: resolve(here, "../../../apps/driver-mobile/shared/src/commonMain/composeResources") },
];

const KINDS = ["drawable", "font"];

/** The kinds a given app consumes. Apps without an explicit list take everything. */
export function kindsFor(app) {
  return app.kinds ?? KINDS;
}

/** Every (kind, file) pair the source declares, optionally narrowed to one app's kinds. */
export function sourceFiles(app) {
  const out = [];
  for (const kind of app ? kindsFor(app) : KINDS) {
    const dir = join(SOURCE, kind);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).sort()) {
      if (statSync(join(dir, name)).isFile()) out.push({ kind, name });
    }
  }
  return out;
}

/** Files present in an app's composeResources that the shared source does NOT declare. */
export function orphansFor(app, declared) {
  const known = new Set(declared.map((f) => `${f.kind}/${f.name}`));
  const out = [];
  for (const kind of kindsFor(app)) {
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
  if (sourceFiles().length === 0) {
    console.error("sync-mobile-assets: no source assets found under packages/design-system/mobile-assets");
    process.exit(1);
  }

  let written = 0;
  let total = 0;
  for (const app of APPS) {
    const files = sourceFiles(app);
    total += files.length;
    for (const kind of kindsFor(app)) mkdirSync(join(app.root, kind), { recursive: true });
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
