package com.effyshopping.mobile.kit.update

/**
 * The platform's way to update (121, research R5/R6).
 *
 * - **Android** (`android/update/StoreUpdater.android.kt`): Google Play In-App Updates on an install from Play -
 *   immediate for a mandatory update, a background download for the rest - and the Play page otherwise.
 * - **iPhone** (`ios/update/StoreUpdater.ios.kt`): the App Store app on Effy's page. Apple has no in-app update.
 */
interface StoreUpdater {
    val platform: AppPlatform

    /** Installed from the store that can update it in place (Play). Always false on iPhone. */
    suspend fun isStoreInstall(): Boolean

    /** Whether the store will give this phone an update now; null when it cannot say. */
    suspend fun updateAvailable(): Boolean?

    /** Start the store's own update that installs and restarts. False when it cannot run here. */
    suspend fun startImmediate(): Boolean

    /** Start a background download; [onDownloaded] is called when it is ready to install. False when it cannot run. */
    suspend fun startFlexible(onDownloaded: () -> Unit): Boolean

    /** Install a finished background download (the app restarts). */
    fun completeFlexible()

    /** Open the app's store page. Nothing happens for null (dev only: Update now is then not offered). */
    fun openStore(storeUrl: String?)

    /** Leave the app (the back gesture on the mandatory screen). Nothing on iPhone, which has no system back. */
    fun leaveApp()
}

/** A store that can do nothing - for previews and tests. */
class NoStoreUpdater(override val platform: AppPlatform) : StoreUpdater {
    override suspend fun isStoreInstall() = false

    override suspend fun updateAvailable(): Boolean? = null

    override suspend fun startImmediate() = false

    override suspend fun startFlexible(onDownloaded: () -> Unit) = false

    override fun completeFlexible() = Unit

    override fun openStore(storeUrl: String?) = Unit

    override fun leaveApp() = Unit
}

/**
 * The installed app's own version and build number where the platform says so at run time: iPhone (the bundle's
 * CFBundleShortVersionString / CFBundleVersion, from iosApp/Configuration/Version.xcconfig - iOS's own numbers, 121).
 * Null on Android, where the build's version.properties (BuildKonfig) IS the installed versionCode.
 */
expect fun installedVersionOrNull(): Pair<String, Int>?
