package com.effyshopping.driver.mobile.core.platform

import platform.Foundation.NSCharacterSet
import platform.Foundation.NSString
import platform.Foundation.URLQueryAllowedCharacterSet
import platform.Foundation.create
import platform.Foundation.NSURL
import platform.Foundation.stringByAddingPercentEncodingWithAllowedCharacters
import platform.UIKit.UIApplication

/**
 * iOS external-maps hand-off (049 US4, FR-022). Opens Apple Maps with the address as a query.
 */
class IosMapLauncher : MapLauncher {
    override fun navigateTo(address: String) {
        val ns = NSString.create(string = address)
        val q = ns.stringByAddingPercentEncodingWithAllowedCharacters(
            NSCharacterSet.URLQueryAllowedCharacterSet,
        ) ?: address
        val url = NSURL(string = "http://maps.apple.com/?q=$q")
        UIApplication.sharedApplication.openURL(url)
    }
}
