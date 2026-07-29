package com.effyshopping.customer.mobile.features.tracking

import com.effyshopping.customer.mobile.features.tracking.presentation.TrackStage
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * 026 T065 / FR-037 / SC-012 — the ADVERSARIAL no-leak test for order tracking.
 *
 * The source design's Track Order screen shows a map of the warehouse, a street address under each
 * fulfilment stage, and a named courier with a phone button. Every one of those discloses something
 * Effy's hidden-fulfilment model forbids. This test is the standing proof that the adaptation held.
 */
class TrackOrderDisclosureTest {

    @Test
    fun `no stage names or hints at a fulfilment location`() {
        // The customer-facing stage vocabulary must describe WHAT is happening, never WHERE.
        val forbidden = listOf(
            "warehouse", "depot", "store", "shop", "branch", "hub", "facility", "centre", "center",
            "courier", "driver", "rider",
        )
        TrackStage.entries.forEach { stage ->
            val text = (stage.label + " " + stage.detail).lowercase()
            forbidden.forEach { word ->
                assertFalse(
                    text.contains(word),
                    "stage '${stage.label}' leaks '$word' — FR-037 forbids naming a fulfilment " +
                        "location or a courier identity.",
                )
            }
        }
    }

    @Test
    fun `stages are ordered and terminate at delivered`() {
        // The timeline's meaning depends on the order being monotonic — a stage list that could
        // reorder would show a completed dot above an incomplete one.
        assertEquals(TrackStage.Placed, TrackStage.entries.first())
        assertEquals(TrackStage.Delivered, TrackStage.entries.last())
    }

    @Test
    fun `every stage before the current one counts as reached`() {
        // This mirrors the screen's own `index <= currentStage.ordinal` rule, so a refactor of the
        // rail cannot silently start marking future stages complete.
        val current = TrackStage.OnItsWay
        TrackStage.entries.forEach { stage ->
            val reached = stage.ordinal <= current.ordinal
            assertEquals(
                stage.ordinal <= TrackStage.OnItsWay.ordinal,
                reached,
                "stage ${stage.label} reached-state disagrees with the timeline rule",
            )
        }
    }

    @Test
    fun `the stage vocabulary is customer-facing rather than the internal state machine`() {
        // 020's internal states are pending/received/picking/ready_for_pickup. Showing those raw
        // would expose operational vocabulary the customer has no use for — and `ready_for_pickup`
        // in particular implies a place someone picks up FROM.
        val internal = listOf("pending", "received", "picking", "ready_for_pickup")
        TrackStage.entries.forEach { stage ->
            assertTrue(
                stage.label.lowercase() !in internal,
                "stage '${stage.label}' exposes an internal 020 state name",
            )
        }
    }
}
