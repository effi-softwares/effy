package com.effyshopping.mobile.kit.update

import platform.Foundation.NSBundle

/**
 * iPhone: the numbers the installed bundle carries - whatever Xcode built it with, so the update check compares the build
 * that is really on the phone (iOS has its own numbers, independent of Android's, 121).
 */
actual fun installedVersionOrNull(): Pair<String, Int>? {
    val info = NSBundle.mainBundle
    val version = info.objectForInfoDictionaryKey("CFBundleShortVersionString") as? String ?: return null
    val build = (info.objectForInfoDictionaryKey("CFBundleVersion") as? String)?.toIntOrNull() ?: return null
    return version to build
}
