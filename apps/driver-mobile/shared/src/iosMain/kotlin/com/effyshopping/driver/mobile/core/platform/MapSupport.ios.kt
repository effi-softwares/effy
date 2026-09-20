package com.effyshopping.driver.mobile.core.platform

import platform.Foundation.NSProcessInfo

/**
 * ⚠ **False on the iOS Simulator**, where there is no Metal service for MapLibre Native to render
 * through — see the `expect` declaration for the log line that proves it. On a real device Metal is
 * always present, so the map renders normally.
 *
 * The check is the presence of `SIMULATOR_DEVICE_NAME` in the environment, which the simulator
 * always sets and a device never does. ⚠ Deliberately NOT a device-model string match: those go
 * stale with every new device and fail *open*, which here means crashing.
 */
actual fun mapRenderingSupported(): Boolean =
    NSProcessInfo.processInfo.environment["SIMULATOR_DEVICE_NAME"] == null
