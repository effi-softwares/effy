# Quickstart & Validation: Mobile App Shell & Navigation (015)

A run/validation guide, not implementation. This slice is **app-code only** — no cloud steps, no
migration, no deploy. `[operator]` steps are just running the apps on a device/simulator for live
validation (Claude authors the code; `./gradlew` verifies the rest).

## Prerequisites

- Kotlin/Compose toolchain from 013/014 (Kotlin 2.4.0, CMP 1.11.1); Android SDK + an emulator; Xcode + an
  iOS simulator (a **phone** and a **tablet/iPad** simulator each).
- Existing dev auth working (customer + shop Cognito pools; an OTP inbox) so sign-in flows can be exercised.
- No new backend/infra required.

## Build & static checks (Claude-runnable)

```bash
# shared shell package + both apps compile and unit tests pass
cd apps/shop-mobile     && ./gradlew :shared:allTests
cd apps/customer-mobile && ./gradlew :shared:allTests
# Android assemble (both) and iOS framework link (both), to catch KMP/iOS wiring early
cd apps/shop-mobile     && ./gradlew :androidApp:assembleDebug :shared:linkDebugFrameworkIosSimulatorArm64
cd apps/customer-mobile && ./gradlew :androidApp:assembleDebug :shared:linkDebugFrameworkIosSimulatorArm64
# guards from 013/014 (auth escape-hatch, secret) must stay green
bash scripts/mobile-guard.sh
```

## Spikes first (Phase 0 — gate the mechanism)

Before building the real shell, prove the two iOS risks (research R9). These are throwaway.

- **S1 — iOS state-restore**: a `@Serializable` `NavKey` back stack with a registered polymorphic module,
  on an **iOS simulator**: navigate deep, background the app until iOS reclaims it, reopen → **location
  restored**. **Must pass** to keep Nav3 saveable state; else adopt the JetBrains-Navigation-Compose fallback.
- **S2 — iOS adaptive scenes**: `NavigationSuiteScaffold` + `adaptive-navigation3` (beta) render **bar↔rail**
  and a list-detail scene on an **iPad simulator** without gesture/visual breakage. **Must pass** to use the
  beta scene; else use the suite for chrome only and defer list-detail.

Record spike outcomes in the PR/notes; they decide the primary-nav tasks.

## Validation scenarios (map to spec Success Criteria)

Run each on **Android + iOS**, **phone + tablet**.

### US1 / SC-001 — customer guest shell
1. `[operator]` Launch customer app with **no session**.
2. **Expected**: adaptive shell appears (bottom bar on phone); Home + Search reachable and usable with **zero** sign-in prompts; switching tabs is instant and preserves each tab's state; no cards / no top metric cards.

### US2 / SC-002 — deferred sign-in + return-to-intent
1. `[operator]` As a guest, tap an **authenticated** tab (Orders/Account).
2. **Expected**: sign-in / create-account is presented (tab stays visible). Complete sign-in → land on the **intended** tab/destination. **iOS process-death check**: trigger sign-in, background during the OTP email switch until reclaimed, reopen → still resumes to intent.
3. Sign out → return to the **guest** shell with public content intact.

### US3 / SC-007 — shop login-first shell
1. `[operator]` Launch shop app with **no session**.
2. **Expected**: only **sign-in** is reachable — no operator content by any path. Sign in → adaptive shell; on an **iPad**, primary nav is a **rail**; on a phone, a **bar**. Every tab requires the session. The Home identity block is **sectioned rows, not a card**. Sign out → back to sign-in, nothing left on screen.

### US4 / SC-004, SC-008, SC-010 — reliability
1. Sign in, navigate deep in one tab, **kill and relaunch** → resumes authenticated at prior location (both apps).
2. Force **session expiry** mid-use → app recovers silently or prompts re-auth; **never** shows stale protected content; returns to intent after re-auth.
3. **Rotate / resize / split-screen** → navigation + current destination survive; per-tab history intact.
4. **Relaunch offline** → graceful state (customer → guest shell; shop → retryable sign-in), no crash/blank/infinite spinner.

### US5 / SC-006 — adaptive & native feel
1. Run each app across phone + tablet, rotate.
2. **Expected**: correct nav form (bar on compact / rail on expanded) in 100% of configs, no layout breakage; safe areas/insets respected; touch targets meet platform minimums; smooth, platform-consistent transitions.

### SC-005 / SC-009 / SC-011 — performance & parity
- Tab switches feel **instantaneous** and preserve state (100%).
- Cold start to interactive shell **≤ ~2s** on a mid-range device; **zero** navigation/lifecycle crashes across the above.
- All scenarios pass on **Android and iOS** to parity.

## Sign-off checklist

- [ ] Spikes S1 + S2 recorded (Nav3 kept, or fallback adopted with the reason).
- [ ] `:shared:allTests` green (gate/tab-stack/pending-intent/serialization-round-trip/width-mapping) for both apps.
- [ ] Android assemble + iOS framework link green for both apps; `scripts/mobile-guard.sh` clean.
- [ ] US1–US5 validated live on Android + iOS, phone + tablet.
- [ ] No-card audit passes (shell + tab content; shop identity block refactored).
- [ ] `docs/audiences/customer-capabilities.md` and `docs/audiences/shop-capabilities.md` gain the shell/navigation rows for each mobile surface.
