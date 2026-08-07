// TARGETS — the full surface × slot × colourway × composition × output-path matrix (024 contract §3).
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
    // 026: the adaptive BACKGROUND layer is the tile the mark sits on, so it carries the polarity.
    // It was a hardcoded white; a white tile under shop's light mark would erase the mark entirely.
    solid: COLOURWAYS[colourway].ground,
    sizeDp: 108,
    path: `${res}/drawable/ic_launcher_background.xml`,
  })
  t.push({
    surface,
    slot: "android-adaptive-monochrome",
    colourway,
    composition: "android-mono",
    // Android re-tints this layer itself, so the authored colour only has to be opaque and let the
    // silhouette read. It is the outline slot's value, not the retired navy.
    mono: "#0A0A0A",
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
function viteWebTargets(app, surface, colourway) {
  const pub = `apps/${app}/public`
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
  ]
}

export const TARGETS = [
  // ── customer-web — Next.js App Router file conventions (Light polarity) ───────────────────────
  {
    surface: "customer-web",
    slot: "favicon-svg",
    colourway: "light",
    composition: "web-icon",
    kind: KIND.SVG,
    path: "apps/customer-web/app/icon.svg",
  },
  {
    surface: "customer-web",
    slot: "favicon-ico",
    colourway: "light",
    composition: "favicon",
    kind: KIND.ICO,
    sizes: [16, 32, 48],
    path: "apps/customer-web/app/favicon.ico",
  },
  {
    surface: "customer-web",
    slot: "apple-touch-icon",
    colourway: "light",
    composition: "apple-touch",
    kind: KIND.PNG,
    sizes: [180],
    path: "apps/customer-web/app/apple-icon.png",
  },
  {
    surface: "customer-web",
    slot: "pwa-192",
    colourway: "light",
    composition: "maskable",
    kind: KIND.PNG,
    sizes: [192],
    path: "apps/customer-web/public/web-app-manifest-192x192.png",
  },
  {
    surface: "customer-web",
    slot: "pwa-512",
    colourway: "light",
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
    colourway: "light",
    composition: "web-icon",
    kind: KIND.PNG,
    sizes: [192],
    path: "apps/customer-web/public/web-app-icon-192.png",
  },
  {
    surface: "customer-web",
    slot: "pwa-any-512",
    colourway: "light",
    composition: "web-icon",
    kind: KIND.PNG,
    sizes: [512],
    path: "apps/customer-web/public/web-app-icon-512.png",
  },

  // ── shop-web (Dark polarity) · back-office (Mid) ──────────────────────────────────────────────
  ...viteWebTargets("shop-web", "shop-web", "dark"),
  ...viteWebTargets("back-office", "back-office", "mid"),

  // ── mobile ────────────────────────────────────────────────────────────────────────────────────
  ...mobileTargets("customer-mobile", "customer-mobile", "light"),
  ...mobileTargets("shop-mobile", "shop-mobile", "dark"),
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
  "apps/customer-web/public",
  "apps/shop-web/public",
  "apps/back-office/public",
  "apps/customer-mobile/androidApp/src/main/res/drawable",
  "apps/shop-mobile/androidApp/src/main/res/drawable",
  "apps/customer-mobile/iosApp/iosApp/Assets.xcassets/LaunchLogo.imageset",
  "apps/shop-mobile/iosApp/iosApp/Assets.xcassets/LaunchLogo.imageset",
  ...["customer-mobile", "shop-mobile"].flatMap((app) => [
    ...ANDROID_MIPMAP.map(([density]) => `apps/${app}/androidApp/src/main/res/mipmap-${density}`),
    `apps/${app}/iosApp/iosApp/Assets.xcassets/AppIcon.appiconset`,
  ]),
]

/**
 * Files inside a managed directory that the generator does NOT write but that legitimately live
 * there: platform sidecars the toolchain owns. Listing them is narrower — and far more honest — than
 * silently not watching their directory.
 */
export const MANAGED_DIR_EXEMPT = ["Contents.json", ".gitkeep"]

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
