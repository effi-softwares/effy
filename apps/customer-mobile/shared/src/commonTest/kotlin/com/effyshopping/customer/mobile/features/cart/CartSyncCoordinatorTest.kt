package com.effyshopping.customer.mobile.features.cart

import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.core.storage.InMemoryDevicePreferences
import com.effyshopping.customer.mobile.features.cart.data.CartLocalStore
import com.effyshopping.customer.mobile.features.cart.domain.AddToCart
import com.effyshopping.customer.mobile.features.cart.domain.CartPolicy
import com.effyshopping.customer.mobile.features.cart.domain.CartRepository
import com.effyshopping.customer.mobile.features.cart.domain.CartSnapshot
import com.effyshopping.customer.mobile.features.cart.domain.CartStore
import com.effyshopping.customer.mobile.features.cart.domain.CartSyncCoordinator
import com.effyshopping.customer.mobile.features.cart.domain.GuestCartLine
import com.effyshopping.customer.mobile.features.cart.domain.MergeCartOnSignIn
import com.effyshopping.customer.mobile.features.cart.domain.PendingChange
import com.effyshopping.customer.mobile.features.cart.domain.PendingChangeKind
import com.effyshopping.customer.mobile.features.cart.domain.PendingLine
import com.effyshopping.customer.mobile.features.cart.domain.ReorderOutcome
import com.effyshopping.customer.mobile.features.cart.domain.SetCartQuantity
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The half that makes a cart cross devices (027 US2/US3).
 *
 * Before this, the mirror was durable but private: nothing a shopper did was ever sent, so signing in on a
 * second phone showed an empty cart. These tests pin the behaviour that fixes it, and the three ways it
 * could go wrong instead — sending a guest's changes, applying an out-of-order response, and losing the
 * local cart when the merge fails.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CartSyncCoordinatorTest {

    private fun line(id: String, qty: Int = 1, price: String = "5.00") = GuestCartLine(
        productId = id,
        name = "Product $id",
        imageUrl = null,
        unitPriceAmount = price,
        currency = "AUD",
        quantity = qty,
        packageKey = "pkg_a",
    )

    /** A repository that records what it was asked to do and answers with whatever the test sets. */
    class FakeRepo : CartRepository {
        val calls = mutableListOf<String>()
        var next: CartSnapshot = CartSnapshot(revision = 1)
        var failWith: AppError? = null
        var mergedLines: List<PendingLine>? = null

        private fun answer(tag: String): CartSnapshot {
            calls += tag
            failWith?.let { throw AppException(it) }
            return next
        }

        override suspend fun get() = answer("get")
        override suspend fun add(productId: String, quantity: Int, changeId: String) = answer("add:$productId:$quantity")
        override suspend fun setQuantity(productId: String, quantity: Int, changeId: String) = answer("set:$productId:$quantity")
        override suspend fun remove(productId: String, changeId: String) = answer("remove:$productId")
        override suspend fun clear(changeId: String) = answer("clear")
        override suspend fun merge(lines: List<PendingLine>, changeId: String): CartSnapshot {
            mergedLines = lines
            return answer("merge")
        }
        override suspend fun reorder(orderId: String, changeId: String) = ReorderOutcome(answer("reorder"), emptyList())
        override suspend fun setAside(productId: String, changeId: String) = answer("setAside:$productId")
        override suspend fun restoreSaved(productId: String, changeId: String) = answer("restore:$productId")
        override suspend fun deleteSaved(productId: String, changeId: String) = answer("deleteSaved:$productId")
        override suspend fun applyPromo(code: String) = answer("applyPromo:$code")
        override suspend fun removePromo() = answer("removePromo")
        override suspend fun preview(lines: List<PendingLine>) = answer("preview:${lines.size}")
        override suspend fun policy() = CartPolicy("0.00", "AUD", 99, 100)
    }

    private fun cartOf(revision: Long, vararg lines: GuestCartLine) = CartSnapshot(
        revision = revision,
        lines = lines.toList(),
        itemSubtotalAmount = "5.00",
        grandTotalAmount = "5.00",
    )

    // ── US2: a signed-in shopper's change reaches the platform ──────────────────────────────────

    @Test
    fun a_signed_in_add_is_sent_and_the_response_adopted() = runTest {
        val repo = FakeRepo()
        val store = CartStore(CartLocalStore(InMemoryDevicePreferences()), this)
        val sync = CartSyncCoordinator(repo, store, isSignedIn = { true }, scope = this)
        repo.next = cartOf(5, line("p1", 1))

        AddToCart(store, sync)(line("p1", 1))

        // The mirror moved BEFORE any coroutine ran — the tap does not wait on the network.
        assertEquals(1, store.state.value.itemCount)

        advanceUntilIdle()
        assertEquals(listOf("add:p1:1"), repo.calls)
        assertEquals(5, store.state.value.revision, "the platform's answer must be adopted")
        assertTrue(store.queue.value.isEmpty(), "a sent change must leave the queue")
    }

    // The exact scenario reported: build a cart on one device, and it must be on the platform so the
    // other device can find it.
    @Test
    fun quantity_changes_are_sent_as_ABSOLUTE_values() = runTest {
        val repo = FakeRepo()
        val store = CartStore(CartLocalStore(InMemoryDevicePreferences()), this)
        val sync = CartSyncCoordinator(repo, store, isSignedIn = { true }, scope = this)
        repo.next = cartOf(2, line("p1", 7))

        AddToCart(store, sync)(line("p1", 1))
        advanceUntilIdle()
        SetCartQuantity(store, sync)("p1", 7)
        advanceUntilIdle()

        assertEquals(listOf("add:p1:1", "set:p1:7"), repo.calls)
    }

    @Test
    fun setting_a_quantity_to_zero_is_sent_as_a_removal() = runTest {
        val repo = FakeRepo()
        val store = CartStore(CartLocalStore(InMemoryDevicePreferences()), this)
        val sync = CartSyncCoordinator(repo, store, isSignedIn = { true }, scope = this)
        repo.next = cartOf(3)

        SetCartQuantity(store, sync)("p1", 0)
        advanceUntilIdle()

        assertEquals(listOf("remove:p1"), repo.calls)
    }

    // ── A guest sends nothing ───────────────────────────────────────────────────────────────────

    @Test
    fun a_guest_change_is_never_sent_and_never_queued() = runTest {
        val repo = FakeRepo()
        val store = CartStore(CartLocalStore(InMemoryDevicePreferences()), this)
        val sync = CartSyncCoordinator(repo, store, isSignedIn = { false }, scope = this)

        AddToCart(store, sync)(line("p1", 2))
        advanceUntilIdle()

        assertEquals(1, store.state.value.lines.size, "the guest's own cart still works")
        assertTrue(repo.calls.isEmpty(), "there is no server cart to send a guest's change to")
        assertTrue(store.queue.value.isEmpty(), "queueing it would replay a guest's history at sign-in")
    }

    @Test
    fun a_guest_refresh_prices_through_preview_and_writes_nothing() = runTest {
        val repo = FakeRepo()
        val store = CartStore(CartLocalStore(InMemoryDevicePreferences()), this)
        val sync = CartSyncCoordinator(repo, store, isSignedIn = { false }, scope = this)
        store.add(line("p1", 1))
        repo.next = cartOf(0, line("p1", 1, price = "6.50"))

        sync.refresh()

        assertEquals(listOf("preview:1"), repo.calls)
        assertEquals("6.50", store.state.value.lines[0].unitPriceAmount)
    }

    @Test
    fun an_empty_guest_cart_does_not_spend_a_request() = runTest {
        val repo = FakeRepo()
        val store = CartStore(CartLocalStore(InMemoryDevicePreferences()), this)
        val sync = CartSyncCoordinator(repo, store, isSignedIn = { false }, scope = this)

        assertFalse(sync.refresh())
        assertTrue(repo.calls.isEmpty())
    }

    // ── Ordering and failure ────────────────────────────────────────────────────────────────────

    // Out-of-order responses are the failure a manual two-device test will not reproduce on demand.
    @Test
    fun an_older_response_is_discarded_by_the_mirror() = runTest {
        val repo = FakeRepo()
        val store = CartStore(CartLocalStore(InMemoryDevicePreferences()), this)
        val sync = CartSyncCoordinator(repo, store, isSignedIn = { true }, scope = this)

        store.adopt(cartOf(9, line("new", 1)))
        repo.next = cartOf(4, line("stale", 1)) // a slow reply to an older change

        sync.refresh()

        assertEquals(9, store.state.value.revision)
        assertEquals("new", store.state.value.lines[0].productId)
    }

    // A read must never overwrite a change we have not yet told the platform about.
    @Test
    fun refresh_sends_queued_changes_BEFORE_reading() = runTest {
        val repo = FakeRepo()
        val store = CartStore(CartLocalStore(InMemoryDevicePreferences()), this)
        var signedIn = false
        val sync = CartSyncCoordinator(repo, store, isSignedIn = { signedIn }, scope = this)

        // Queue a change directly, as an offline session would have left behind.
        signedIn = true
        repo.next = cartOf(2, line("p1", 1))
        AddToCart(store, sync)(line("p1", 1))
        repo.failWith = AppError.Network
        advanceUntilIdle()
        assertEquals(1, store.queue.value.size, "a network failure keeps the change queued")

        repo.failWith = null
        repo.calls.clear()
        sync.refresh()

        assertEquals(listOf("add:p1:1", "get"), repo.calls, "the queued change must go out before the read")
    }

    // ⚠ A rejected token must NOT bin the shopper's work. It is not their mistake and not permanent: an
    // expired access token, a refresh in flight, or a service accepting the wrong app client all look like
    // this, and all heal on the next attempt.
    @Test
    fun an_unauthenticated_response_keeps_the_change_rather_than_killing_it() = runTest {
        val repo = FakeRepo()
        val store = CartStore(CartLocalStore(InMemoryDevicePreferences()), this)
        val sync = CartSyncCoordinator(repo, store, isSignedIn = { true }, scope = this)
        repo.failWith = AppError.Unauthenticated

        AddToCart(store, sync)(line("p1", 1))
        advanceUntilIdle()

        val queued = store.queue.value.single()
        assertFalse(queued.isDead, "a rejected token must not discard the shopper's change")
        assertEquals(1, store.state.value.itemCount)
    }

    @Test
    fun a_transient_failure_keeps_the_change_for_the_next_trigger() = runTest {
        val repo = FakeRepo()
        val store = CartStore(CartLocalStore(InMemoryDevicePreferences()), this)
        val sync = CartSyncCoordinator(repo, store, isSignedIn = { true }, scope = this)
        repo.failWith = AppError.Network

        AddToCart(store, sync)(line("p1", 1))
        advanceUntilIdle()

        assertEquals(1, store.queue.value.size)
        assertFalse(store.queue.value[0].isDead, "a blip is not a refusal")
        assertEquals(1, store.state.value.itemCount, "and the shopper still sees what they did")
    }

    // Retrying a refusal only repeats it, so it must stop — and the shopper must be told (FR-019/FR-020).
    @Test
    fun a_definitive_refusal_stops_retrying_and_is_reported() = runTest {
        val repo = FakeRepo()
        val store = CartStore(CartLocalStore(InMemoryDevicePreferences()), this)
        val sync = CartSyncCoordinator(repo, store, isSignedIn = { true }, scope = this)
        repo.failWith = AppError.Validation("that product is currently unavailable")

        AddToCart(store, sync)(line("p1", 1))
        advanceUntilIdle()

        val dead = store.queue.value.single()
        assertTrue(dead.isDead)
        assertEquals("that product is currently unavailable", dead.failure)

        // A second trigger must not try it again.
        repo.calls.clear()
        sync.drain()
        assertTrue(repo.calls.isEmpty(), "a dead change must never be retried")
    }

    // ── US3: the sign-in merge ──────────────────────────────────────────────────────────────────

    @Test
    fun signing_in_sends_the_device_cart_and_adopts_the_union() = runTest {
        val repo = FakeRepo()
        val store = CartStore(CartLocalStore(InMemoryDevicePreferences()), this)
        store.add(line("a", 1))
        store.add(line("b", 2))
        // The account already held b×3 and c×1; the platform answers with the union, taking the greater b.
        repo.next = CartSnapshot(
            revision = 10,
            lines = listOf(line("a", 1), line("b", 3), line("c", 1)),
            itemSubtotalAmount = "25.00",
        )

        val merged = MergeCartOnSignIn(store, repo)()

        assertTrue(merged)
        assertEquals(listOf("a" to 1, "b" to 2), repo.mergedLines!!.map { it.productId to it.quantity })
        assertEquals(listOf("a", "b", "c"), store.state.value.lines.map { it.productId })
        assertEquals(3, store.state.value.lines[1].quantity, "b takes the GREATER quantity, not the sum")
    }

    @Test
    fun signing_in_with_an_empty_device_cart_still_adopts_the_account_cart() = runTest {
        val repo = FakeRepo()
        val store = CartStore(CartLocalStore(InMemoryDevicePreferences()), this)
        repo.next = cartOf(4, line("theirs", 2))

        assertTrue(MergeCartOnSignIn(store, repo)())

        assertEquals(listOf("get"), repo.calls, "an empty device cart needs a read, not a merge")
        assertEquals("theirs", store.state.value.lines[0].productId)
    }

    // ⚠ The local cart must survive a failed merge. Clearing first and merging second is how 019's Option B
    // lost carts, and it is not being reintroduced.
    @Test
    fun a_failed_merge_keeps_the_device_cart() = runTest {
        val repo = FakeRepo()
        val store = CartStore(CartLocalStore(InMemoryDevicePreferences()), this)
        store.add(line("mine", 2))
        repo.failWith = AppError.Network

        runCatching { MergeCartOnSignIn(store, repo)() }

        assertEquals(1, store.state.value.lines.size)
        assertEquals(2, store.state.value.lines[0].quantity)
    }
}

// ── US4: debounce, backoff, and the queue that survives a force-quit ────────────────────────────

@OptIn(ExperimentalCoroutinesApi::class)
class CartDebounceTest {

    private fun line(id: String, qty: Int = 1) = GuestCartLine(
        productId = id, name = id, imageUrl = null, unitPriceAmount = "5.00",
        currency = "AUD", quantity = qty, packageKey = "pkg_a",
    )

    // SC-005: ten taps in quick succession must cost ONE request, not ten.
    @Test
    fun ten_rapid_quantity_taps_send_one_request() = runTest {
        val repo = CartSyncCoordinatorTest.FakeRepo()
        val store = CartStore(CartLocalStore(InMemoryDevicePreferences()), this)
        val sync = CartSyncCoordinator(repo, store, isSignedIn = { true }, scope = this)
        val setQty = SetCartQuantity(store, sync)
        repo.next = CartSnapshot(revision = 1, lines = listOf(line("p1", 10)))

        for (q in 1..10) setQty("p1", q)
        advanceUntilIdle()

        assertEquals(1, repo.calls.count { it.startsWith("set:") }, "ten taps must coalesce into one request")
        assertEquals("set:p1:10", repo.calls.last(), "and it must carry the value the shopper settled on")
        assertEquals(10, store.state.value.lines[0].quantity, "every tap was visible immediately")
    }

    // A pause longer than the debounce is a second intention, and gets its own request.
    @Test
    fun a_pause_between_bursts_produces_a_second_request() = runTest {
        val repo = CartSyncCoordinatorTest.FakeRepo()
        val store = CartStore(CartLocalStore(InMemoryDevicePreferences()), this)
        val sync = CartSyncCoordinator(repo, store, isSignedIn = { true }, scope = this)
        val setQty = SetCartQuantity(store, sync)
        repo.next = CartSnapshot(revision = 1, lines = listOf(line("p1", 3)))

        setQty("p1", 2)
        advanceUntilIdle()
        setQty("p1", 3)
        advanceUntilIdle()

        assertEquals(2, repo.calls.count { it.startsWith("set:") })
    }

    // Debouncing one line must never hold up another.
    @Test
    fun two_products_debounce_independently() = runTest {
        val repo = CartSyncCoordinatorTest.FakeRepo()
        val store = CartStore(CartLocalStore(InMemoryDevicePreferences()), this)
        val sync = CartSyncCoordinator(repo, store, isSignedIn = { true }, scope = this)
        val setQty = SetCartQuantity(store, sync)
        repo.next = CartSnapshot(revision = 1)

        setQty("p1", 4)
        setQty("p2", 7)
        advanceUntilIdle()

        assertTrue(repo.calls.any { it == "set:p1:4" }, "got ${repo.calls}")
        assertTrue(repo.calls.any { it == "set:p2:7" }, "got ${repo.calls}")
    }

    // FR-017: a change made before the process died is on disk, and must go out on the next launch —
    // without the shopper having to touch the cart again.
    @Test
    fun a_queue_left_by_a_dead_process_drains_on_the_next_launch() = runTest {
        val prefs = InMemoryDevicePreferences()
        val first = CartStore(CartLocalStore(prefs), this)
        first.add(line("p1", 2))
        first.enqueue(PendingChange(changeId = "c1", kind = PendingChangeKind.Add, productId = "p1", quantity = 2))
        advanceUntilIdle()

        // A fresh process over the same storage.
        val repo = CartSyncCoordinatorTest.FakeRepo()
        repo.next = CartSnapshot(revision = 5, lines = listOf(line("p1", 2)))
        val reborn = CartStore(CartLocalStore(prefs), this)
        assertEquals(1, reborn.state.value.unsavedCount, "the restored queue must show as unsaved")

        CartSyncCoordinator(repo, reborn, isSignedIn = { true }, scope = this)
        advanceUntilIdle()

        assertEquals(listOf("add:p1:2"), repo.calls)
        assertEquals(0, reborn.state.value.unsavedCount)
    }

    @Test
    fun a_definitive_refusal_is_surfaced_on_the_snapshot() = runTest {
        val repo = CartSyncCoordinatorTest.FakeRepo()
        val store = CartStore(CartLocalStore(InMemoryDevicePreferences()), this)
        val sync = CartSyncCoordinator(repo, store, isSignedIn = { true }, scope = this)
        repo.failWith = AppError.Validation("that product is currently unavailable")

        AddToCart(store, sync)(line("p1", 1))
        advanceUntilIdle()

        assertEquals("that product is currently unavailable", store.state.value.failureMessage)
        store.acknowledgeFailures()
        assertNull(store.state.value.failureMessage)
    }
}
