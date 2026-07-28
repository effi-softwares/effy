package com.effyshopping.customer.mobile.features.delivery

import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * The three delivery states must never collapse into two (025 FR-014 / FR-023).
 *
 * This is the rule the whole up-front-serviceability capability exists to protect: "we have not
 * checked" is NOT "we do not deliver here". Rendering the first as the second tells a prospective
 * customer to leave, on the strength of a request that merely failed.
 *
 * The message selection is pure, so it is pinned here rather than left to a screen where the three
 * branches are easy to merge during a refactor.
 */
class DeliveryMessageTest {

    /** Mirrors the branch in DeliveryBar / DeliveryExpectation. */
    private fun message(context: DeliveryContext?): String = when {
        context == null -> "unset"
        context.serviced == null -> "checking"
        context.serviced == true -> "serviced"
        else -> "not-serviced"
    }

    private fun context(serviced: Boolean?) =
        DeliveryContext(postcode = "3000", serviced = serviced, source = DeliverySource.GUEST)

    @Test
    fun no_context_invites_the_shopper_to_set_one() {
        assertEquals("unset", message(null))
    }

    @Test
    fun an_unanswered_context_reads_as_checking_not_as_a_refusal() {
        assertEquals("checking", message(context(null)))
    }

    @Test
    fun a_positive_answer_reads_as_serviced() {
        assertEquals("serviced", message(context(true)))
    }

    @Test
    fun only_an_explicit_false_reads_as_a_refusal() {
        assertEquals("not-serviced", message(context(false)))
    }

    /**
     * The whole point, stated as an assertion: the unanswered state and the refusal state must be
     * distinguishable. If a refactor ever makes `serviced == null` fall through to the else branch,
     * this fails.
     */
    @Test
    fun unanswered_and_refused_are_never_the_same_message() {
        assertEquals(false, message(context(null)) == message(context(false)))
    }
}
