# @effy mobile-kit (shared mobile navigation shell)

Audience-neutral navigation-shell primitives shared by **both** KMP mobile apps
(`apps/customer-mobile`, `apps/shop-mobile`) — the mobile analogue of `@effy/web-kit`'s `ConsoleShell`
(Principle II: shared once, not copy-pasted per app). Introduced by
[specs/015-mobile-app-shell](../../specs/015-mobile-app-shell/).

**Consumed via `srcDir`** (the mechanism already used for `packages/design-system/compose*`): each app adds
`kotlin.srcDir(rootProject.file("../../packages/mobile-kit"))` to its `commonMain` source set. Neutral
package root: `com.effyshopping.mobile.kit`. No new external dependency — the shell is built on the **stable
Material 3** already present (`NavigationBar` / `NavigationRail`) plus `kotlinx.serialization`.

## What it provides (each app supplies only its routes / tabs / session wiring)

| File | Purpose |
|---|---|
| `ui/WindowSize.kt` | `WindowWidth` class + `widthClassFor` + `AdaptiveContent` — adaptive window sizing (promoted from shop; the customer app had none) |
| `nav/NavKey.kt` | `AppNavKey` route marker + `navKeySerializersModule { }` — the polymorphic route serialization iOS saved-state restore requires (research R6) |
| `nav/TabBackStacks.kt` | developer-owned **per-tab back stacks** (`rememberTabBackStacks`) — independent history per tab, re-tap-to-root, saveable across config change + process death |
| `shell/AdaptiveNavShell.kt` | the adaptive chrome: **bottom bar on compact / navigation rail on expanded** from one destination set (`NavDestination`), plus a `NavGlyph` placeholder icon |

Each app inlines its own top-level session gate as an **exhaustive `when(session)`** over its own sealed
`SessionState` (more type-safe than a generic gate), and its own return-to-intent (the customer app captures
the intended tab in a `rememberSaveable` slot so it survives the auth detour + process death).

## Navigation mechanism (why hand-rolled, not Nav3)

The operator asked for Jetpack **Navigation 3**; research (R1/R9) confirmed it is CMP/iOS-capable on CMP 1.11
but its adaptive scenes are **beta** and its iOS runtime needs an on-device spike we couldn't run headlessly.
To deliver a **reliable, fully build-and-test-verified** shell on both platforms now, the shell is built on
**stable Material 3** + a developer-owned back stack (the R1 escape-hatch, chosen for reliability). Routes are
already `@Serializable` `AppNavKey`s, so a later Nav3 migration is a contained presentation-layer change.

## Tests

`mobile-kit` is a shared source set (no own test target), so its unit tests live in the first consumer's
`commonTest` (`apps/shop-mobile/shared/src/commonTest/.../com/effyshopping/mobile/kit/`): `WindowSizeTest`,
`NavKeySerializationTest` (the polymorphic route round-trip that de-risks iOS restore), and
`TabBackStacksTest` (per-tab history / switch-preserves / re-tap-to-root / sign-out reset).
