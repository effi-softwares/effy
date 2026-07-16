package com.effyshopping.mobile.kit

import androidx.compose.ui.unit.dp
import com.effyshopping.mobile.kit.ui.WindowWidth
import com.effyshopping.mobile.kit.ui.widthClassFor
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * 015 T011 / R10 — the shared adaptive width mapping that drives the bar↔rail form.
 * Material 3 breakpoints: compact < 600dp · medium 600–839dp · expanded ≥ 840dp.
 */
class WindowSizeTest {

    @Test
    fun compact_below_600() {
        assertEquals(WindowWidth.COMPACT, widthClassFor(0.dp))
        assertEquals(WindowWidth.COMPACT, widthClassFor(599.dp))
    }

    @Test
    fun medium_600_to_839() {
        assertEquals(WindowWidth.MEDIUM, widthClassFor(600.dp))
        assertEquals(WindowWidth.MEDIUM, widthClassFor(839.dp))
    }

    @Test
    fun expanded_840_and_up() {
        assertEquals(WindowWidth.EXPANDED, widthClassFor(840.dp))
        assertEquals(WindowWidth.EXPANDED, widthClassFor(1280.dp))
    }
}
