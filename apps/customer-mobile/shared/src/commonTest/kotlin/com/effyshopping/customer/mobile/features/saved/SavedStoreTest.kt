package com.effyshopping.customer.mobile.features.saved

import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.features.saved.domain.GUEST_CAP
import com.effyshopping.customer.mobile.features.saved.domain.GuestPersistence
import com.effyshopping.customer.mobile.features.saved.domain.LoadSavedMembership
import com.effyshopping.customer.mobile.features.saved.domain.MergeSavedOnSignIn
import com.effyshopping.customer.mobile.features.saved.domain.SavedGuestEntry
import com.effyshopping.customer.mobile.features.saved.domain.SavedMergeOutcome
import com.effyshopping.customer.mobile.features.saved.domain.SavedMergeRepository
import com.effyshopping.customer.mobile.features.saved.domain.SavedItem
import com.effyshopping.customer.mobile.features.saved.domain.SavedMembership
import com.effyshopping.customer.mobile.features.saved.domain.SavedRepository
import com.effyshopping.customer.mobile.features.saved.domain.SavedStore
import com.effyshopping.customer.mobile.features.saved.domain.SavedVerdict
import com.effyshopping.customer.mobile.features.saved.domain.ToggleSaved
import com.effyshopping.customer.mobile.features.saved.domain.UndoRemoveSaved
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * ⚠ These exist because the capability this replaces had ZERO tests on ANY surface. SC-014 is the
 * requirement; this file is part of the evidence.
 */
class SavedStoreTest {

    /** A signed-in toggle with a fixed clock, so tests never depend on the wall clock. */
    private fun signedInToggle(repo: SavedRepository, store: SavedStore) =
        ToggleSaved(repo, store, isSignedIn = { true }, now = { FIXED_NOW })

    /** A GUEST toggle — no platform call at all; the device is the record until sign-in. */
    private fun guestToggle(repo: SavedRepository, store: SavedStore) =
        ToggleSaved(repo, store, isSignedIn = { false }, now = { FIXED_NOW })

    private class FakeDisk : GuestPersistence {
        var items: List<SavedGuestEntry> = emptyList()
        var cleared = 0
        override fun load() = items
        override fun save(items: List<SavedGuestEntry>) { this.items = items }
        override fun clear() { items = emptyList(); cleared++ }
    }

    private class FakeMerge(private val result: Set<String>, private val added: Int = 0) : SavedMergeRepository {
        var sent: List<SavedGuestEntry>? = null
        override suspend fun merge(items: List<SavedGuestEntry>): SavedMergeOutcome {
            sent = items
            return SavedMergeOutcome(added = added, productIds = result, skipped = emptyList())
        }
    }

    private class FakeRepo(
        var failWith: AppError? = null,
        var membership: Set<String> = emptySet(),
    ) : SavedRepository {
        val saved = mutableListOf<Pair<String, String?>>()
        val removed = mutableListOf<String>()

        override suspend fun membership() = SavedMembership(membership)
        override suspend fun list(): List<SavedItem> = emptyList()
        override suspend fun save(productId: String, restoreSavedAt: String?) {
            failWith?.let { throw AppException(it) }
            saved += productId to restoreSavedAt
        }
        override suspend fun remove(productId: String) {
            failWith?.let { throw AppException(it) }
            removed += productId
        }
    }

    // ── The mirror ──────────────────────────────────────────────────────────────────────────────

    @Test
    fun `adopt replaces the set wholesale`() {
        val store = SavedStore()
        store.adopt(SavedMembership(setOf("a", "b")))
        store.adopt(SavedMembership(setOf("b", "c")))

        // ⚠ Replace, not merge. The platform is authoritative for membership, and merging would
        // resurrect items the shopper removed on another device.
        assertEquals(setOf("b", "c"), store.saved.value)
        assertFalse(store.isSaved("a"))
    }

    @Test
    fun `reset clears the device on sign-out`() {
        val store = SavedStore()
        store.adopt(SavedMembership(setOf("a")))
        store.reset()

        assertTrue(store.saved.value.isEmpty(), "an account's saved items must not stay readable (FR-031)")
    }

    // ── Optimistic toggle ───────────────────────────────────────────────────────────────────────

    @Test
    fun `save applies to the mirror before the platform is told`() = runTest {
        val store = SavedStore()
        val repo = FakeRepo()

        signedInToggle(repo, store)("p1", saved = true)

        assertTrue(store.isSaved("p1"))
        assertEquals(listOf<Pair<String, String?>>("p1" to null), repo.saved)
    }

    @Test
    fun `a refusal reverts the control`() = runTest {
        val store = SavedStore()
        val repo = FakeRepo(failWith = AppError.Unavailable)

        assertFailsWith<AppException> { signedInToggle(repo, store)("p1", saved = true) }

        assertFalse(store.isSaved("p1"), "the control must not claim a save the platform refused (FR-012)")
    }

    @Test
    fun `a refusal reverts only the product that failed`() = runTest {
        val store = SavedStore()
        store.adopt(SavedMembership(setOf("other")))
        val repo = FakeRepo(failWith = AppError.Network)

        assertFailsWith<AppException> { signedInToggle(repo, store)("p1", saved = true) }

        // ⚠ Reverting a whole-mirror snapshot would undo unrelated taps made while this was in flight.
        assertTrue(store.isSaved("other"))
        assertFalse(store.isSaved("p1"))
    }

    @Test
    fun `toggling to the state it is already in does nothing`() = runTest {
        val store = SavedStore()
        val repo = FakeRepo()
        store.adopt(SavedMembership(setOf("p1")))

        signedInToggle(repo, store)("p1", saved = true)

        assertTrue(repo.saved.isEmpty(), "no request, and nothing to revert if one had failed")
    }

    /**
     * ⚠ FR-014: the end state must match the shopper's LAST INTENT, not whichever response arrived
     * last. This is why the use case takes an absolute desired state rather than flipping whatever
     * the mirror happens to hold when its coroutine runs.
     */
    @Test
    fun `rapid taps settle on the last intent`() = runTest {
        val store = SavedStore()
        val repo = FakeRepo()
        val toggle = signedInToggle(repo, store)

        toggle("p1", saved = true)
        toggle("p1", saved = false)
        toggle("p1", saved = true)

        assertTrue(store.isSaved("p1"))
        assertEquals(2, repo.saved.size)
        assertEquals(1, repo.removed.size)
    }

    // ── Undo (FR-018) ───────────────────────────────────────────────────────────────────────────

    @Test
    fun `undo restores the original savedAt - not now`() = runTest {
        val store = SavedStore()
        val repo = FakeRepo()

        UndoRemoveSaved(repo, store)("p1", savedAt = "2026-07-20T04:11:00Z")

        assertTrue(store.isSaved("p1"))
        assertEquals(
            listOf<Pair<String, String?>>("p1" to "2026-07-20T04:11:00Z"),
            repo.saved,
            "undo means 'that removal did not happen' — the item returns to the position it held, " +
                "not to the top of the list",
        )
    }

    // ── Membership load ─────────────────────────────────────────────────────────────────────────

    @Test
    fun `loading membership seeds every control at once`() = runTest {
        val store = SavedStore()
        val repo = FakeRepo(membership = setOf("p1", "p2"))

        LoadSavedMembership(repo, store)()

        // ⚠ ONE request answers for every product on screen (FR-020) — and it is what makes the heart
        // tell the truth on first render instead of assuming unsaved and un-saving on the second tap.
        assertTrue(store.isSaved("p1"))
        assertTrue(store.isSaved("p2"))
        assertFalse(store.isSaved("p3"))
    }

    @Test
    fun `verdict knows what is purchasable`() {
        assertTrue(SavedVerdict.PURCHASABLE.isPurchasable)
        for (v in SavedVerdict.entries.filter { it != SavedVerdict.PURCHASABLE }) {
            assertFalse(v.isPurchasable, "$v must not be addable to a cart")
        }
    }

    // ── Guest saving (FR-024/FR-025) ────────────────────────────────────────────────────────────

    @Test
    fun `a guest saves without any platform call`() = runTest {
        val disk = FakeDisk()
        val store = SavedStore(disk)
        val repo = FakeRepo()

        guestToggle(repo, store)("p1", saved = true, priceAmount = "6.50", currency = "AUD")

        assertTrue(store.isSaved("p1"))
        assertTrue(repo.saved.isEmpty(), "⚠ a guest is NEVER sent to a sign-in wall (FR-024)")
        assertEquals(1, disk.items.size, "and the tap is persisted, or it evaporates on next launch")
        assertEquals("6.50", disk.items[0].savedPriceAmount)
    }

    @Test
    fun `a guest list survives a restart`() = runTest {
        val disk = FakeDisk()
        guestToggle(FakeRepo(), SavedStore(disk))("p1", saved = true)

        // A new store over the same disk is what a relaunch looks like.
        val relaunched = SavedStore(disk)

        assertTrue(relaunched.isSaved("p1"), "⚠ FR-025 — 030 shipped a store whose persist was a no-op")
    }

    @Test
    fun `a guest save with no known price records no baseline rather than zero`() = runTest {
        val disk = FakeDisk()
        guestToggle(FakeRepo(), SavedStore(disk))("p1", saved = true)

        // ⚠ null, NOT "0". A zero baseline would report the item as having fallen from nothing — a
        // fabricated fact. The platform falls back to the product's real current price instead.
        assertEquals(null, disk.items[0].savedPriceAmount)
    }

    @Test
    fun `the guest cap refuses rather than evicting`() = runTest {
        val disk = FakeDisk()
        val store = SavedStore(disk)
        val toggle = guestToggle(FakeRepo(), store)
        repeat(GUEST_CAP) { toggle("p$it", saved = true) }

        val accepted = toggle("one-too-many", saved = true)

        assertFalse(accepted, "the shopper is told, not silently ignored")
        assertEquals(GUEST_CAP, disk.items.size)
        assertTrue(store.isSaved("p0"), "⚠ nothing already saved is EVER evicted to make room (FR-047)")
    }

    // ── The join (FR-028/FR-029/FR-032) ─────────────────────────────────────────────────────────

    @Test
    fun `the join sends the device list and adopts the platform's answer`() = runTest {
        val disk = FakeDisk()
        val store = SavedStore(disk)
        guestToggle(FakeRepo(), store)("p1", saved = true, priceAmount = "6.50", currency = "AUD")

        val merge = FakeMerge(result = setOf("p1", "account-item"), added = 1)
        val added = MergeSavedOnSignIn(merge, store)()

        assertEquals(1, added, "⚠ the count exists so the surface can DISCLOSE the join (FR-032)")
        assertEquals(listOf("p1"), merge.sent?.map { it.productId })
        assertEquals(setOf("p1", "account-item"), store.saved.value, "union, nothing lost")
    }

    @Test
    fun `the device list is cleared only after the platform acknowledges`() = runTest {
        val disk = FakeDisk()
        val store = SavedStore(disk)
        guestToggle(FakeRepo(), store)("p1", saved = true)
        assertEquals(1, disk.items.size)

        MergeSavedOnSignIn(FakeMerge(result = setOf("p1"), added = 1), store)()

        assertTrue(disk.items.isEmpty(), "clearing first is how 019's Option B lost carts")
        assertEquals(1, disk.cleared)
    }

    @Test
    fun `the join is idempotent`() = runTest {
        val disk = FakeDisk()
        val store = SavedStore(disk)
        guestToggle(FakeRepo(), store)("p1", saved = true)

        val merge = FakeMerge(result = setOf("p1"), added = 1)
        MergeSavedOnSignIn(merge, store)()
        MergeSavedOnSignIn(merge, store)()

        // ⚠ Safe on EVERY sign-in. The second run sends nothing, because the device list is gone.
        assertEquals(emptyList(), merge.sent)
        assertEquals(setOf("p1"), store.saved.value)
    }

    @Test
    fun `sign-out leaves nothing readable on the device`() = runTest {
        val disk = FakeDisk()
        val store = SavedStore(disk)
        guestToggle(FakeRepo(), store)("p1", saved = true)

        store.reset()

        assertTrue(store.saved.value.isEmpty())
        assertTrue(disk.items.isEmpty(), "⚠ a shared device must not hand the next person these (FR-031)")
    }
}

private const val FIXED_NOW = "2026-07-20T04:11:00Z"
