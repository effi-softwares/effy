package com.effyshopping.driver.mobile.core.platform

/**
 * ⚠ **CORRECTED.** This briefly returned `false` on the simulator, on the theory that MapLibre had
 * no Metal service there. **That was wrong, and the log disproves it:**
 *
 *     maplibre-compose: Rendered the first map frame with METAL on maplibre-compose-render,
 *                       extent MapExtent(logical=402x260, physical=1206x780, scale=3.0)
 *
 * Metal works and the map renders. The `SIGABRT` was in **teardown** — "Host surface lost; closing
 * the render session" — provoked by having THREE `EffyMapCanvas` instances, one of them inside a
 * scrolling column that composes and disposes repeatedly. The fix is one map instance, not a
 * disabled feature.
 *
 * The hook stays, because "a third-party renderer must never be able to abort the app" is still
 * true — it is simply not the simulator that fails.
 */
actual fun mapRenderingSupported(): Boolean = true
