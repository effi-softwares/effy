package com.effyshopping.driver.mobile.core.platform

/** Android renders through GL/Vulkan, available on every supported device (minSdk 24). */
actual fun mapRenderingSupported(): Boolean = true
