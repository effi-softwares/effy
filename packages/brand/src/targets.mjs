// TARGETS — the full surface × slot × colourway × composition × output-path matrix (024 contract §3).
//
// ⚠ Every path below is fixed BY THE CONSUMING PLATFORM. Xcode asset catalogs, Gradle resource
// merging and Next.js file-convention metadata each discover these by convention. Moving one
// somewhere "tidier" does not fail loudly — it produces a build with no icon.
//
// ⚠ RULE T4 — no two targets may write the same path. Enforced below.

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
    solid: "#ffffff",
    sizeDp: 108,
    path: `${res}/drawable/ic_launcher_background.xml`,
  })
  t.push({
    surface,
    slot: "android-adaptive-monochrome",
    colourway,
    composition: "android-mono",
    mono: "#0C1D36",
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
  // ── customer-web — Next.js App Router file conventions (Emerald) ───────────────────────────────
  {
    surface: "customer-web",
    slot: "favicon-svg",
    colourway: "emerald",
    composition: "web-icon",
    kind: KIND.SVG,
    path: "apps/customer-web/app/icon.svg",
  },
  {
    surface: "customer-web",
    slot: "favicon-ico",
    colourway: "emerald",
    composition: "favicon",
    kind: KIND.ICO,
    sizes: [16, 32, 48],
    path: "apps/customer-web/app/favicon.ico",
  },
  {
    surface: "customer-web",
    slot: "apple-touch-icon",
    colourway: "emerald",
    composition: "apple-touch",
    kind: KIND.PNG,
    sizes: [180],
    path: "apps/customer-web/app/apple-icon.png",
  },
  {
    surface: "customer-web",
    slot: "pwa-192",
    colourway: "emerald",
    composition: "maskable",
    kind: KIND.PNG,
    sizes: [192],
    path: "apps/customer-web/public/web-app-manifest-192x192.png",
  },
  {
    surface: "customer-web",
    slot: "pwa-512",
    colourway: "emerald",
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
    colourway: "emerald",
    composition: "web-icon",
    kind: KIND.PNG,
    sizes: [192],
    path: "apps/customer-web/public/web-app-icon-192.png",
  },
  {
    surface: "customer-web",
    slot: "pwa-any-512",
    colourway: "emerald",
    composition: "web-icon",
    kind: KIND.PNG,
    sizes: [512],
    path: "apps/customer-web/public/web-app-icon-512.png",
  },

  // ── shop-web (Sky) · back-office (Neutral) ─────────────────────────────────────────────────────
  ...viteWebTargets("shop-web", "shop-web", "sky"),
  ...viteWebTargets("back-office", "back-office", "neutral"),

  // ── mobile ────────────────────────────────────────────────────────────────────────────────────
  ...mobileTargets("customer-mobile", "customer-mobile", "emerald"),
  ...mobileTargets("shop-mobile", "shop-mobile", "sky"),
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
export const MANAGED_DIRS = [
  "apps/customer-web/public",
  "apps/shop-web/public",
  "apps/back-office/public",
  "apps/customer-mobile/androidApp/src/main/res/drawable",
  "apps/shop-mobile/androidApp/src/main/res/drawable",
  "apps/customer-mobile/iosApp/iosApp/Assets.xcassets/LaunchLogo.imageset",
  "apps/shop-mobile/iosApp/iosApp/Assets.xcassets/LaunchLogo.imageset",
]
