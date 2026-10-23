package com.effyshopping.mobile.kit.nav

import kotlinx.serialization.modules.PolymorphicModuleBuilder
import kotlinx.serialization.modules.SerializersModule
import kotlinx.serialization.modules.polymorphic

/**
 * An app-navigation route. Every concrete route is a `@Serializable` subtype so the per-tab back stack
 * ([TabBackStacks]) survives configuration change and process death. iOS needs polymorphic
 * serialization (Kotlin/Native has no reflection-based saved state), so an unregistered route fails to
 * restore there only. Library-agnostic: a route may also implement Nav3's `NavKey`.
 */
interface AppNavKey

/**
 * Builds a [SerializersModule] registering each concrete [AppNavKey] subtype for polymorphic
 * (de)serialization. Each app calls this once with its full route set and installs it on the `Json` /
 * saved-state configuration that backs the navigation stacks.
 *
 * ```
 * val module = navKeySerializersModule {
 *  subclass(HomeRoot::class, HomeRoot.serializer)
 *  subclass(SignIn::class, SignIn.serializer)
 *  // …every route…
 * }
 * ```
 *
 * A route not registered here fails to restore on iOS; each app's `NavKeySerializationTest` guards it.
 */
fun navKeySerializersModule(
    register: PolymorphicModuleBuilder<AppNavKey>.() -> Unit,
): SerializersModule = SerializersModule {
    polymorphic(AppNavKey::class, builderAction = register)
}
