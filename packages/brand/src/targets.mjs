// Targets: surface × slot × colourway × composition × output path. Every surface carries the one `tile`
// colourway. Every path is fixed by its consuming platform's conventions: moving one produces a build
// with no icon. No two targets may write the same path (enforced below).

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

/** The standalone SVGs (logo in both appearances, and the icon) for use outside the apps. */
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

  // Android: vector layers (API 26+)
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
    // The adaptive background layer is the tile.
    solid: COLOURWAYS[colourway].ground,
    sizeDp: 108,
    path: `${res}/drawable/ic_launcher_background.xml`,
  })
  t.push({
    surface,
    slot: "android-adaptive-monochrome",
    colourway,
    composition: "android-mono",
    // Android re-tints this layer, so the colour only has to be opaque.
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

  // Android: raster mipmaps, API 24–25 only
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

  // iOS: the three appearances, all without alpha
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

  // iOS: launch screen
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
/** @param {boolean} [pwa] also emit the four manifest icons (shop-web only). */
function viteWebTargets(app, surface, colourway, pwa = false) {
  const pub = `apps/${app}/public`
  const pwaTargets = !pwa
    ? []
    : [
        // Both purposes: with only `maskable`, launchers expecting an unmasked icon show an over-zoomed mark.
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
        // The notification badge: Android renders it as a white silhouette, so it is the mark alone in one colour.
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
  // customer-web: Next.js App Router file conventions
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
  // A non-maskable pair, so the manifest can declare both purposes.
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

  // shop-web (installable, so it takes the manifest icons) and back-office
  ...viteWebTargets("shop-web", "shop-web", "tile", true),
  ...viteWebTargets("back-office", "back-office", "tile"),

  // mobile
  ...mobileTargets("customer-mobile", "customer-mobile", "tile"),
  // The driver app's own mark: the full stop is a blue steering wheel (src/logo-driver.svg).
  ...mobileTargets("driver-mobile", "driver-mobile", "driver").map((t) => ({ ...t, mark: "driver" })),
]

// Collisions would mean silent overwrite ordering: fail at import time.
{
  const seen = new Set()
  for (const t of TARGETS) {
    if (seen.has(t.path)) throw new Error(`targets: duplicate output path '${t.path}' (rule T4)`)
    seen.add(t.path)
  }
}

/**
 * Directories the generator owns: an undeclared file inside one is an orphan. Only asset-only
 * directories: `apps/customer-web/app/` mixes icons with route files, a gap recorded in `orphanCoverage`.
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

/** Files the toolchain owns inside managed directories (platform sidecars, the consoles' `robots.txt`). */
export const MANAGED_DIR_EXEMPT = ["Contents.json", ".gitkeep", "robots.txt"]

/**
 * Subdirectories holding editorial content rather than generated assets (the customer-web hero photo).
 * Exempted by subdirectory so `public/` itself stays watched.
 */
export const MANAGED_SUBDIR_EXEMPT = ["apps/customer-web/public/hero"]

/** Asset locations this check knowingly does not cover, so the limitation is greppable. */
export function orphanCoverage() {
  return {
    unwatched: ["apps/customer-web/app"],
    reason:
      "mixes generated App Router icons with route source; walking it would flag every page as an orphan",
  }
}
