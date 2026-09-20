# Sign-off: 060-driver-mobile-ui

**Date**: 2026-09-20 · **Status**: 🚧 **CODE-COMPLETE AND MACHINE-VERIFIED. NOT COMMITTED, NOT
BUILT FOR iOS, AND — THE ONE THAT MATTERS — NOT LOOKED AT BY A PERSON ON ANY DEVICE.**

**90 / 110 tasks.** All **45 in-app design screens** are built. The 20 open tasks are the operator's
walks, two deferrals recorded below, and the remaining polish.

---

## ⚠ Read this first

039 shipped **four live defects behind a fully green suite**, because layout, contrast and hierarchy
are not properties an assertion can see. Everything below is machine-verified. **None of it is
proof that the app looks right.** [quickstart.md §4](./quickstart.md) — 45 screens × 2 appearances,
90 screenshots — is the only thing that closes this feature.

---

## Verified

| Gate | Result |
|---|---|
| `driver-mobile :shared:testAndroidHostTest` | ✅ **34** (26 baseline + 8 guard tests) |
| `driver-mobile :shared:compileKotlinIosSimulatorArm64` | ✅ |
| `driver-mobile :shared:compileTestKotlinIosSimulatorArm64` | ✅ ⚠ the target 033 found had never run |
| `driver-mobile :androidApp:assembleDebug` | ✅ |
| `customer-mobile :shared:testAndroidHostTest` | ✅ **316 — UNMODIFIED** |
| `shop-mobile :shared:testAndroidHostTest` | ✅ **105 — UNMODIFIED** |
| `@effy/design-system test` | ✅ tokens, component shape, token usage |
| `tokens:check` | ✅ **10 generated files match** — no mobile theme moved |
| `mobile-assets:check` | ✅ **138 copies** (was 84) |
| `check-no-emerald` / `check-no-jade` | ✅ |
| No currency anywhere (SC-007) | ✅ swept |
| No shop-audience copy (SC-008) | ✅ swept + guarded |
| No design colour literal (SC-010) | ✅ swept |
| No map key or credential (SC-014) | ✅ swept |
| No "coming soon" destination (SC-002) | ✅ `ComingSoonScreen` **deleted** |

⚠ **The customer/shop unmodified passes are the load-bearing ones.** `packages/mobile-kit` is
`kotlin.srcDir`-included into all three apps, so every edit there compiles into the other two. Those
counts match [BASELINE.md](./BASELINE.md) with **zero test-file edits**.

## Guards, each proven by breaking it

| Guard | Asserts |
|---|---|
| `RouteSerializerGuardTest` | every `AppNavKey` is registered — an omission fails only after process death otherwise |
| `PlaceholderRegisterGuardTest` | code ↔ register agree **in both directions**, and operational placeholders carry no value |
| `MapLibreImportGuardTest` | one import site · ⚠ **never `tile.openstreetmap.org`** · attribution present |
| `AudienceCopyGuardTest` | no shop-audience copy · no currency |

⚠ **Two guards failed their own first proof, and both were real.** The route guard's regex excluded
colons, so every parameterised route read as undeclared. The register guard read a file **outside
the Gradle project**, so editing the register left the test `UP-TO-DATE` and **the guard did not
run** — silent in exactly the case it exists for. Both fixed. 057 recorded the same near-miss.

## The defects this feature fixed

Found while building, none of them in the brief:

1. **Sign-in told drivers they were signing into a shop.** "Shop workspace", "Passwordless access
   for provisioned shop operators" — copied from shop-mobile in 049, shipped through four features.
2. **A locked-out driver saw "check it and try again"** — advice for something that cannot succeed.
3. **`EN_ROUTE` and `ARRIVED` had no screens.** Both states existed since 049; the driver tapped and
   nothing visible changed.
4. **Report-a-problem was one `TextButton`** firing `onReport("missing")` instantly — no package, no
   reason, no note.
5. **Every proof path passed `null` for the note.** The repository has accepted one since 049.
6. **iOS had no photo proof at all** — `rememberPhotoCapture` returns `null` there, so the option was
   hidden. It now works via the system camera.
7. **Activity's unread dots never cleared** — marked read server-side, never updated locally.
8. **History printed "Photo/signature captured" and showed nothing.** The image now renders.
9. **A collection run's record showed a "Proof" heading** it can never have.
10. **The tab bar rendered the first letter of each label** — ⚠ because `sync-mobile-assets.mjs` gave
    driver-mobile `kinds: ["font"]` on a 026 comment promising *"it gains `drawable` when it gets its
    shell"*. 049 gave it a shell. `mobile-assets:check` reported ✅ throughout, because an app
    configured to take nothing is trivially in sync.

## Refusals — design content NOT adopted

| What | Why |
|---|---|
| **Dispatch number `1800 EFFY OPS`** | ⚠ An outward-facing real-world identifier. The constitution requires operator-supplied, **never inferred** — 037 read an address from session context and AWS mailed a real person. Renders as unavailable. **You must supply one.** |
| **"Handed to carrier"** at hub check-in | Nothing has been handed to anyone; 053 established there is no `handed_over` state because the handoff is a later event. → **"Staged for carrier"**. |
| **"Packages return to the hub"** on failure | ⚠ **No return process and no re-attempt scheduling exist** — 056 recorded this is "closed for Effy, NOT for the shopper". The screen says only that dispatch is notified. |
| **ETAs, distances, delivery windows** | No routing engine, no coordinates (049 R13); the delivery promise is date-granular (052 R4). Omitted, never invented. |
| **Flash / flip camera controls** | Neither capture path exposes them — a dead button is worse than none. |
| **"Open Settings" on permission-denied** | Needs a platform intent this app has no driver for. |
| **`tile.openstreetmap.org`** | ⚠ Its Tile Usage Policy **forbids distributing an app that uses it**. OpenFreeMap instead — same data, no key, no billing. |

## ⚠ Recorded deviations

- **T076 — the in-app keypad is NOT on the sign-in code.** It would destroy emailed-OTP autofill and
  paste and discard 036's one-accessibility-node design. `OtpCells` already draws the design's boxes.
  The keypad serves the **delivery** code, where nothing autofills.
- **T018 — the 12 in-screen glyphs are deferred.** Every screen currently uses typographic glyphs
  (`←`, `›`, `✓`, `→`) consistently. ⚠ Authoring vector icons without device verification is exactly
  024's defect: `pathData="M undefined,undefined"` was valid XML that compiled, packaged, and failed
  to inflate at runtime. The six tab icons that *were* authored had their path data tokenised by a
  parser-equivalent check — and still need T019's device look.
- **T093 — notification copy is NOT app-side.** The text is composed by the notifications worker;
  the app only displays what arrives. Changing it is backend work 060 excludes. The in-app
  equivalent — `ActivityItem.headline()` — is built.
- **`SwipeToConfirm` uses stable `draggable`, not `AnchoredDraggable`** (research R6): mobile-kit is
  one source compiled by **two** toolchains now.
- **`STAGED` and `OUT_FOR_DELIVERY` share the detail screen.** The design collapses them; the
  platform distinguishes them and 060 changes no backend behaviour.

## ⚠ The toolchain moved

driver-mobile only, and **five parts**, each forced by the next: Kotlin `2.4.20` · Compose MP
`1.12.0` · `compileSdk 37` · AGP `9.1.0` · Gradle `9.3.1`. New deps: `maplibre-compose`, CameraX,
Coil 3.

It **cannot** reach the other two apps — three independent Gradle builds — which is why it was
affordable. ⚠ It now **diverges** from customer-mobile and shop-mobile (Kotlin 2.4.0 / CMP 1.11.1 /
AGP 9.0.1 / compileSdk 36). Intended, recorded, not drift.

---

## ⚠ Open — all yours

1. **T005 — the Xcode linker flags.** MapLibre needs them on the `iosApp` target or **the iOS build
   does not link**. Kotlin compiles; the app does not. Flags in [quickstart §0](./quickstart.md).
2. **T105 — the 45-screen walk, 90 screenshots.** ⚠ **The single most important open item.** Nothing
   else here proves the app looks right.
3. **T106** — interaction checks on real hardware: swipe cancel-and-commit, swipe accessibility with
   TalkBack/VoiceOver, per-package ticking, proof notes, drop-spot chips, the keypad, touch targets.
4. **T107** — someone who did not build it walks the shift loop end to end.
5. **T108** — supply the real dispatch number, or leave the field unavailable (which is correct).
6. **T109** — constitution **PATCH v2.0.1**: mobile renders **General Sans**, the fallback face,
   because Geist is not self-hosted. ⚠ Found during planning; the same law-vs-practice gap the
   cobalt amendment closed, reopened elsewhere.
7. **T110 — the commit.** Nothing in this feature is committed.

**Never run:** the Android app on a device, the iOS app at all, and any of the 45 screens in front
of human eyes.
