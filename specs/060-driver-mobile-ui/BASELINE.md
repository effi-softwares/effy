# Baseline — before 060-driver-mobile-ui

**Captured**: 2026-09-20, at clean `dev` HEAD (`a489550`), before any task in this feature.

⚠ **Why this exists.** T015/T016 claim that promoting `EffyPullToRefresh` into `mobile-kit` — which is
`kotlin.srcDir`-included into **all three** mobile apps — changed nothing in the other two. That claim
is only checkable against a number recorded *before* the change. 056 recorded the same need.

## Test counts (`:shared:testAndroidHostTest`)

| App | Tests | Failures | Errors | Skipped |
|---|---|---|---|---|
| `apps/driver-mobile` | **26** | 0 | 0 | 0 |
| `apps/customer-mobile` | **316** | 0 | 0 | 0 |
| `apps/shop-mobile` | **105** | 0 | 0 | 0 |

## Compile state

- `driver-mobile :shared:compileAndroidMain` — ✅ BUILD SUCCESSFUL
- `driver-mobile :shared:testAndroidHostTest` — ✅ BUILD SUCCESSFUL

## Pre-existing warnings at HEAD (NOT caused by this feature)

Recorded so they are not later mistaken for regressions — 053's "verified at clean HEAD" discipline.

| Where | Warning |
|---|---|
| `androidMain/core/push/EffyFirebaseMessagingService.kt:16` | overrides a deprecated member without being marked deprecated |
| `androidMain/core/push/FirebasePushTokenProvider.kt:20,43` | `Task<String>.token` / `deleteToken()` deprecated in Java |
| `commonMain/app/DriverShell.kt:90` | `BackHandler` deprecated — "Use NavigationEventHandler instead" |
| `commonMain/features/auth/presentation/SignInScreen.kt:59` | same `BackHandler` deprecation |
| `commonMain/features/delivery/presentation/DeliveryScreens.kt:96` | unnecessary `!!` on a non-null `Drop` receiver |
| 4 × `commonTest/**ViewModelTest.kt` | `ExperimentalCoroutinesApi` opt-in needed |

⚠ The two `BackHandler` deprecations are worth watching through the T001/T002 toolchain bump: a
deprecation under CMP 1.11.1 can become a removal under 1.12.0. If S1 fails on `BackHandler`, that is
the reason, and the fix is `NavigationEventHandler` — not a rollback.

## Toolchain at baseline

`kotlin 2.4.0` · `composeMultiplatform 1.11.1` · `material3 1.11.0-alpha07` · `agp 9.0.1` ·
`minSdk 24 / compileSdk 36` · Gradle 9.1.0
