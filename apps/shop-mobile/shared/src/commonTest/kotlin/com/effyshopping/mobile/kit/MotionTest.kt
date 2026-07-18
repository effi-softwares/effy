package com.effyshopping.mobile.kit

import androidx.compose.animation.core.MutableTransitionState
import com.effyshopping.mobile.kit.ui.EffyMotion
import com.effyshopping.mobile.kit.ui.MotionLevel
import com.effyshopping.mobile.kit.ui.MotionRole
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlin.test.assertEquals

class MotionTest {
    @Test
    fun full_peer_destination_motion_finishes_within_the_240ms_budget() {
        val spec = EffyMotion.spec(MotionRole.PeerDestination, MotionLevel.Full)
        assertTrue(spec.durationMillis in 1..240)
    }

    @Test
    fun reduced_and_none_remove_translation_and_scale() {
        listOf(MotionLevel.Reduced, MotionLevel.None).forEach { level ->
            MotionRole.entries.forEach { role ->
                val spec = EffyMotion.spec(role, level)
                assertFalse(spec.usesTranslation)
                assertFalse(spec.usesScale)
            }
        }
    }

    @Test
    fun every_motion_role_is_brief_and_none_is_immediate() {
        MotionRole.entries.forEach { role ->
            assertTrue(EffyMotion.spec(role, MotionLevel.Full).durationMillis <= 240)
            assertTrue(EffyMotion.spec(role, MotionLevel.None).durationMillis == 0)
        }
    }

    @Test
    fun an_interrupted_transition_resolves_to_the_latest_target() {
        val transition = MutableTransitionState("home")
        transition.targetState = "catalog"
        transition.targetState = "orders"
        assertEquals("orders", transition.targetState)
    }
}
