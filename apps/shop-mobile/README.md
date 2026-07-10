# `shop-mobile` — the shop operator app

This is a Kotlin Multiplatform project targeting Android, iOS.

## Surface parity (read this before adding a feature)

`shop-mobile` is **one of two surfaces** serving the **shop** audience; the other is
[`apps/shop-web`](../shop-web/). The platform commits to keeping them at feature parity, and the
binding record of what that means is:

### → [docs/audiences/shop-capabilities.md](../../docs/audiences/shop-capabilities.md)

That register lists every shop-audience capability with its explicit state on **each** surface. A
change that adds or removes a capability here **must** update it in the same change — a row with an
unstated cell is a defect, not a TODO.

**Current state**: this app is still the base KMP template (commonMain `Greeting`/`Platform`
stubs). Every capability in the register is ⬜ outstanding on mobile. The register's *"What the
mobile bootstrap slice must build"* section scopes that work — sign-in against the **shop** Cognito
pool, the shell, the record-backed identity read (`GET /shop/v1/me`), the role-aware UI, the
backend-authoritative manager gate, the error contract, and telemetry — so it does not have to be
re-derived. Its web half was delivered by
[specs/007-shop-web](../../specs/007-shop-web/).

> **Naming, once**: it is `shop` everywhere — the surfaces, the identity pool, its gateway
> authorizer, the backend service, its route paths, its tables, its roles, and the audience in
> prose. The earlier `shop`/`store` split was retired by 008-shop-naming-unification.

---


* [/iosApp](./iosApp/iosApp) contains an iOS application. Even if you’re sharing your UI with Compose Multiplatform,
  you need this entry point for your iOS app. This is also where you should add SwiftUI code for your project.

* [/shared](./shared/src) is for code that will be shared across your Compose Multiplatform applications.
  It contains several subfolders:
  - [commonMain](./shared/src/commonMain/kotlin) is for code that’s common for all targets.
  - Other folders are for Kotlin code that will be compiled for only the platform indicated in the folder name.
    For example, if you want to use Apple’s CoreCrypto for the iOS part of your Kotlin app,
    the [iosMain](./shared/src/iosMain/kotlin) folder would be the right place for such calls.
    Similarly, if you want to edit the Desktop (JVM) specific part, the [jvmMain](./shared/src/jvmMain/kotlin)
    folder is the appropriate location.

### Running the apps

Use the run configurations provided by the run widget in your IDE's toolbar. You can also use these commands and options:

- Android app: `./gradlew :androidApp:assembleDebug`
- iOS app: open the [/iosApp](./iosApp) directory in Xcode and run it from there.

---

Learn more about [Kotlin Multiplatform](https://www.jetbrains.com/help/kotlin-multiplatform-dev/get-started.html)…