package com.effyshopping.shop.mobile.ui

/** Plain JVM host tests have Android stubs but no Robolectric runtime; UI tests run on iOS here. */
internal actual fun canRunComposeUiTestOnHost(): Boolean = false
