package com.effyshopping.mobile.kit.nav

import kotlinx.serialization.modules.PolymorphicModuleBuilder
import kotlinx.serialization.modules.SerializersModule
import kotlinx.serialization.modules.polymorphic

/**
 * App-navigation route marker (015 data-model §1.1). Every concrete route is a `@Serializable` subtype so the
 * per-tab back stack ([TabBackStacks]) round-trips across configuration change and process death.
 *
 * The iOS restore path **requires polymorphic serialization** — Kotlin/Native has no reflection-based saved
 * state, so an unregistered route silently fails to restore on iOS while passing on Android (015 research R6,
 * spike S1). This marker is deliberately **library-agnostic** (no Navigation-3 dependency) so it survives the
 * Phase-0 mechanism spike: a concrete route may additionally implement Nav3's `NavKey` without this layer
 * changing.
 */
interface AppNavKey

/**
 * Builds a [SerializersModule] registering each concrete [AppNavKey] subtype for polymorphic
 * (de)serialization. Each app calls this ONCE with its full route set and installs it on the `Json` /
 * saved-state configuration that backs the navigation stacks.
 *
 * ```
 * val module = navKeySerializersModule {
 *     subclass(HomeRoot::class, HomeRoot.serializer())
 *     subclass(SignIn::class, SignIn.serializer())
 *     // …every route…
 * }
 * ```
 *
 * A route that is not registered here will fail to restore on iOS — the `NavKeySerializationTest` round-trip
 * guards this per app.
 */
fun navKeySerializersModule(
    register: PolymorphicModuleBuilder<AppNavKey>.() -> Unit,
): SerializersModule = SerializersModule {
    polymorphic(AppNavKey::class, builderAction = register)
}
