package com.effyshopping.mobile.kit.update

import platform.Foundation.NSURL
import platform.UIKit.UIApplication

/**
 * The iPhone's way to update (121, research R6): open the App Store app on Effy's page. Apple has no in-app update, and
 * a phased release only slows automatic updates - anyone can update by hand - so the store never gates a prompt here.
 */
class IosStoreUpdater : StoreUpdater {
    override val platform = AppPlatform.Ios

    override suspend fun isStoreInstall() = false

    override suspend fun updateAvailable(): Boolean? = null

    override suspend fun startImmediate() = false

    override suspend fun startFlexible(onDownloaded: () -> Unit) = false

    override fun completeFlexible() = Unit

    override fun openStore(storeUrl: String?) {
        val url = storeUrl?.let { NSURL(string = it) } ?: return
        UIApplication.sharedApplication.openURL(url, options = emptyMap<Any?, Any>(), completionHandler = null)
    }

    override fun leaveApp() = Unit
}
