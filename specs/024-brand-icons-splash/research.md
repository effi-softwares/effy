# Phase 0 Research — 024 Brand Marks

**Feature**: [spec.md](spec.md) · **Date**: 2026-07-26

Every decision below was **verified by running it**, not by recall. The scratchpad harness that
produced these results is disposable; what matters is the numbers, which are quoted inline.

---

## R1 — Rasterisation toolchain

**Decision**: **`@resvg/resvg-js`** for SVG → pixels, **`sharp`** for the raster post-steps
(alpha strip, opaque flatten). Both as `devDependencies` of a new `@effy/brand` package. A
**hand-written, zero-dependency ICO writer** (see R6) instead of a third package.

**Rationale**:

The blocking constraint is **SC-009: regenerating from an unchanged source must be byte-identical.**
Nothing suitable was installed — no ImageMagick, no `rsvg-convert`, no Inkscape; only `sips` and
Node 24. Four candidates were considered and two were measured:

| Candidate | Verdict |
|---|---|
| **`@resvg/resvg-js`** (Rust resvg, prebuilt per-platform binaries) | **Chosen.** Byte-identical across runs (sha256 `1d2b9fd15032cb4a`, 39 477 bytes, both runs at 1024px). No `tIME` chunk. Excellent SVG spec coverage — rendered our `stroke-linejoin`/`stroke-linecap` geometry faithfully. |
| **`sharp`** (libvips) | **Chosen for post-processing only.** Also byte-identical. Its SVG path goes through librsvg, but its real value here is the raster pipeline resvg lacks — specifically `.flatten()` / `.removeAlpha()`. |
| **`sips`** (macOS built-in) | **Rejected.** macOS-only, so any future Linux CI silently diverges; SVG rasterisation support is unreliable and unversioned. |
| **Playwright screenshot** (already a `customer-web` devDependency) | **Rejected.** Output is tied to the bundled Chromium build, so a routine browser bump silently breaks SC-009. Wrong tool for a determinism requirement. |

**Measured**: both libraries produced identical bytes on repeat runs, and **neither writes a `tIME`
chunk** — which matters, because a timestamp chunk would make output differ *by the day* and defeat
SC-009 without anyone noticing.

**Alternatives considered**: a single-tool pipeline using only resvg (see R2 — it nearly works, and
the background-baking trick means resvg does the overwhelming majority of the work; sharp is retained
solely for the alpha-channel requirement in R3, which resvg cannot satisfy).

**Deviation recorded**: `packages/design-system/scripts/gen-compose-theme.mjs` opens with *"Zero
dependencies by design… If this script ever needs a package, reconsider it."* This feature **does**
need packages: rasterising SVG is not something Node's stdlib can do. The rule is honoured where it
still applies — the ICO writer, the manifest emitter and the drift check stay stdlib-only, and the
two image libraries are confined to the generator, which is not in any build graph.

---

## R2 — Composition strategy: crop-to-bbox, in SVG

**Decision**: Each target's composition is expressed as a **generated wrapper SVG** — a `viewBox`
recentred on the mark's true bounding box, plus optional padding and an optional background
`<rect>` — which is then rasterised once. No raster-space compositing.

**Rationale**: The authored `viewBox` is `0 0 500 500`, but the artwork does not fill it and is not
centred. Measured precisely by rendering at 2000px and scanning the alpha channel:

```
content bbox (viewBox units):  x 136.0 … 379.8    y 71.8 … 414.8
content size:                  244.0 × 343.3      aspect 0.711 (portrait)
content centre:                (257.9, 243.3)     canvas centre (250, 250)
```

So the mark occupies **48.8% of the width and 68.7% of the height**, sitting right-of-centre and
above-centre. Scaling that canvas into a square icon yields a mark that looks small and low, and
Android's mask clips it. Recomputing the `viewBox` around the measured bbox fixes centring,
padding and background in one step, and keeps every transform in **vector space** where it is exact.

Verified visually: the composed 512px render is correctly centred and fills its frame, unlike a naive
scale of the original canvas.

**Alternatives considered**: raster-space padding via `sharp.extend()` (adds a resampling step and
puts composition in the wrong domain); hand-editing the `viewBox` in the source file (destroys the
single-source property in FR-001 the moment a second composition is needed).

---

## R3 — The iOS alpha-channel trap

**Decision**: iOS marketing/app icons are rendered with the background **baked into the wrapper SVG**
(R2), then passed through `sharp.removeAlpha()` so the PNG is written as **colour-type 2 (RGB)**.

**Rationale**: Apple rejects app icons that *contain* an alpha channel — **including a fully opaque
one**. This fails at App Store Connect submission, days after the build is otherwise finished, which
is exactly the failure mode SC-006 exists to prevent. resvg **always** emits RGBA (verified:
colour-type 6), so resvg alone cannot satisfy this.

**Measured**:

| Pipeline | PNG colour type |
|---|---|
| resvg, raw | **6 — RGBA** ❌ |
| resvg → `sharp.flatten({background})` | **2 — RGB, no alpha** ✅ (19 899 bytes) |
| background baked in SVG → `sharp.removeAlpha()` | **2 — RGB, no alpha** ✅ (19 916 bytes) |

Both correct pipelines were confirmed byte-identical on repeat runs. The **baked-background** variant
is chosen so that the background colour is a property of the *composition* (R2) rather than a
parameter smuggled into the raster step — one place to look, not two.

**Consequence for other targets**: everything that is *not* an iOS app icon keeps its alpha —
Android adaptive foregrounds and web favicons **require** transparency.

---

## R4 — Android icons: vector where possible, raster only where forced

**Decision**: `mipmap-anydpi-v26/ic_launcher.xml` (adaptive) with **VectorDrawable** `foreground`,
`background` and `monochrome` layers; **raster `mipmap-*/ic_launcher.png` at five densities retained
solely for API 24–25**, which predate adaptive icons.

**Rationale**: `minSdk = 24` (verified in `apps/customer-mobile/gradle/libs.versions.toml`), and
adaptive icons arrived at **API 26**. Two API levels therefore still need legacy PNGs; dropping them
would leave those devices with a default launcher icon. Everything from API 26 up is served by
vectors, which are resolution-independent and diff-readable.

**Safe-zone maths** — an adaptive icon is a **108 × 108 dp** canvas of which only the central
**66 × 66 dp** is guaranteed visible under every launcher mask (circle, squircle, rounded square,
teardrop). Content must therefore occupy **≤ 61.1%** (66/108) of the canvas. The mark currently
occupies 68.7% of its own canvas height, so the foreground layer is composed at **padding ≈ 0.34**
in R2 terms, bringing it inside the safe circle. This is the single most common adaptive-icon defect
and is what FR-007 and SC-004 are guarding.

**The `monochrome` layer** (API 33+ themed icons) is required by FR-007a and doubles as the
**Neutral colourway** for back-office (FR-016a) — one composition serving two requirements.

**Alternatives considered**: raster-only adaptive layers (larger, unreviewable in diffs, and forfeits
the vector precision the source already provides).

---

## R5 — Splash screens, the KMP-standard way

**Decision (Android)**: `androidx.core:core-splashscreen` (`1.0.1`), applied via a
`Theme.Effy.Splash` parented to `Theme.SplashScreen`, with `installSplashScreen()` called in
`MainActivity.onCreate()` **before** `setContent`.

**Rationale**: The Android 12+ platform splash screen is automatic and **cannot be opted out of** —
if it is not configured, the system draws the launcher icon on the theme's `windowBackground`, which
today is `@android:style/Theme.Material.Light.NoActionBar` (verified in both manifests). That is the
blank white frame FR-011 forbids. The AndroidX library is the standard, Google-documented route and
**backports the same API to API 21**, covering the whole `minSdk 24 … targetSdk 36` range in one
mechanism — which is precisely what FR-012 asks for. `postSplashScreenTheme` then hands over to the
real app theme, eliminating the colour flash.

Light/dark (FR-013) is handled by `values/` + `values-night/` variants of the splash theme's
background colour, which is how the platform expects appearance to be expressed.

**Decision (iOS)**: a **`UILaunchScreen` dictionary in `Info.plist`** referencing an asset-catalog
image set and colour set. **No storyboard file.**

**Rationale**: The Xcode project currently sets `INFOPLIST_KEY_UILaunchScreen_Generation = YES`
(verified at `project.pbxproj:247` and `:275`), which generates an *empty* launch screen — the blank
frame again. Supplying an explicit `UILaunchScreen` dict is the modern, storyboard-free mechanism and
keeps the launch screen declarative.

⚠ **Ordering hazard**: `UILaunchScreen_Generation = YES` and a manual `UILaunchScreen` key **conflict**.
The generation flag must be turned **off** in the same change that adds the dict, or the build behaves
inconsistently. This is called out again in `quickstart.md` because it is invisible until it misbehaves.

**Note**: iOS launch screens are **static by platform rule** — no animation, and no code runs. The
"branded opening screen" of FR-010 is therefore a still mark on a brand background on both platforms,
which is also what keeps the two surfaces consistent.

---

## R6 — Favicons and the `.ico` container

**Decision**: a **hand-written ~25-line ICO writer** using Node's `Buffer`, embedding PNG payloads at
16/32/48 px. No npm package.

**Rationale**: `sharp` cannot write ICO, and pulling a third image dependency for a format that is a
6-byte header plus a 16-byte directory entry per image is poor value. Modern ICO permits **PNG
payloads directly** (universally supported since IE11), so the writer is a container assembly with no
encoding work at all.

**Verified**: the generated file is recognised by `file(1)` as
`MS Windows icon resource - 3 icons, 16x16 with PNG image data, … 32x32 …` — a correct multi-size
ICO at 4 108 bytes.

**Per-surface delivery**:

- **customer-web (Next.js 16 App Router)** — file-convention metadata: `app/icon.svg`,
  `app/apple-icon.png`, `app/favicon.ico`, plus `app/manifest.ts`. Next fingerprints and serves these
  automatically; no `<link>` tags are hand-written.
- **shop-web / back-office (Vite SPAs)** — neither app has a `public/` directory today (verified), so
  both need one created plus explicit `<link rel="icon">` tags in `index.html`.

---

## R7 — Where the pipeline lives

**Decision**: a new **`packages/brand`** (`@effy/brand`) holding the authored SVG, the colourway and
composition definitions, the generator, and the drift check. Derived assets are **committed into each
surface's own conventional location**, not served from the package at runtime.

**Rationale**: Principle II makes cross-cutting concerns shared packages, and this is the most
cross-cutting asset there is — six surfaces, three colourways. It deliberately mirrors the proven
`design-system` `tokens:gen` / `tokens:check` pattern (authored source → committed derived artifacts →
a check that fails on divergence), which is the in-repo precedent for FR-003 and SC-008.

It is a **separate package from `design-system`**, because the clarification session confined the
shop blue to the mark and explicitly barred it from the token system (FR-014a). Putting a blue inside
`design-system` — even unused — would invite exactly the leak that requirement forbids. `@effy/brand`
consumes brand colour values; it does not define UI tokens.

Derived assets must be **committed**, not generated at build time: Xcode asset catalogs, Gradle
resource merging and Next's file-convention metadata all read files from disk during their own builds,
and a mobile build has no access to the pnpm workspace.

**Alternatives considered**: extending `design-system` (rejected — would place a non-token blue inside
the token SSOT); per-surface generators (rejected — six copies of one algorithm is the drift US4
exists to prevent).

---

## R8 — Drift detection

**Decision**: `brand:check` regenerates every asset into a temp directory and compares **sha256 per
file** against what is committed, failing with the list of stale paths. Wired into `make lint`
alongside `tokens:check` and `check-no-jade`.

**Rationale**: This is the mechanism SC-008 describes and the one already proven in this repo.
Hashing rather than mtime-comparing is what makes it reliable in a dirty worktree and independent of
git staging state — the same reasoning recorded in `gen-compose-theme.mjs`.

⚠ **Platform caveat, must be verified during implementation**: `@resvg/resvg-js` and `sharp` ship
**per-platform prebuilt binaries**. Byte-identical output is proven **within** a platform (macOS
arm64, measured above); it is **not proven across** macOS and Linux. If CI ever runs `brand:check` on
Linux against assets generated on macOS, it could fail on a rendering difference rather than a real
edit. Mitigation, in order of preference: (1) run `brand:check` only on the platform assets are
authored on, (2) pin exact library versions and verify cross-platform equality once, then treat a
version bump as a regeneration event. **Recorded as a known risk, not a solved problem.**

---

## R9 — Pre-existing defects this feature must correct

Found while establishing context; each is in scope via FR-017/FR-018.

1. **`next/head` in the App Router.** `apps/customer-web/app/layout.tsx` imports `next/head` and
   renders `<Head><meta name="apple-mobile-web-app-title" …/></Head>`. `next/head` is a **Pages
   Router** API and is **inert** in the App Router — the tag never reaches the document. Correct form
   is `metadata.appleWebApp.title`. It also adds a needless client-boundary import to the one file the
   repo's own comments guard most heavily.
2. **Placeholder manifest colours.** `app/manifest.json` carries `"theme_color": "#ffffff"` and
   `"background_color": "#ffffff"` — neither is an Effy brand value. It is also static JSON where
   `app/manifest.ts` would be typed and consistent with the rest of the app's metadata.
3. **Stray file.** `app/favicon copy.ico` — a duplicate, with a space in the filename.
4. **Both PWA icons declared `"purpose": "maskable"`** with no `"any"` entry. A maskable icon is
   designed to be cropped; using one where an unmasked icon is expected produces a visibly
   over-zoomed mark. The correct declaration supplies both purposes.
5. **The source of all of the above** — `app/icon0.svg` is not a vector at all but a
   RealFaviconGenerator wrapper around a **base64 1000×1000 PNG**, in the **retired Jade** palette.
   FR-017 replaces this whole set rather than building on it.

---

## R10 — Driver app

**Decision**: `apps/driver-mobile` is untouched, per FR-020.

**Rationale**: The request named three web and two mobile apps. Driver is still the base KMP template
with no product surface. Note the generator will nonetheless be **capable** of emitting a driver
colourway the day that slice starts — the cost of leaving the door open is zero, and `design-system`
already emits a `compose-driver/` theme for the same reason.

---

## Resolved unknowns

| Unknown from Technical Context | Resolution |
|---|---|
| Rasteriser satisfying byte-identical regeneration | R1 — resvg-js + sharp, both measured deterministic |
| How to satisfy iOS's no-alpha rule | R3 — baked background + `removeAlpha()` → colour-type 2 |
| How to hit Android's safe zone | R4 — 66/108 dp ⇒ ≤61.1% canvas occupancy, padding ≈0.34 |
| Splash mechanism across `minSdk 24 … 36` | R5 — `core-splashscreen` 1.0.1 backports to API 21 |
| iOS splash without a storyboard | R5 — `UILaunchScreen` dict; disable `UILaunchScreen_Generation` |
| `.ico` generation without a third library | R6 — 25-line stdlib writer, output validated by `file(1)` |
| Where the pipeline lives without leaking blue into tokens | R7 — separate `@effy/brand` package |

**No unresolved NEEDS CLARIFICATION remain.**
