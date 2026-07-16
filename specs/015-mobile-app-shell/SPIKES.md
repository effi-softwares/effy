# Phase-0 Spikes — gate the navigation mechanism (operator-run)

These two **throwaway** spikes decide whether the shell is built on **Jetpack Navigation 3** or the named
**JetBrains Navigation-Compose fallback** (plan R1/R9). They require an **iOS simulator** (phone + iPad) and
so are operator-run. Record the verdict in the PR notes; delete the spike code afterwards.

The **library-agnostic foundation is already built and unit-verified** (`packages/mobile-kit`:
`WindowSize`, `SessionGate`, `PendingIntentStore`, `AppNavKey` + `navKeySerializersModule`, with
`NavKeySerializationTest` proving polymorphic route round-trip on Kotlin/Native). The spikes only prove the
**runtime** halves the JVM/native unit tests can't.

## Resolved coordinates (verify at wire time)

Add to **both** per-app catalogs (`apps/{customer,shop}-mobile/gradle/libs.versions.toml`):

```toml
[versions]
# navigation3 = "1.1.1"                      # already declared
# lifecycleViewmodelNav3 = "2.10.0"          # already declared
composeAdaptive = "1.3.0-beta02"             # CMP material3-adaptive train (latest/release on Central) — BETA

[libraries]
navigation3-runtime           = { module = "org.jetbrains.androidx.navigation3:navigation3-runtime", version.ref = "navigation3" }
# navigation3-ui              = already declared (resolves on Central — confirmed 200)
# lifecycle-viewmodel-navigation3 = already declared
compose-adaptive-navigation-suite = { module = "org.jetbrains.compose.material3.adaptive:adaptive-navigation-suite", version.ref = "composeAdaptive" }
navigation3-adaptive          = { module = "org.jetbrains.androidx.navigation3:adaptive-navigation3", version = "1.3.0-beta02" }  # VERIFY exact coordinate/version at wire time
```

> **Version-discipline note (013 D19):** the adaptive artifacts are **beta**; `material3` is already
> `1.11.0-alpha07` under CMP 1.11.1, so a beta adaptive train is consistent with the current posture, but
> confirm it resolves and behaves before wiring into `commonMain`. Keep `navigation3-adaptive` **isolated**
> (only the tablet list-detail scene uses it) so a churn there can't destabilize the shell.

## Spike S1 — iOS state-restore across process death

**Goal (FR-023 / SC-008):** a `@Serializable` `AppNavKey` back stack + registered polymorphic
`SerializersModule` restores navigation location after iOS reclaims the app.

**Steps**
1. In a throwaway screen, build a `rememberNavBackStack` (Nav3) whose keys are `@Serializable` routes
   implementing `AppNavKey`, installing `navKeySerializersModule { subclass(...) }` on the saved-state
   configuration (`SavedStateConfiguration` / `rememberSerializable`).
2. Run on an **iOS simulator**; navigate 2–3 levels deep.
3. Background the app; from Xcode/Instruments **simulate a memory warning / terminate** so iOS reclaims it
   (or `xcrun simctl terminate <udid> <bundleid>` then relaunch).
4. Reopen → **the deep location is restored**.

**Pass** → keep Nav3 saveable back stacks. **Fail** → adopt the JetBrains Navigation-Compose fallback (same
`SessionGate` + `NavigationSuiteScaffold` shell; its own saved-state).

> The **unit half** of S1 already passes: `NavKeySerializationTest` proves the polymorphic module
> round-trips routes on Kotlin/Native. S1 only adds the *runtime* saved-state wiring on device.

## Spike S2 — iOS adaptive scenes at tablet width

**Goal (FR-002 / FR-017 / SC-006):** `NavigationSuiteScaffold` renders **bottom bar (compact) ↔ navigation
rail (expanded)**, and the `adaptive-navigation3` list-detail scene renders on an **iPad**.

**Steps**
1. Wrap a 2–3 item `NavigationSuiteScaffold` around a placeholder content slot.
2. Run on an **iPhone** simulator → expect a **bottom bar**; run on an **iPad** simulator (or rotate a large
   simulator) → expect a **navigation rail**.
3. Add an `adaptive-navigation3` `ListDetailSceneStrategy` over one tab's back stack → expect a two-pane
   list-detail at expanded width, single-pane on compact.
4. Validate the iOS **interactive back-swipe / predictive-back** feel (the newest, thinnest part of Nav3's
   iOS surface).

**Pass** → use the suite + list-detail scene. **Fail** → use `NavigationSuiteScaffold` for chrome only
(it is CMP-stable) and defer the list-detail scene; the shop tablet two-pane then falls back to the existing
`AdaptiveContent` width branch until the scene stabilizes.

## After the spikes

Wire the confirmed deps into both apps' `commonMain`, then build the deferred shell primitives on the
confirmed mechanism: `packages/mobile-kit/nav/TabBackStacks.kt` (`Map<Tab, NavBackStack>`) and
`packages/mobile-kit/shell/AdaptiveNavShell.kt` (`NavigationSuiteScaffold` wrapper), then Phases B/C/D
(shop shell → customer shell → hardening).
