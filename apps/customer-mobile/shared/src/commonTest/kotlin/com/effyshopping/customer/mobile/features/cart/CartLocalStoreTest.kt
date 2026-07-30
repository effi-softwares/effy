package com.effyshopping.customer.mobile.features.cart

import com.effyshopping.customer.mobile.core.storage.InMemoryDevicePreferences
import com.effyshopping.customer.mobile.core.storage.PreferenceKeys
import com.effyshopping.customer.mobile.features.cart.data.CartLocalStore
import com.effyshopping.customer.mobile.features.cart.domain.CartSnapshot
import com.effyshopping.customer.mobile.features.cart.domain.GuestCartLine
import com.effyshopping.customer.mobile.features.cart.domain.PendingChange
import com.effyshopping.customer.mobile.features.cart.domain.PendingChangeKind
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The store that closes the defect this slice was opened for: before it, a force-quit lost the entire
 * cart. These tests care about two things — that a cart round-trips, and that a blob we cannot trust
 * produces an EMPTY cart rather than a crash or a half-parsed one.
 */
class CartLocalStoreTest {

    private fun line(id: String, qty: Int = 1, price: String = "5.00") = GuestCartLine(
        productId = id,
        name = "Product $id",
        imageUrl = null,
        unitPriceAmount = price,
        currency = "AUD",
        quantity = qty,
        packageKey = "pkg_a",
    )

    private fun cart(vararg lines: GuestCartLine) = CartSnapshot(
        revision = 7,
        lines = lines.toList(),
        itemSubtotalAmount = "10.00",
        grandTotalAmount = "10.00",
    )

    @Test
    fun round_trips_a_cart_and_its_queue() {
        val prefs = InMemoryDevicePreferences()
        val store = CartLocalStore(prefs)
        val queue = listOf(
            PendingChange(changeId = "c1", kind = PendingChangeKind.Add, productId = "p1", quantity = 2),
        )

        store.save(cart(line("p1", 2)), queue)
        val loaded = store.load()

        assertTrue(loaded != null, "a saved cart must load back")
        assertEquals(7, loaded.cart.revision, "the revision must survive — the mirror cannot reconcile without it")
        assertEquals(1, loaded.cart.lines.size)
        assertEquals("p1", loaded.cart.lines[0].productId)
        assertEquals(2, loaded.cart.lines[0].quantity)
        assertEquals("10.00", loaded.cart.itemSubtotalAmount)
        assertEquals(1, loaded.queue.size, "the queue must survive with the mirror, or we send what we no longer show")
        assertEquals("c1", loaded.queue[0].changeId)
    }

    @Test
    fun round_trips_the_fields_that_carry_honesty() {
        val prefs = InMemoryDevicePreferences()
        val store = CartLocalStore(prefs)
        val unavailable = line("p9").copy(available = false, priceChangedFrom = "4.00")

        store.save(cart(unavailable), emptyList())
        val loaded = store.load()!!

        assertTrue(!loaded.cart.lines[0].available, "availability must persist, or a restored cart lies")
        assertEquals("4.00", loaded.cart.lines[0].priceChangedFrom)
    }

    @Test
    fun nothing_stored_loads_as_nothing() {
        assertNull(CartLocalStore(InMemoryDevicePreferences()).load())
    }

    @Test
    fun a_blank_blob_loads_as_nothing() {
        val prefs = InMemoryDevicePreferences()
        prefs.putString(PreferenceKeys.CART_MIRROR, "")
        assertNull(CartLocalStore(prefs).load())
    }

    // A truncated write, or preferences edited by hand on a rooted device. Losing the cart is bad; a
    // launch crash loop is worse, and a silently half-parsed cart is worst — the shopper would trust it.
    @Test
    fun corrupt_json_loads_as_nothing_rather_than_crashing() {
        val prefs = InMemoryDevicePreferences()
        prefs.putString(PreferenceKeys.CART_MIRROR, """{"version":1,"cart":{"lines":[{"productId":""")
        assertNull(CartLocalStore(prefs).load())
    }

    // A blob written by a build whose stored shape we have since changed.
    @Test
    fun an_unknown_schema_version_is_discarded_not_migrated() {
        val prefs = InMemoryDevicePreferences()
        val store = CartLocalStore(prefs)
        store.save(cart(line("p1")), emptyList())

        val raw = prefs.getString(PreferenceKeys.CART_MIRROR)!!
        prefs.putString(
            PreferenceKeys.CART_MIRROR,
            raw.replace("\"version\":${CartLocalStore.SCHEMA_VERSION}", "\"version\":999"),
        )

        assertNull(CartLocalStore(prefs).load(), "a shape we no longer understand must be discarded")
    }

    // A corrupt QUEUE must not take the mirror down with it: the cart is worth more than the un-sent
    // changes, and dropping the queue costs at most a re-send.
    @Test
    fun a_corrupt_queue_keeps_the_cart_and_drops_only_the_queue() {
        val prefs = InMemoryDevicePreferences()
        val store = CartLocalStore(prefs)
        store.save(
            cart(line("p1", 3)),
            listOf(PendingChange(changeId = "c1", kind = PendingChangeKind.Add, productId = "p1")),
        )
        prefs.putString(PreferenceKeys.CART_QUEUE, "{not json")

        val loaded = CartLocalStore(prefs).load()
        assertTrue(loaded != null, "the cart must survive a corrupt queue")
        assertEquals(3, loaded.cart.lines[0].quantity)
        assertTrue(loaded.queue.isEmpty())
    }

    @Test
    fun clear_forgets_everything() {
        val prefs = InMemoryDevicePreferences()
        val store = CartLocalStore(prefs)
        store.save(cart(line("p1")), emptyList())
        store.clear()
        assertNull(store.load())
    }
}
