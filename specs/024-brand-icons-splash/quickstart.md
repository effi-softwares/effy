# Quickstart — 024 Brand Marks

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Date**: 2026-07-26

How to regenerate the assets, verify the machine-checkable criteria, and walk the on-device matrix
that only a human can sign off.

---

## Prerequisites

| Need | Why |
|---|---|
| Node 22+ · pnpm | The generator |
| `packages/brand/src/logo.svg` **committed** | Currently exists only outside the repo (spec Dependencies) |
| Xcode + a **physical iPhone** | SC-005; the simulator does not reproduce real cold-launch timing |
| Android Studio + a **physical Android device** | SC-004; emulators expose only a subset of launcher mask shapes |
| Both mobile apps installable on **one** device | SC-002 side-by-side distinctness |

---

## 1. Regenerate

```bash
make brand-gen          # or: pnpm --filter @effy/brand brand:gen
```

Rewrites every derived asset plus `packages/brand/assets.manifest.json`. Expect under 30 s.

---

## 2. Machine-verifiable criteria

Run in order; each maps to a numbered success criterion.

### SC-009 — regeneration is deterministic

```bash
make brand-gen && git diff --exit-code
```

**Expected**: exit 0, empty diff. A non-empty diff on an unchanged source means the pipeline is not
deterministic — stop and fix before anything else, because every other guarantee rests on this.

### SC-008 — drift is caught, and names the surface

```bash
# 1. clean state
make brand-check                                  # → "brand-check: OK"

# 2. deliberately break it (the 011 lesson: break a guard the way it will actually break)
sed -i '' 's/#10b981/#ff0000/' packages/brand/src/colourways.mjs
make brand-check                                  # → NON-ZERO, lists stale paths + surfaces
git checkout packages/brand/src/colourways.mjs

# 3. orphan detection
touch apps/back-office/public/rogue-icon.png
make brand-check                                  # → NON-ZERO (undeclared asset)
rm apps/back-office/public/rogue-icon.png
```

**Expected**: step 1 passes; steps 2 and 3 **fail**, naming what is wrong. A guard that has never been
seen to fail has not been tested.

### SC-006 — iOS icons carry no alpha channel

```bash
for f in apps/*/iosApp/iosApp/Assets.xcassets/AppIcon.appiconset/*.png; do
  printf '%s -> ' "$f"; file "$f"
done
```

**Expected**: every line reads `8-bit/color RGB` — **never** `RGBA`. An opaque alpha channel still
gets rejected at App Store Connect.

### SC-010 — no retired brand values

```bash
bash scripts/check-no-jade.sh
```

**Expected**: `check-no-jade: OK`. Note this passes **without any exemption** — the guard is unchanged,
and it already scans `*.svg`, so the authored mark is covered the moment it is committed.

> `make lint` is **Terraform-only** in this repo — it does not run JS/asset guards. The brand drift
> gate rides `pnpm test` (via `turbo run test` → `@effy/brand`'s own `test` script), the same way
> `design-system` wires `check-tokens.mjs`, plus an explicit `make brand-check` for operators.

### SC-011 — no backend / infra / DB changes

```bash
git diff --name-only main | grep -E '^(apis|infra|db)/' && echo "VIOLATION" || echo "clean"
```

**Expected**: `clean`.

### SC-012 — existing gates stay green, bundle unchanged

```bash
pnpm -r typecheck && pnpm -r test && pnpm turbo build
pnpm --filter @effy/customer-web size          # compare to the pre-feature number
make mobile-guard
cd apps/customer-mobile && ./gradlew :androidApp:assembleDebug && ./gradlew :shared:iosSimulatorArm64Test
cd ../shop-mobile     && ./gradlew :androidApp:assembleDebug && ./gradlew :shared:iosSimulatorArm64Test
```

**Expected**: all green. The `size` figure must be **unchanged** — this feature ships no client
JavaScript. It will still read ~167.3 KB against a 160 KB budget; that overage is **pre-existing**
(recorded under 020) and is explicitly **not** this feature's to fix. What matters is that the number
does not move.

---

## 3. Web verification

```bash
pnpm --filter @effy/customer-web dev     # :3000
pnpm --filter @effy/shop-web dev         # :5174
pnpm --filter @effy/back-office dev      # :5173
```

| Check | Expected | Criterion |
|---|---|---|
| Each tab shows its mark | Emerald · Blue · Neutral | SC-001 |
| All three pinned side by side | Mutually distinguishable | **SC-007a** |
| Light **and** dark browser theme | Legible in both | SC-007 |
| DevTools → Application → Manifest (customer-web) | Name "Effy", brand theme/background colours, icons resolve, both `any` and `maskable` present | FR-008, FR-018 |
| Add to Home Screen on a real phone | Mark composed for the platform shape, labelled "Effy" | FR-008 |
| View source | No `next/head` remnant; Apple title present via metadata | R9-1 |

---

## 4. Mobile verification — on device

> ⚠ **iOS ordering hazard.** `INFOPLIST_KEY_UILaunchScreen_Generation` and a manual `UILaunchScreen`
> dict **conflict**. If the launch screen looks right on a clean build and blank on an incremental one
> (or vice versa), the flag was not flipped to `NO`. Verify both edits are present before debugging
> anything else.

### Android

```bash
cd apps/customer-mobile && ./gradlew :androidApp:installDebug
cd ../shop-mobile       && ./gradlew :androidApp:installDebug
```

| Check | Expected | Criterion |
|---|---|---|
| Home screen + app drawer | Effy mark, no Android robot | SC-001 |
| Launcher shape settings — circle, squircle, rounded square, teardrop | **Nothing clipped** in any shape; mark visually centred | **SC-004** |
| Settings → Apps, and device search | Correct icon in both | FR-005 |
| Themed icons on (Android 13+, wallpaper colours) | App participates; silhouette still reads as the Effy bag | **SC-007b** |
| Cold launch (force-stop first) | Branded splash → app, **no blank or white frame** | **SC-005**, FR-011 |
| System dark mode, cold launch | Splash uses the dark ground | FR-013 |
| An API 24–25 device or emulator | Legacy mipmap icon appears | FR-012 |

### iOS

Build both apps from Xcode to a physical device.

| Check | Expected | Criterion |
|---|---|---|
| Home screen, light appearance | Effy mark, no template icon | SC-001 |
| Home screen, **dark** appearance | Dark variant; silhouette not lost against the dark ground | **SC-007b** |
| Home screen, **tinted** appearance | Tinted variant renders; still recognisably the bag | **SC-007b** |
| Settings, Spotlight, app switcher | Correct icon everywhere | FR-005 |
| Cold launch | Branded launch screen → app, no blank frame | **SC-005**, FR-011 |

### Side-by-side distinctness

Install **both** apps on **one** device, then:

| Check | Expected | Criterion |
|---|---|---|
| Show the two icons, labels hidden, at normal size, to 10 people | ≥9 correctly identify the shop app | **SC-002** |
| Ask the same 10 whether they are the same brand | ≥9 say yes | **SC-003** |

These two are the reason the feature exists. They cannot be automated, and a quick self-check is not
the same test — the whole point is whether someone *who does not already know* can tell.

---

## 5. Sign-off checklist

| # | Criterion | Method |
|---|---|---|
| SC-001 | All six surfaces show a mark | §3 + §4 |
| SC-002 | ≥9/10 identify the shop app | §4 side-by-side |
| SC-003 | ≥9/10 say same brand | §4 side-by-side |
| SC-004 | No clipping, any launcher mask | §4 Android |
| SC-005 | Branded splash on 100% of cold launches | §4 both platforms |
| SC-006 | Store icon rules pass | §2 alpha check + submission |
| SC-007 | Favicons legible, light + dark | §3 |
| SC-007a | Three web tabs distinguishable | §3 |
| SC-007b | Appearance variants recognisable | §4 |
| SC-008 | Drift check fails when stale | §2 |
| SC-009 | Byte-identical regeneration | §2 |
| SC-010 | Zero retired brand values | §2 |
| SC-011 | No backend/infra/DB diff | §2 |
| SC-012 | Gates green, bundle unmoved | §2 |

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `brand:check` fails on a colleague's machine but not yours | Different `resvg`/`sharp` platform binary. Known limit — research R8. Compare `toolchain` in the manifest first. |
| Android icon looks tiny inside a circle | Foreground occupancy above 61.1%. Fix the composition, not the artwork. |
| iOS icon rejected: "contains an alpha channel" | An `ios-*` composition lost its baked background, or `removeAlpha()` was skipped. |
| Launch screen blank on iOS | `UILaunchScreen_Generation` still `YES` — see the hazard note in §4. |
| White flash between splash and first screen | `postSplashScreenTheme` not set, or `installSplashScreen()` called after `setContent`. |
| Favicon not updating in a browser | Favicons cache aggressively; hard-reload or use a private window. |
| Vite app shows no favicon | `public/` missing, or `index.html` has no `<link rel="icon">` — Vite injects nothing. |
