package com.effyshopping.mobile.kit.update

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.longOrNull

/**
 * The app update settings file (121), as the phone reads it: `https://media.<zone>/app-updates/<app>.json`.
 *
 * The shape and the publisher's checks are `packages/shared-types/src/app-updates.ts`; this reader is deliberately
 * more lenient and only refuses what would make the decision wrong (an unknown schema, a missing platform, numbers that
 * are not whole and in order). Anything refused is **no answer**, and the person is let in (spec FR-009). Pinned to
 * `app-updates.fixtures.json` ("phone" cases).
 */
data class AppUpdateSettings(val ios: PlatformUpdateSettings, val android: PlatformUpdateSettings) {
    fun forPlatform(platform: AppPlatform): PlatformUpdateSettings = when (platform) {
        AppPlatform.Ios -> ios
        AppPlatform.Android -> android
    }
}

data class PlatformUpdateSettings(
    val minimum: Int,
    val recommended: Int,
    val latest: Int,
    /** Where Update now leads; null only in dev (Update now is then not offered). */
    val storeUrl: String?,
)

enum class AppPlatform { Ios, Android }

private const val SCHEMA = 1L

/** The file's body → settings, or null when it is not a file this version can act on. Never throws. */
fun parseAppUpdateSettings(body: String): AppUpdateSettings? {
    val root = runCatching { Json.parseToJsonElement(body) }.getOrNull() as? JsonObject ?: return null
    val schema = (root["schema"] as? JsonPrimitive)?.takeIf { !it.isString }?.longOrNull
    if (schema != SCHEMA) return null
    val ios = parsePlatform(root["ios"]) ?: return null
    val android = parsePlatform(root["android"]) ?: return null
    return AppUpdateSettings(ios = ios, android = android)
}

private fun parsePlatform(element: JsonElement?): PlatformUpdateSettings? {
    val obj = element as? JsonObject ?: return null
    val minimum = buildNumber(obj["minimum"]) ?: return null
    val recommended = buildNumber(obj["recommended"]) ?: return null
    val latest = buildNumber(obj["latest"]) ?: return null
    if (minimum > recommended || recommended > latest) return null
    val storeUrl = when (val url = obj["storeUrl"]) {
        null, JsonNull -> null
        is JsonPrimitive -> url.takeIf { it.isString }?.content?.takeIf { it.startsWith("https://") } ?: return null
        else -> return null
    }
    return PlatformUpdateSettings(minimum, recommended, latest, storeUrl)
}

/** A whole number from 0 up, written as a number (not text, not a fraction). */
private fun buildNumber(element: JsonElement?): Int? {
    val p = element as? JsonPrimitive ?: return null
    if (p.isString) return null
    val n = p.content.toLongOrNull() ?: return null
    return n.takeIf { it in 0..Int.MAX_VALUE }?.toInt()
}
