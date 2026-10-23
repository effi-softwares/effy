// TARGETS — the full surface × slot × colourway × composition × output-path matrix (024 contract §3).
//
// Every surface carries the ONE `tile` colourway: the same "e." icon everywhere.
//
// ⚠ Every path below is fixed BY THE CONSUMING PLATFORM. Xcode asset catalogs, Gradle resource
// merging and Next.js file-convention metadata each discover these by convention. Moving one
// somewhere "tidier" does not fail loudly — it produces a build with no icon.
//
// ⚠ RULE T4 — no two targets may write the same path. Enforced below.

import { COLOURWAYS } from "./colourways.mjs"

/** kind: how the asset is produced. */
export const KIND = {
  PNG: "png", // rasterised at each declared size
  ICO: "ico", // multi-size container
  SVG: "svg", // the composed vector, written as-is
  VD: "vector-drawable", // Android VectorDrawable
  VD_SOLID: "vector-drawable-solid", // flat colour layer
}

const ANDROID_MIPMAP = [
  ["mdpi", 48],
  ["hdpi", 72],
  ["xhdpi", 96],
  ["xxhdpi", 144],
  ["xxxhdpi", 192],
]

/**
 * The standalone SVGs — the logo in both appearances and the icon — for use outside the apps
 * (a deck, a store listing, an email signature). Written by the generator like everything else.
 */
export const EXPORT_DIR = "packages/brand/svg"
export const EXPORTS = {
  logoLight: `${EXPORT_DIR}/effy-logo-light.svg`,
  logoDark: `${EXPORT_DIR}/effy-logo-dark.svg`,
  icon: `${EXPORT_DIR}/effy-icon.svg`,
}

/** Android + iOS assets for one mobile app. `app` is the apps/ directory name. */
function mobileTargets(app, surface, colourway) {
  const res = `apps/${app}/androidApp/src/main/res`
  const xc = `apps/${app}/iosApp/iosApp/Assets.xcassets`
  const t = []

  // ── Android: vector layers (API 26+) ──────────────────────────────────────────────────────────
  t.push({
    surface,
    slot: "android-adaptive-foreground",
    colourway,
    composition: "android-fg",
    kind: KIND.VD,
    sizeDp: 108,
    path: `${res}/drawable/ic_launcher_foreground.xml`,
  })
  t.push({
    surface,
    slot: "android-adaptive-background",
    colourway,
    composition: "android-fg",
    kind: KIND.VD_SOLID,
    // The adaptive BACKGROUND layer is the tile the mark sits on.
    solid: COLOURWAYS[colourway].ground,
    sizeDp: 108,
    path: `${res}/drawable/ic_launcher_background.xml`,
  })
  t.push({
    surface,
    slot: "android-adaptive-monochrome",
    colourway,
    composition: "android-mono",
    // Android re-tints this layer itself, so the authored colour only has to be opaque.
    mono: "#09090b",
    kind: KIND.VD,
    sizeDp: 108,
    path: `${res}/drawable/ic_launcher_monochrome.xml`,
  })
  t.push({
    surface,
    slot: "android-splash-logo",
    colourway,
    composition: "splash",
    kind: KIND.VD,
    sizeDp: 288,
    path: `${res}/drawable/ic_splash_logo.xml`,
  })

  // ── Android: legacy raster mipmaps — API 24–25 ONLY (predate adaptive icons) ───────────────────
  for (const [density, px] of ANDROID_MIPMAP) {
    for (const name of ["ic_launcher", "ic_launcher_round"]) {
      t.push({
        surface,
        slot: `android-legacy-${density}-${name}`,
        colourway,
        composition: "android-legacy",
        kind: KIND.PNG,
        sizes: [px],
        path: `${res}/mipmap-${density}/${name}.png`,
      })
    }
  }

  // ── iOS: the three appearances. All strip alpha (rule P2). ────────────────────────────────────
  t.push({
    surface,
    slot: "ios-app-icon",
    colourway,
    composition: "ios-app",
    kind: KIND.PNG,
    sizes: [1024],
    path: `${xc}/AppIcon.appiconset/app-icon-1024.png`,
  })
  t.push({
    surface,
    slot: "ios-app-icon-dark",
    colourway,
    composition: "ios-dark",
    kind: KIND.PNG,
    sizes: [1024],
    path: `${xc}/AppIcon.appiconset/app-icon-1024-dark.png`,
  })
  t.push({
    surface,
    slot: "ios-app-icon-tinted",
    colourway,
    composition: "ios-tinted",
    mono: "#ffffff",
    kind: KIND.PNG,
    sizes: [1024],
    path: `${xc}/AppIcon.appiconset/app-icon-1024-tinted.png`,
  })

  // ── iOS: launch screen assets ─────────────────────────────────────────────────────────────────
  for (const [suffix, px] of [["", 192], ["@2x", 384], ["@3x", 576]]) {
    t.push({
      surface,
      slot: `ios-launch-logo${suffix}`,
      colourway,
      composition: "splash",
      kind: KIND.PNG,
      sizes: [px],
      path: `${xc}/LaunchLogo.imageset/launch-logo${suffix}.png`,
    })
  }

  return t
}

/** Favicon set for a Vite SPA (public/ + explicit <link> tags in index.html). */
/**
 * @param {boolean} [pwa] 059 — also emit the four manifest icons. Default false, so back-office is
 *   byte-identical and only the surface that declares a manifest carries icons for one.
 */
function viteWebTargets(app, surface, colourway, pwa = false) {
  const pub = `apps/${app}/public`
  const pwaTargets = !pwa
    ? []
    : [
        // ⚠ BOTH PURPOSES, MIRRORING customer-web's SET EXACTLY. customer-web's own comment records
        // why: declaring only `maskable` makes a launcher that expects an unmasked icon show a
        // visibly over-zoomed mark, because the maskable composition already contains the safe-zone
        // padding the launcher is about to add again.
        {
          surface,
          slot: "pwa-192",
          colourway,
          composition: "maskable",
          kind: KIND.PNG,
          sizes: [192],
          path: `${pub}/web-app-manifest-192x192.png`,
        },
        {
          surface,
          slot: "pwa-512",
          colourway,
          composition: "maskable",
          kind: KIND.PNG,
          sizes: [512],
          path: `${pub}/web-app-manifest-512x512.png`,
        },
        {
          surface,
          slot: "pwa-any-192",
          colourway,
          composition: "web-icon",
          kind: KIND.PNG,
          sizes: [192],
          path: `${pub}/web-app-icon-192.png`,
        },
        {
          surface,
          slot: "pwa-any-512",
          colourway,
          composition: "web-icon",
          kind: KIND.PNG,
          sizes: [512],
          path: `${pub}/web-app-icon-512.png`,
        },
        // ⚠ THE NOTIFICATION BADGE — a separate asset, not a resized icon. Android renders
        // `badge` as a MONOCHROME silhouette in the status bar: every non-transparent pixel becomes
        // white and everything else is dropped. A full-colour icon used here arrives as a solid
        // white blob — so this is the mark alone, in one colour, on nothing.
        {
          surface,
          slot: "pwa-badge",
          colourway,
          composition: "badge",
          mono: "#ffffff",
          kind: KIND.PNG,
          sizes: [96],
          path: `${pub}/notification-badge-96.png`,
        },
      ]
  return [
    {
      surface,
      slot: "favicon-ico",
      colourway,
      composition: "favicon",
      kind: KIND.ICO,
      sizes: [16, 32, 48],
      path: `${pub}/favicon.ico`,
    },
    {
      surface,
      slot: "favicon-svg",
      colourway,
      composition: "web-icon",
      kind: KIND.SVG,
      path: `${pub}/icon.svg`,
    },
    {
      surface,
      slot: "apple-touch-icon",
      colourway,
      composition: "apple-touch",
      kind: KIND.PNG,
      sizes: [180],
      path: `${pub}/apple-touch-icon.png`,
    },
    ...pwaTargets,
  ]
}

export const TARGETS = [
  // ── customer-web — Next.js App Router file conventions ────────────────────────────────────────
  {
    surface: "customer-web",
    slot: "favicon-svg",
    colourway: "tile",
    composition: "web-icon",
    kind: KIND.SVG,
    path: "apps/customer-web/app/icon.svg",
  },
  {
    surface: "customer-web",
    slot: "favicon-ico",
    colourway: "tile",
    composition: "favicon",
    kind: KIND.ICO,
    sizes: [16, 32, 48],
    path: "apps/customer-web/app/favicon.ico",
  },
  {
    surface: "customer-web",
    slot: "apple-touch-icon",
    colourway: "tile",
    composition: "apple-touch",
    kind: KIND.PNG,
    sizes: [180],
    path: "apps/customer-web/app/apple-icon.png",
  },
  {
    surface: "customer-web",
    slot: "pwa-192",
    colourway: "tile",
    composition: "maskable",
    kind: KIND.PNG,
    sizes: [192],
    path: "apps/customer-web/public/web-app-manifest-192x192.png",
  },
  {
    surface: "customer-web",
    slot: "pwa-512",
    colourway: "tile",
    composition: "maskable",
    kind: KIND.PNG,
    sizes: [512],
    path: "apps/customer-web/public/web-app-manifest-512x512.png",
  },
  // A non-maskable pair, so the manifest can declare BOTH purposes. Declaring only `maskable`
  // (which is what shipped before this feature) makes launchers that expect an unmasked icon show a
  // visibly over-zoomed mark.
  {
    surface: "customer-web",
    slot: "pwa-any-192",
    colourway: "tile",
    composition: "web-icon",
    kind: KIND.PNG,
    sizes: [192],
    path: "apps/customer-web/public/web-app-icon-192.png",
  },
  {
    surface: "customer-web",
    slot: "pwa-any-512",
    colourway: "tile",
    composition: "web-icon",
    kind: KIND.PNG,
    sizes: [512],
    path: "apps/customer-web/public/web-app-icon-512.png",
  },

  // ── shop-web · back-office ────────────────────────────────────────────────────────────────────
  // ⚠ 059 — shop-web is the platform's first installable console, so it is the only Vite surface
  // that takes the manifest icons.
  ...viteWebTargets("shop-web", "shop-web", "tile", true),
  ...viteWebTargets("back-office", "back-office", "tile"),

  // ── mobile ────────────────────────────────────────────────────────────────────────────────────
  ...mobileTargets("customer-mobile", "customer-mobile", "tile"),
  // 092 — the driver app gets the same set of icons and splash as the customer app (out of scope before).
  // 092 — its own mark: the "e." whose full stop is a blue steering wheel (src/logo-driver.svg).
  ...mobileTargets("driver-mobile", "driver-mobile", "driver").map((t) => ({ ...t, mark: "driver" })),
]

// ⚠ RULE T4 — collisions mean silent overwrite ordering. Fail at import time, not at write time.
{
  const seen = new Set()
  for (const t of TARGETS) {
    if (seen.has(t.path)) throw new Error(`targets: duplicate output path '${t.path}' (rule T4)`)
    seen.add(t.path)
  }
}

/** Directories the drift check treats as managed — an undeclared file here is an orphan. */
/**
 * Directories the generator OWNS. Anything inside one of these that no target declares is an ORPHAN
 * — a left-behind asset that still ships and that nobody maintains.
 *
 * ⚠ Only ASSET-ONLY directories may be listed. A directory that mixes generated assets with
 * hand-written source (notably `apps/customer-web/app/`, where the Next.js App Router file
 * conventions put icon.svg / favicon.ico / apple-icon.png alongside every route file) cannot go here:
 * walking it would report every page.tsx as an orphan. That gap is real and recorded in
 * `orphanCoverage()` below rather than left implicit.
 *
 * ⚠ 026 widened this list. The mipmap and AppIcon directories were NOT watched, so a stale legacy
 * mipmap or a leftover app icon could survive a colourway change indefinitely — which is exactly the
 * failure mode 024 wrote this check for. Found by deliberately planting an orphan and watching the
 * check pass.
 */
export const MANAGED_DIRS = [
  EXPORT_DIR,
  "apps/customer-web/public",
  "apps/shop-web/public",
  "apps/back-office/public",
  "apps/customer-mobile/androidApp/src/main/res/drawable",
  "apps/driver-mobile/androidApp/src/main/res/drawable",
  "apps/customer-mobile/iosApp/iosApp/Assets.xcassets/LaunchLogo.imageset",
  "apps/driver-mobile/iosApp/iosApp/Assets.xcassets/LaunchLogo.imageset",
  ...["customer-mobile", "driver-mobile"].flatMap((app) => [
    ...ANDROID_MIPMAP.map(([density]) => `apps/${app}/androidApp/src/main/res/mipmap-${density}`),
    `apps/${app}/iosApp/iosApp/Assets.xcassets/AppIcon.appiconset`,
  ]),
]

/**
 * Files inside a managed directory that the generator does NOT write but that legitimately live
 * there: platform sidecars the toolchain owns. Listing them is narrower — and far more honest — than
 * silently not watching their directory.
 *
 * ⚠ `robots.txt` was added by 048, which put a disallow-all `robots.txt` in each internal console's
 * `public/` (shop-web and back-office are login-gated and must not be indexed) and did NOT exempt it
 * here — so `brand-check` reported both as ORPHANED and `pnpm -r test` aborted at `packages/brand`
 * before most of the workspace had run. Same class as 039's hero photograph: a file the brand
 * generator neither writes nor could have an opinion about. Found by 052's baseline sweep; it is not
 * 052's file and not 052's defect.
 */
export const MANAGED_DIR_EXEMPT = ["Contents.json", ".gitkeep", "robots.txt"]

/**
 * Directories INSIDE a managed directory that hold editorial CONTENT rather than generated assets.
 *
 * ⚠ Added by 039, which put an operator-supplied hero photograph in `apps/customer-web/public/hero/`
 * and immediately failed this check as an "orphaned brand asset". It is not one: the brand generator
 * neither writes it nor could, because it is a photograph somebody chose, not a rendering of the mark.
 *
 * ⚠ Exempting the SUBDIRECTORY rather than stopping watching `public/` is the point. `public/` is
 * exactly where a stale favicon or a hand-edited icon would hide, and that is what this check exists
 * to catch. Anything added here must be content the generator has no opinion about — if a future
 * entry is really a generated asset, it belongs in a target, not in this list.
 */
export const MANAGED_SUBDIR_EXEMPT = ["apps/customer-web/public/hero"]

/** Asset locations this check knowingly does NOT cover, so the limitation is greppable. */
export function orphanCoverage() {
  return {
    unwatched: ["apps/customer-web/app"],
    reason:
      "mixes generated App Router icons with route source; walking it would flag every page as an orphan",
  }
}
