# Contract — Brand Asset Manifest

**Feature**: [024 Brand Marks](../spec.md) · **Date**: 2026-07-26

This feature exposes **no network API**. Its interfaces are three, and this document is the binding
description of each:

1. **The asset manifest** — the generator's declared output, and the sole input to the drift check.
2. **The generator CLI** — how assets are produced.
3. **The per-surface asset contract** — the exact paths each surface's platform reads by convention.

The third is the one that silently breaks things: every path below is discovered *by convention* by
Xcode, Gradle or Next.js. A "tidier" location does not fail loudly — it produces a build with no icon.

---

## 1. Asset manifest

**Path**: `packages/brand/assets.manifest.json` — **generated, committed, never hand-edited.**

```jsonc
{
  "$schema": "./assets.manifest.schema.json",
  "generatedFrom": {
    "mark": "src/logo.svg",
    "markSha256": "<sha256 of the authored svg>",
    "generator": "scripts/gen-brand-assets.mjs",
    "toolchain": { "resvg": "<exact version>", "sharp": "<exact version>" }
  },
  "assets": [
    {
      "surface": "customer-mobile",
      "slot": "ios-app-icon",
      "colourway": "emerald",
      "composition": "ios-app",
      "path": "apps/customer-mobile/iosApp/iosApp/Assets.xcassets/AppIcon.appiconset/app-icon-1024.png",
      "format": "png",
      "size": 1024,
      "alpha": "strip",
      "sha256": "<sha256 of the written file>"
    }
  ]
}
```

### Field rules

| Field | Rule |
|---|---|
| `markSha256` | Hash of the authored SVG. Changing the artwork changes this, which is the coarse signal that a full regeneration is due. |
| `toolchain` | **Exact** resolved versions, not ranges. Determinism is only guaranteed within a version pair (research R8); recording them makes a drift failure diagnosable instead of mysterious. |
| `path` | Repo-relative, POSIX separators. MUST be the platform's conventional location (§3). |
| `alpha` | `preserve` or `strip`. For `strip`, the generator MUST assert PNG **colour-type 2** on the written bytes. |
| `sha256` | Of the file **as written**. This is what `brand:check` compares. |
| `assets[]` | Sorted by `path`, ascending. Stable ordering keeps the manifest diff-readable. |

### Invariants

- **M1** — Every file the generator writes MUST appear exactly once. An unlisted asset is invisible to
  the drift check and will rot; a duplicated one means two targets fight over one path.
- **M2** — The manifest MUST be regenerated in the same run as the assets. A manifest describing a
  previous run is worse than none, because the check would pass on stale truth.
- **M3** — JSON MUST be written with a trailing newline and 2-space indent, so a regeneration with no
  substantive change produces an **empty diff**.
- **M4** — No absolute paths, no machine names, no timestamps. Any of these makes the manifest differ
  per developer and destroys SC-009.

---

## 2. Generator CLI

```bash
pnpm --filter @effy/brand brand:gen      # regenerate everything
pnpm --filter @effy/brand brand:check    # verify committed == generated
pnpm --filter @effy/brand test           # unit tests (composition maths, ICO, colour substitution)

make brand-gen                           # repo-root convenience wrappers
make brand-check                         #   (brand-check is wired into `make lint`)
```

### `brand:gen`

| Aspect | Contract |
|---|---|
| Inputs | `src/logo.svg`, `src/colourways.mjs`, `src/compositions.mjs`, `src/targets.mjs` |
| Outputs | Every declared asset + `assets.manifest.json` |
| Idempotence | **Required.** Two consecutive runs MUST produce byte-identical output (SC-009). |
| Failure | Non-zero exit, nothing partially written — write to temp, then move into place. |
| Runtime | Under 30 s for the full matrix. |

### `brand:check`

| Aspect | Contract |
|---|---|
| Method | Regenerate into a temp directory; compare **sha256 per file** against committed. |
| Pass | Exit 0, one summary line. |
| Fail | Exit **non-zero**, listing every stale path **and its surface** (SC-008 requires naming *which surface* is stale, not merely that something is). |
| Extra files | An asset on disk that the manifest does not declare is a **failure**, not a warning — that is how a hand-edited or orphaned file gets caught. |
| Purity | MUST NOT modify the working tree. |

**Why hashing, not mtimes**: reliable in a dirty worktree and independent of git staging state — the
same reasoning already recorded in `design-system/scripts/gen-compose-theme.mjs`.

---

## 3. Per-surface asset contract

Each path is **fixed by the consuming platform**. Deviating produces a silent no-icon build.

### customer-web — Next.js 16 App Router (Emerald)

| Path | Convention |
|---|---|
| `app/icon.svg` | File-convention icon; Next emits `<link rel="icon">` and fingerprints it |
| `app/apple-icon.png` (180) | File-convention Apple touch icon |
| `app/favicon.ico` (16/32/48) | Served at `/favicon.ico` |
| `app/manifest.ts` | **Typed** manifest route, replacing the static `manifest.json` |
| `public/web-app-manifest-{192,512}x{…}.png` | Referenced by the manifest |

**Required corrections** (research R9, FR-017/FR-018):

- `app/layout.tsx` — remove the `next/head` import and its `<Head>` block; express the title via
  `metadata.appleWebApp.title`. `next/head` is a Pages Router API and is **inert** here.
- Manifest `theme_color` / `background_color` — replace `#ffffff` with real brand values.
- PWA icons MUST declare **both** `"any"` and `"maskable"` purposes. Declaring only `maskable`
  (as today) makes launchers that expect an unmasked icon show a visibly over-zoomed mark.
- Delete `app/favicon copy.ico`, `app/icon0.svg`, `app/icon1.png`, `app/manifest.json`.

### shop-web (Blue) · back-office (Neutral) — Vite SPAs

| Path | Convention |
|---|---|
| `public/favicon.ico` | Vite copies `public/` to the dist root verbatim |
| `public/icon.svg` | Modern SVG favicon |
| `public/apple-touch-icon.png` (180) | iOS home-screen web clip |
| `index.html` | MUST add explicit `<link rel="icon" …>` tags — Vite injects nothing automatically |

⚠ **Neither app has a `public/` directory today.** Both must be created.

### customer-mobile (Emerald) · shop-mobile (Blue) — Android

| Path | Convention |
|---|---|
| `res/mipmap-anydpi-v26/ic_launcher.xml`, `ic_launcher_round.xml` | Adaptive icon; MUST declare `background`, `foreground` **and** `monochrome` |
| `res/drawable/ic_launcher_foreground.xml` | VectorDrawable, ≤61.1% occupancy |
| `res/drawable/ic_launcher_background.xml` | VectorDrawable, solid brand ground |
| `res/drawable/ic_launcher_monochrome.xml` | VectorDrawable silhouette (API 33+ themed icons) |
| `res/drawable/ic_splash_logo.xml` | Splash mark |
| `res/mipmap-{m,h,x,xx,xxx}dpi/ic_launcher{,_round}.png` | Legacy raster, **API 24–25 only** (48/72/96/144/192 px) |
| `res/values/{colors,themes}.xml` + `res/values-night/…` | `Theme.Effy.Splash` and its light/dark grounds |

**Deleted**: `res/drawable-v24/ic_launcher_foreground.xml` (the Android robot) and the template
`ic_launcher_background.xml` grid.

**Manifest / code**: `android:theme="@style/Theme.Effy.Splash"`, and `installSplashScreen()` called in
`MainActivity.onCreate()` **before** `setContent`.

### customer-mobile (Emerald) · shop-mobile (Blue) — iOS

| Path | Convention |
|---|---|
| `Assets.xcassets/AppIcon.appiconset/app-icon-1024.png` | Light appearance. **No alpha channel.** |
| `…/app-icon-1024-dark.png` | Dark appearance — fills a currently **empty declared slot** |
| `…/app-icon-1024-tinted.png` | Tinted appearance — likewise |
| `…/Contents.json` | Must gain `filename` for the dark and tinted entries |
| `Assets.xcassets/LaunchLogo.imageset/` | Splash mark @1x/@2x/@3x |
| `Assets.xcassets/LaunchBackground.colorset/` | Splash ground, with a dark variant |
| `Info.plist` | `UILaunchScreen` dict → `UIImageName` = `LaunchLogo`, `UIColorName` = `LaunchBackground` |
| `project.pbxproj` | `INFOPLIST_KEY_UILaunchScreen_Generation` → **`NO`** |

⚠ **Ordering hazard**: the generation flag and a manual `UILaunchScreen` key **conflict**. Both edits
must land in the same change (research R5), or launch behaviour is inconsistent between clean and
incremental builds.

### driver-mobile

**No contract.** Untouched by FR-020.

---

## 4. Conformance

| Contract rule | How it is proven |
|---|---|
| M1–M4 (manifest shape) | Generator unit tests |
| Idempotence (SC-009) | `brand:gen` twice → `git diff --exit-code` |
| Drift detection (SC-008) | Perturb `logo.svg`, run `brand:check`, require non-zero + named surface |
| Orphan detection | Add a stray file under a managed path, require failure |
| iOS no-alpha (SC-006) | Generator asserts PNG colour-type 2; unit test covers it |
| Android safe zone (SC-004) | Occupancy asserted in unit tests; confirmed on-device across mask shapes |
| Path conventions (§3) | Each surface builds and displays its icon — the only real proof |
