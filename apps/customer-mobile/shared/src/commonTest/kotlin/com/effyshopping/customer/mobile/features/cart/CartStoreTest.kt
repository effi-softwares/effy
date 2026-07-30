package com.effyshopping.customer.mobile.features.cart

import com.effyshopping.customer.mobile.core.storage.InMemoryDevicePreferences
import com.effyshopping.customer.mobile.features.cart.data.CartLocalStore
import com.effyshopping.customer.mobile.features.cart.domain.CartBlockedReason
import com.effyshopping.customer.mobile.features.cart.domain.CartCheckout
import com.effyshopping.customer.mobile.features.cart.domain.CartDiscount
import com.effyshopping.customer.mobile.features.cart.domain.CartSnapshot
import com.effyshopping.customer.mobile.features.cart.domain.CartStore
import com.effyshopping.customer.mobile.features.cart.domain.GuestCartLine
import com.effyshopping.customer.mobile.features.cart.domain.PendingChange
import com.effyshopping.customer.mobile.features.cart.domain.PendingChangeKind
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The mirror's two load-bearing rules (027):
 *
 *  1. [CartStore.adopt] only ever moves FORWARD. Without that, a slow response to an old tap landing after
 *     a fast response to a new one resurrects a stale cart — FR-009's failure arriving from the client.
 *  2. A local edit never invents money the platform has not confirmed.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CartStoreTest {

    private fun line(id: String, qty: Int = 1, price: String = "5.00", available: Boolean = true) =
        GuestCartLine(
            productId = id,
            name = "Product $id",
            imageUrl = null,
            unitPriceAmount = price,
            currency = "AUD",
            quantity = qty,
            packageKey = "pkg_a",
            available = available,
        )

    private fun store(prefs: InMemoryDevicePreferences = InMemoryDevicePreferences(), scope: TestScope) =
        CartStore(CartLocalStore(prefs), scope)

    @Test
    fun starts_empty_when_nothing_is_persisted() = runTest {
        val s = store(scope = this)
        assertTrue(s.state.value.isEmpty)
        assertEquals(0, s.state.value.itemCount)
    }

    // The whole point of US1: a cart written by a previous process is there before the first frame.
    @Test
    fun hydrates_from_disk_on_construction() = runTest {
        val prefs = InMemoryDevicePreferences()
        CartLocalStore(prefs).save(
            CartSnapshot(revision = 3, lines = listOf(line("p1", 2)), itemSubtotalAmount = "10.00"),
            emptyList(),
        )

        val s = store(prefs, this)
        assertEquals(1, s.state.value.lines.size)
        assertEquals(2, s.state.value.itemCount)
        assertEquals(3, s.state.value.revision)
    }

    @Test
    fun a_local_edit_is_visible_immediately_and_persists() = runTest {
        val prefs = InMemoryDevicePreferences()
        val s = store(prefs, this)

        s.add(line("p1", 2))
        // Immediately — no coroutine has run yet, because a tap must not wait on anything.
        assertEquals(2, s.state.value.itemCount)
        assertEquals("10.00", s.state.value.itemSubtotalAmount)

        advanceUntilIdle() // let the coalesced write land
        assertEquals(2, CartLocalStore(prefs).load()!!.cart.lines[0].quantity)
    }

    @Test
    fun adding_the_same_product_increments_and_setting_zero_removes() = runTest {
        val s = store(scope = this)
        s.add(line("p1", 1))
        s.add(line("p1", 2))
        assertEquals(3, s.state.value.itemCount)

        s.setQuantity("p1", 0)
        assertTrue(s.state.value.isEmpty)
        assertEquals("0.00", s.state.value.grandTotalAmount)
    }

    // ── Rule 1: forward-only adoption ────────────────────────────────────────────────────────────

    @Test
    fun adopt_takes_a_newer_platform_cart() = runTest {
        val s = store(scope = this)
        val adopted = s.adopt(CartSnapshot(revision = 5, lines = listOf(line("p9")), itemSubtotalAmount = "5.00"))

        assertTrue(adopted)
        assertEquals(5, s.state.value.revision)
        assertEquals("p9", s.state.value.lines[0].productId)
    }

    // The out-of-order response. This is the case a manual two-device test will not reproduce on demand.
    @Test
    fun adopt_REJECTS_an_older_response_so_a_stale_cart_cannot_win() = runTest {
        val s = store(scope = this)
        s.adopt(CartSnapshot(revision = 9, lines = listOf(line("new")), itemSubtotalAmount = "5.00"))

        val adopted = s.adopt(CartSnapshot(revision = 4, lines = listOf(line("stale")), itemSubtotalAmount = "5.00"))

        assertFalse(adopted, "an older revision must be discarded, not applied")
        assertEquals(9, s.state.value.revision)
        assertEquals("new", s.state.value.lines[0].productId)
    }

    @Test
    fun adopt_accepts_an_equal_revision_because_a_re_read_is_not_stale() = runTest {
        val s = store(scope = this)
        s.adopt(CartSnapshot(revision = 6, lines = listOf(line("a")), itemSubtotalAmount = "5.00"))
        val again = s.adopt(CartSnapshot(revision = 6, lines = listOf(line("b")), itemSubtotalAmount = "5.00"))

        assertTrue(again)
        assertEquals("b", s.state.value.lines[0].productId)
    }

    // A guest's re-price answers with revision 0, which the forward-only rule would otherwise reject —
    // and then FR-004 ("a restored cart shows CURRENT prices") would silently fail for every guest.
    @Test
    fun adoptPreview_takes_platform_prices_without_needing_a_newer_revision() = runTest {
        val s = store(scope = this)
        s.add(line("p1", 1, price = "5.00"))
        val mirrorRevision = s.state.value.revision

        s.adoptPreview(
            CartSnapshot(revision = 0, lines = listOf(line("p1", 1, price = "6.50")), itemSubtotalAmount = "6.50"),
        )

        assertEquals("6.50", s.state.value.lines[0].unitPriceAmount, "the platform's price must win")
        assertEquals(mirrorRevision, s.state.value.revision, "a preview must not rewind the mirror's revision")
    }

    // ── Rule 2: a local edit invents no money ────────────────────────────────────────────────────

    @Test
    fun a_local_edit_drops_a_discount_the_platform_has_not_re_approved() = runTest {
        val s = store(scope = this)
        s.adopt(
            CartSnapshot(
                revision = 2,
                lines = listOf(line("p1", 2)),
                itemSubtotalAmount = "10.00",
                discountAmount = "2.00",
                grandTotalAmount = "8.00",
                discount = CartDiscount(code = "SPRING20", kind = "percentage", amount = "2.00", label = "20% off"),
            ),
        )

        s.setQuantity("p1", 1)

        assertNull(s.state.value.discount, "a discount not re-approved against THIS cart is a number we'd invent")
        assertEquals("0.00", s.state.value.discountAmount)
        assertEquals("5.00", s.state.value.grandTotalAmount)
    }

    @Test
    fun an_unavailable_line_is_excluded_from_the_local_subtotal() = runTest {
        val s = store(scope = this)
        s.add(line("ok", 1, price = "5.00"))
        s.add(line("gone", 1, price = "3.00", available = false))

        assertEquals("5.00", s.state.value.itemSubtotalAmount, "a shopper must never be shown a total that includes what they cannot buy")
    }

    @Test
    fun checkout_is_blocked_when_every_line_is_unavailable() = runTest {
        val s = store(scope = this)
        s.add(line("gone", 1, available = false))

        assertFalse(s.state.value.checkout.allowed)
        assertEquals(CartBlockedReason.NoPayableItems, s.state.value.checkout.blockedReason)
    }

    @Test
    fun checkout_is_blocked_on_an_empty_cart() = runTest {
        val s = store(scope = this)
        s.add(line("p1"))
        s.clear()

        assertFalse(s.state.value.checkout.allowed)
        assertEquals(CartBlockedReason.Empty, s.state.value.checkout.blockedReason)
    }

    // A local edit cannot re-judge the minimum — it is the platform's number — so it must not silently
    // unblock checkout the platform had blocked.
    @Test
    fun a_local_edit_keeps_a_platform_below_minimum_block() = runTest {
        val s = store(scope = this)
        s.adopt(
            CartSnapshot(
                revision = 1,
                lines = listOf(line("p1", 1)),
                itemSubtotalAmount = "5.00",
                checkout = CartCheckout(
                    allowed = false,
                    blockedReason = CartBlockedReason.BelowMinimum,
                    minimumSubtotalAmount = "25.00",
                    remainingAmount = "20.00",
                ),
            ),
        )

        s.add(line("p1", 1))

        assertEquals(CartBlockedReason.BelowMinimum, s.state.value.checkout.blockedReason)
        assertEquals("25.00", s.state.value.checkout.minimumSubtotalAmount)
    }

    // ── Lifecycle ───────────────────────────────────────────────────────────────────────────────

    @Test
    fun reset_empties_the_mirror_and_the_disk() = runTest {
        val prefs = InMemoryDevicePreferences()
        val s = store(prefs, this)
        s.add(line("p1"))
        advanceUntilIdle()

        s.reset()

        assertTrue(s.state.value.isEmpty)
        assertNull(CartLocalStore(prefs).load(), "sign-out must not leave an account's cart on the device")
    }

    @Test
    fun the_queue_survives_a_restart() = runTest {
        val prefs = InMemoryDevicePreferences()
        val s = store(prefs, this)
        s.add(line("p1"))
        s.enqueue(PendingChange(changeId = "c1", kind = PendingChangeKind.Add, productId = "p1", quantity = 1))
        advanceUntilIdle()

        // A fresh process over the same storage.
        val reborn = store(prefs, this)
        assertEquals(1, reborn.queue.value.size, "a change made before a force-quit must still be pending")
        assertEquals("c1", reborn.queue.value[0].changeId)
    }

    @Test
    fun dequeue_removes_only_the_named_change() = runTest {
        val s = store(scope = this)
        s.enqueue(PendingChange(changeId = "a", kind = PendingChangeKind.Add))
        s.enqueue(PendingChange(changeId = "b", kind = PendingChangeKind.Add))

        s.dequeue("a")

        assertEquals(listOf("b"), s.queue.value.map { it.changeId })
    }
}

// ── US5: the cart never lies (FR-022/FR-023) ────────────────────────────────────────────────────

@OptIn(ExperimentalCoroutinesApi::class)
class CartHonestyTest {

    private fun dtoLine(id: String, qty: Int, price: String, available: Boolean = true, was: String? = null) =
        GuestCartLine(
            productId = id, name = id, imageUrl = null, unitPriceAmount = price,
            currency = "AUD", quantity = qty, packageKey = "pkg_a",
            available = available, priceChangedFrom = was,
        )

    @Test
    fun a_price_change_survives_into_the_snapshot_the_UI_reads() = runTest {
        val s = CartStore(CartLocalStore(InMemoryDevicePreferences()), this)
        s.adopt(
            CartSnapshot(
                revision = 1,
                lines = listOf(dtoLine("p1", 1, "7.50", was = "5.00")),
                itemSubtotalAmount = "7.50",
            ),
        )

        assertEquals("5.00", s.state.value.lines[0].priceChangedFrom, "the UI cannot say 'was £5' without this")
        assertEquals("7.50", s.state.value.lines[0].unitPriceAmount, "and the shopper pays the current price")
    }

    @Test
    fun an_unavailable_line_is_visible_but_contributes_nothing() = runTest {
        val s = CartStore(CartLocalStore(InMemoryDevicePreferences()), this)
        s.adopt(
            CartSnapshot(
                revision = 1,
                lines = listOf(dtoLine("ok", 1, "5.00"), dtoLine("gone", 1, "3.00", available = false)),
                itemSubtotalAmount = "5.00",
            ),
        )

        assertEquals(2, s.state.value.lines.size, "the line stays — a temporary state may be waited out")
        assertEquals("5.00", s.state.value.itemSubtotalAmount)
    }

    // A restored cart must carry these across a process death, or the honesty vanishes on relaunch.
    @Test
    fun availability_and_price_change_survive_a_restart() = runTest {
        val prefs = InMemoryDevicePreferences()
        val first = CartStore(CartLocalStore(prefs), this)
        first.adopt(
            CartSnapshot(
                revision = 3,
                lines = listOf(dtoLine("p1", 2, "6.00", available = false, was = "4.00")),
                itemSubtotalAmount = "0.00",
            ),
        )
        advanceUntilIdle()

        val reborn = CartStore(CartLocalStore(prefs), this)
        assertFalse(reborn.state.value.lines[0].available)
        assertEquals("4.00", reborn.state.value.lines[0].priceChangedFrom)
    }
}
