package com.effyshopping.customer.mobile.features.notifications

import com.effyshopping.customer.mobile.features.notifications.domain.NotificationFixtures
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * 026 T064 / FR-035 — placeholder content must never reach a shopper as a real event.
 *
 * The strongest available guarantee is structural: the production accessor returns nothing, so there
 * is no fixture for a screen to render. If someone later wires `sample()` into the UI to "make the
 * screen look better", this fails.
 */
class NotificationFixturesTest {

    @Test
    fun `the production accessor yields no notifications`() {
        assertTrue(
            NotificationFixtures.current().isEmpty(),
            "FR-035: fixtures must not be presented to a shopper as real notifications. " +
                "The platform has no notifications capability, so the truthful answer is none.",
        )
    }

    @Test
    fun `sample content is self-evidently an example`() {
        // The operator-review fixtures exist, but every one of them must announce itself. A fixture
        // that reads like a real event is exactly what FR-035 forbids leaking.
        val sample = NotificationFixtures.sample()
        assertTrue(sample.isNotEmpty(), "sample() exists so the populated layout can be reviewed")
        sample.forEach {
            assertTrue(
                it.title.startsWith("Example:"),
                "fixture title '${it.title}' must be self-evidently an example",
            )
        }
    }

    @Test
    fun `no fixture carries order-shaped data`() {
        // Anything that looks like real order data could be mistaken for a real notification.
        val forbidden = Regex("""EFY-|\$\d|\d{4}-\d{2}-\d{2}""")
        NotificationFixtures.sample().forEach { n ->
            assertEquals(
                null,
                forbidden.find(n.title + " " + n.body),
                "fixture '${n.title}' contains order-shaped data",
            )
        }
    }
}
