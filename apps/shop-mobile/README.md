# Effy Shop Mobile

Kotlin Multiplatform shop-operator app for Android and iOS. It shares domain and Compose presentation code,
with native authentication and system-UI adapters at the platform boundary.

## Delivered foundation

- Passwordless work-email → one-time-code authentication against the shop audience only.
- Session restoration, uniform refusal, protected-content isolation, and explicit sign-out.
- Safe-area-aware edge-to-edge rendering with visible, legible system status and gesture areas.
- Four fixed destinations: Home, Catalog, Orders, Account.
- Bottom navigation below 600dp usable width and a side rail from 600dp upward, preserving tab state.
- Record-backed Home/Account content and a backend-authoritative manager gate.
- Effy-generated Light/Dark/System colors, Nunito Sans type, semantic spacing, and reduced-motion support.

Catalog and Orders currently show intentional foundation placeholders. The former catalog list/detail/edit
and product-creation sheet were retired by feature 018. Catalog data/domain/use cases and local draft
persistence remain available for later UI specifications. Product creation must be rebuilt as a dedicated,
recoverable full-screen workflow.

Capability truth for both shop surfaces lives in
[docs/audiences/shop-capabilities.md](../../docs/audiences/shop-capabilities.md).

## Structure

- `shared/src/commonMain`: app/session wiring, domain/data, theme, navigation, and shared Compose screens.
- `shared/src/androidMain`: Amplify Android, system UI, and Android OTP input behavior.
- `shared/src/iosMain`: Swift auth bridge adapter, UIKit system UI, and native `.oneTimeCode` field.
- `androidApp`: Android host.
- `iosApp`: SwiftUI/UIViewController host.

## Verify

```sh
./gradlew :shared:allTests :androidApp:assembleDebug :shared:linkDebugFrameworkIosSimulatorArm64
```

From the repository root, also run:

```sh
make sm-contract-check sm-tokens-check sm-guard
```
