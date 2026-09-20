# Quickstart: Driver Mobile UI Completion

**Feature**: 060-driver-mobile-ui · **Date**: 2026-09-20

How to build, run and **validate** this feature. ⚠ The validation that matters here is **looking at
all 45 screens** — 039 shipped four live defects behind a fully green suite, because layout, contrast
and hierarchy are not properties an assertion can see.

---

## Prerequisites

- JDK 21+, Android Studio with an API 36 emulator or device
- Xcode with an iOS simulator (macOS only)
- A provisioned **driver** account in the dev Cognito driver pool, with an inbox for the 6-digit code
- dev backend reachable (`core-api.dev.effyshopping.com` + the shared edge gateway)
- ⚠ **No map API key, account or billing is required** — OpenFreeMap needs none (SC-014)

---

## §0 — The two blocking spikes

⚠ **Nothing in Phase 2 onwards is trustworthy until both pass.** Fallbacks are recorded in
[research.md](./research.md) R3.

### S1 — toolchain bump (assistant)

```bash
cd apps/driver-mobile
./gradlew :shared:compileAndroidMain
./gradlew :shared:testAndroidHostTest
./gradlew :shared:compileKotlinIosSimulatorArm64
./gradlew :shared:compileTestKotlinIosSimulatorArm64   # ⚠ 033: this had never run and was broken
```

**Expected**: all four green on Kotlin 2.4.20 / CMP 1.12.0 with material3, lifecycle, navigation3,
Ktor, Amplify, Firebase and BuildKonfig unchanged.
**If it fails**: apply FR-023e — the Map tab ships the stylised route, the toolchain does not move,
and the reason is recorded in the plan. The tab is finished either way.

### S2 — iOS linker flags (⚠ OPERATOR — an Xcode change)

In Xcode, `iosApp` target → Build Settings → **Other Linker Flags**, add:

```
-l"c++" -lz -framework CoreFoundation -framework CoreGraphics -framework CoreText
-framework Foundation -framework ImageIO -framework Metal -framework QuartzCore
```

**Expected**: the iOS app builds and links.
⚠ **Until this is done the iOS build fails to link**, so S2 comes before any map work lands.

---

## §1 — Build and run

```bash
# Android
cd apps/driver-mobile && ./gradlew :androidApp:installDebug

# iOS — open apps/driver-mobile/iosApp/iosApp.xcodeproj and run
```

Sign in with a provisioned driver work email + the 6-digit code.

---

## §2 — Machine verification

```bash
# Driver app
cd apps/driver-mobile
./gradlew :shared:testAndroidHostTest :androidApp:assembleDebug
./gradlew :shared:iosSimulatorArm64Test

# ⚠ THE SHARED-SOURCE PROOF — mobile-kit is srcDir'd into all three apps (research R3).
#    These two MUST pass UNMODIFIED. That unmodified pass is the evidence the
#    EffyPullToRefresh promotion changed no behaviour (SC-012).
cd ../customer-mobile && ./gradlew :shared:testAndroidHostTest
cd ../shop-mobile     && ./gradlew :shared:testAndroidHostTest

# Design-system gates — the colour law (constitution v2.0.0 Quality Gates)
cd ../.. 
pnpm --filter @effy/design-system test
pnpm --filter @effy/design-system run tokens:check
bash scripts/check-no-emerald.sh && bash scripts/check-no-jade.sh
```

**Expected**: driver suites green · **customer-mobile and shop-mobile green with zero test edits** ·
`tokens:check` **unchanged** (this feature adds no token) · both sweeps clean.

---

## §3 — The new source guards

```bash
cd apps/driver-mobile && ./gradlew :shared:testAndroidHostTest --tests '*Guard*'
```

| Guard | Asserts | Prove it by |
|---|---|---|
| `MapLibreImportGuard` | `org.maplibre.*` is imported in **exactly one** file (R4) | adding the import elsewhere → fails naming the file |
| `PlaceholderRegisterGuard` | every value exported from a `PlaceholderData.kt` is listed in the register | adding an unlisted placeholder → fails naming the value |
| `NoCurrencyGuard` | no `$`, `AUD`, `price`, `total`, `earning`, `tip` in driver UI source (FR-011) | adding a money string → fails |
| `NoShopCopyGuard` | no "shop workspace" / "shop operator" as the signed-in audience (FR-010) | restoring the old sign-in copy → fails |
| `RouteSerializerGuard` | every `AppNavKey` is registered in `driverNavJson` | adding a route without a serializer → fails |

⚠ **Each must be proven by breaking it.** 057 recorded a guard that did not catch its own negative
proof — the FR-012 source guard required a delimiter after the phrase, so `<RotateCcw />Capture
payment` sailed through. A guard nobody has broken is a guard nobody has tested.

---

## §4 — ⚠ THE 45-SCREEN WALK (this is SC-001)

**90 screenshots: every screen in light and dark.** Work through
[contracts/screen-inventory.md](./contracts/screen-inventory.md) row by row.

For each: does it match the design's **layout, hierarchy, grouping and interactions** — rendered in
**cobalt**, not the design's monochrome (FR-005)?

Highest-value rows, because they are entirely new:

| Row | Screen | What to check |
|---|---|---|
| 7 | `otp-locked` | ⚠ A locked-out driver and a mistyping driver see **different** messages. |
| 13 | `home-offline` | Turn off the network. Banner, cached run, "will upload when you reconnect". |
| 18 | `shop-problem` | A real screen — pick package, pick problem, add a note. It must **not** block the rest of the stop. |
| 23–24 | `enroute` / `arrived` | ⚠ Two states that already existed and had **no face**. |
| 26 | `proof-photo` | ⚠ **Check iOS especially** — photo proof does not exist there today. |
| 33–34 | `map-collection` / `map-delivery` | Real OSM cartography · attribution visible · segmented control · hub distinct from stops. |
| 43 | `help` | ⚠ Dispatch number shows as **unavailable**, not `1800 EFFY OPS`. |
| 45 | `perm-denied` | Deny location, reach a screen that needs it. |

---

## §5 — Interaction checks

1. **Swipe-to-confirm** (FR-018, SC-013) — on the shop stop and the hub. Drag halfway and release:
   it **springs back and does not commit**. Then commit it. ⚠ A single tap must never advance either.
2. **Accessibility of the swipe** (R6) — with TalkBack / VoiceOver on, the track is operable. A swipe
   alone is not; the design does not show this and leaving it out makes the app's two most important
   actions unreachable for some drivers.
3. **Per-package tick** (FR-019) — tick packages individually, watch the running count, confirm the
   action reflects it. ⚠ Leave the stop and return: confirmation is **UI-local and does not survive**
   (a recorded limitation — persisting it is backend work).
4. **Proof notes** (FR-022) — attach a note on **every** proof method and on the undeliverable path.
   All of these pass `null` today.
5. **Drop-spot chips** (FR-023) — contactless offers named locations, not a text field.
6. **In-app keypad** (FR-020) — sign-in code and delivery code use boxes + an in-app keypad; the
   system keyboard never appears.
7. **Touch targets** (SC-011) — every target ≥ 48 dp on the smallest supported screen. ⚠ 033 found a
   control commented as meeting the minimum that was **32 dp**.
8. **Reduced motion** (FR-009) — enable it at OS level; shimmer becomes static, transitions shorten.

---

## §6 — Sweeps

```bash
# SC-007 — no currency anywhere
grep -rnE '\$[0-9]|AUD|\bprice\b|\btotal\b|earning|payout|\btip\b' \
  apps/driver-mobile/shared/src/commonMain --include='*.kt'

# SC-008 — no shop-audience copy
grep -rniE 'shop workspace|shop operator|provisioned shop' \
  apps/driver-mobile/shared/src --include='*.kt'

# SC-010 — no design colour transcribed into the app
grep -rnE '0x(FF)?(0a0a0a|fafafa|e01010|0C9409|151515|111111)' \
  apps/driver-mobile/shared/src --include='*.kt'

# SC-014 — no map key or credential in the bundle
grep -rniE 'api[_-]?key|mapbox|maptiler|access[_-]?token' \
  apps/driver-mobile/shared/src apps/driver-mobile/*/build.gradle.kts
```

**Expected**: all four return nothing.

---

## §7 — The register (SC-004, SC-005)

1. Open [provenance-register.md](./provenance-register.md). Every one of the 45 screens has a
   section; every readable field on it is classified.
2. **Pick five screens at random.** For each, check the register against what the app renders. All
   five must match.
3. ⚠ **Check every ⛔ row renders as unavailable, not as a value** (SC-015). This is the one thing
   standing between a driver and a number nobody computed.
4. Confirm no ✅ field regressed to a placeholder (SC-009).

---

## Sign-off checklist

- [ ] S1 + S2 pass (or FR-023e fallback recorded)
- [ ] Driver suites green, Android + iOS, **including iOS test compilation**
- [ ] ⚠ customer-mobile + shop-mobile pass **unmodified**
- [ ] Design-system gates green; `tokens:check` **unchanged**
- [ ] All five new guards pass **and each has been proven by breaking it**
- [ ] ⚠ **All 45 screens photographed in both appearances (90 images)**
- [ ] §5 interaction checks, on a real device
- [ ] §6 sweeps all empty
- [ ] Register 100% complete; five spot-checks match; every ⛔ renders as unavailable
- [ ] No "coming soon" anywhere in the app (SC-002)
- [ ] ⚠ A person who did not build it has walked the shift loop end to end (SC-003)

---

## ⚠ Operator-run items

Per this project's operating rule, these are the user's to run:

1. **S2** — the iOS linker flags in Xcode.
2. **Device walks** — §4, §5 and SC-003 on real Android and iOS hardware.
3. **The commit.**
4. **The dispatch phone number** — until supplied, the help screen shows it as unavailable. That is
   correct behaviour, not a bug.
5. ⚠ **A constitution PATCH (v2.0.1)** clarifying that mobile renders General Sans as the fallback
   face because Geist is not self-hosted (research R5).
