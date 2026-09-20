package com.effyshopping.driver.mobile.core.platform

/**
 * Can this device actually render a map? (060, found on a simulator — see below.)
 *
 * ⚠ **A CRASH FOUND BY RUNNING IT, NOT BY ANY TEST.** Tapping Map on the iOS Simulator killed the
 * whole app with `SIGABRT` inside MapLibre's render thread — `RenderSessionHandle.kt` →
 * `Status#check`. The simulator log gives the cause plainly:
 *
 *     failed lookup: name = com.apple.metal.simulator.driver-mobile … error = 3: No such process
 *
 * MapLibre Native renders through **Metal**, and this simulator has no Metal service. The render
 * session cannot be created, and the failure is a native abort rather than a Kotlin exception — so
 * it is not catchable at the call site and takes the process with it.
 *
 * ⚠ **The crash is the smaller problem.** A pre-1.0 third-party renderer was able to terminate the
 * ENTIRE APP because a driver tapped a tab. Mid-shift, that loses their run. Whatever the Metal
 * situation, the map must never be able to do that — which is why this is a capability check and
 * not a simulator workaround: any device that cannot render gets the fallback instead of a crash.
 */
expect fun mapRenderingSupported(): Boolean
