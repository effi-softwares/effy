# Quickstart: Validate Shop Mobile UI Foundation

This is a local/device validation guide. Feature 018 requires no deployment, Terraform, migration, or cloud
mutation. Use the already-provisioned dev shop pool/service and existing test operators.

## 1. Prerequisites

- JDK 17+, Android SDK/emulators, Xcode 26+, iOS 18.2 simulator.
- Existing `apps/shop-mobile/secrets.properties` populated from the dev environment as documented in the
  app template. Do not commit it.
- For real OTP/identity/manager validation, the existing dev shop API must be reachable.

## 2. Generated-contract and guard checks

From the repository root:

```bash
make sm-contract-check sm-tokens-check sm-guard
```

Expected: shop DTOs and all generated mobile token files are clean; no credential escape hatch or
secret-shaped config is introduced.

## 3. Automated shop gate

```bash
cd apps/shop-mobile
./gradlew :shared:allTests :androidApp:assembleDebug :shared:linkDebugFrameworkIosSimulatorArm64
```

Expected:

- Auth state, input validation/dedupe/resend, appearance persistence, tab stacks, responsive policy, route
  serialization, semantics, reduced-motion policy, and retained domain tests pass.
- Android debug APK assembles.
- iOS simulator framework links.

## 4. Cross-app regression gate

Required because feature 018 changes the token generator and adds backward-compatible mobile-kit code:

```bash
cd apps/customer-mobile
./gradlew :shared:allTests :androidApp:assembleDebug :shared:linkDebugFrameworkIosSimulatorArm64

cd ../driver-mobile
./gradlew :shared:allTests :androidApp:assembleDebug :shared:linkDebugFrameworkIosSimulatorArm64
```

Expected: neither existing customer UI nor driver scaffold breaks. Customer does not migrate to the new
visual shell in this feature.

## 5. Run the app

- Android: run `androidApp` from Android Studio or `./gradlew :androidApp:installDebug` with a target device.
- iOS: open `apps/shop-mobile/iosApp/iosApp.xcodeproj`, select iPhone/iPad simulator, and Run.

## 6. Device/layout matrix

Run all root states (Restoring, Email, Code, Refused, Home, Catalog placeholder, Orders placeholder, Account,
Manager checking/granted/denied) in:

| Platform | Required postures |
|---|---|
| Android | API 24/28 legacy behavior; API 34; API 35/36; phone portrait/landscape; tablet portrait/landscape; split window; cutout; gesture and 3-button navigation |
| iOS | iPhone with notch/Dynamic Island + home indicator; iPad; portrait/landscape; software and hardware keyboard |

For every posture verify:

- status information and system navigation/home indicator remain visible and legible;
- Effy background reaches the edge with no white/un-themed strip;
- no control/text is under a cutout, system gesture region, rail, bar, or keyboard;
- no double top/bottom inset;
- width <600dp uses bottom bar; ≥600dp uses rail;
- rotate/resize on Catalog or Account preserves the selected destination.

## 7. Authentication proof

Using a provisioned dev operator:

1. Enter malformed email: inline validation, no request, input preserved.
2. Request code twice rapidly: one request while busy.
3. Paste the full code: one logical field receives it.
4. Submit wrong/expired code: specific safe message, value remains editable.
5. Test Resend disabled/loading/available and Use different email.
6. Confirm valid code: short transition to shell; system back cannot reveal auth.
7. Force offline/error and retry without losing useful input.
8. Unknown email and unprovisioned email remain indistinguishable.
9. Force-quit/relaunch: valid session restores without sign-in flicker.

No OTP, email, token, subject, or SDK exception should appear in logs.

## 8. Shell/security proof

- Four labels and meaningful icons: Home, Catalog, Orders, Account.
- Switch/reselect/back behavior follows [adaptive-shell.contract.md](contracts/adaptive-shell.contract.md).
- Staff/role-less operator sees no manager action.
- Unassigned manager reaches uniform Denied after the backend gate; role alone never grants.
- Sign out from a nested destination, sign in again, and confirm Home root—not protected restored history.
- Expire session on a non-Home tab: shell disappears and no protected content flashes.
- Catalog/Orders are polished placeholders; no New product, product row/detail, Edit, or bottom sheet exists.

## 9. Theme, system UI, and motion proof

Test Light, Dark, and System. For forced Light while OS Dark and forced Dark while OS Light verify both app and
system-bar icon contrast. Change OS appearance live in System and confirm immediate update/persistence.

Check normal motion and system Reduce Motion/Remove Animations:

- normal: short auth/nested transitions, fade-through tabs, press/selection feedback;
- reduced: no directional/scale motion; state remains immediately perceivable;
- rapid tab/action taps never queue stale transitions.

## 10. Accessibility proof

- TalkBack and VoiceOver: logical auth order, one OTP node, polite error, merged nav icon+label, selected state,
  headings, Account selector, and sign-out.
- Large text: no clipping/overlap; auth can scroll above keyboard.
- Grayscale/high contrast: selected/error/action meanings remain clear without hue.
- Android automated accessibility checks and iOS XCTest accessibility audit report no blocking issue.

## 11. Visual sign-off

Capture representative phone portrait, phone landscape, tablet portrait, and tablet landscape screenshots in
Light and Dark. Product review must rate hierarchy, spacing, navigation clarity, and modernity at least 4/5.
Reject any generic outlined-box grid, metric card, purple/default component color, raw green decoration,
cramped rail, letter glyph, or legacy catalog fragment.

## 12. Validation Results

Automated validation recorded on 2026-07-18:

| Gate | Result | Evidence |
|---|---|---|
| Contract, token, and mobile guard checks | Pass | `make sm-contract-check sm-tokens-check sm-guard` completed with clean contract drift, generated token, and retired-presentation guards. |
| Shop mobile tests/build/link | Pass | From `apps/shop-mobile`: `./gradlew :shared:allTests :androidApp:assembleDebug :shared:linkDebugFrameworkIosSimulatorArm64`. |
| Customer mobile regression | Pass | From `apps/customer-mobile`: `./gradlew :shared:allTests :androidApp:assembleDebug :shared:linkDebugFrameworkIosSimulatorArm64`; customer remains on its existing shell. |
| Driver mobile regression | Pass | From `apps/driver-mobile`: `./gradlew :shared:allTests :androidApp:assembleDebug :shared:linkDebugFrameworkIosSimulatorArm64`; local ignored `sdk.dir` was repaired before rerun. |

Pending operator/device validation:

- T061: Android/iOS posture matrix with state-by-state device, OS, posture, and pass/fail evidence.
- T062: live OTP, offline/session/manager behavior, and redacted cross-pool isolation with provided tokens.
- T063: appearance, system UI, motion, accessibility, large text, screen reader, and keyboard validation.
- T064: screenshot capture plus named reviewer scores for hierarchy, spacing, navigation clarity, and modernity.
- T065: Android `gfxinfo` and iOS Instruments Core Animation profiling.

No live credentials were used during automated validation, and no deployment, Terraform, migration, or cloud
mutation was performed.
