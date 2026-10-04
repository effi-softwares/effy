package com.effyshopping.customer.mobile.features.saved

import com.effyshopping.customer.mobile.features.saved.domain.AddToList
import com.effyshopping.customer.mobile.features.saved.domain.CreateList
import com.effyshopping.customer.mobile.features.saved.domain.ListRefusal
import com.effyshopping.customer.mobile.features.saved.domain.ListRefusedException
import com.effyshopping.customer.mobile.features.saved.domain.ListRepository
import com.effyshopping.customer.mobile.features.saved.domain.LoadLists
import com.effyshopping.customer.mobile.features.saved.domain.LoadSavedMembership
import com.effyshopping.customer.mobile.features.saved.domain.RemoveFromList
import com.effyshopping.customer.mobile.features.saved.domain.SavedItem
import com.effyshopping.customer.mobile.features.saved.domain.SavedList
import com.effyshopping.customer.mobile.features.saved.domain.SavedMembership
import com.effyshopping.customer.mobile.features.saved.domain.SavedRepository
import com.effyshopping.customer.mobile.features.saved.domain.SavedStore
import com.effyshopping.customer.mobile.features.saved.domain.listNameRemaining
import com.effyshopping.customer.mobile.features.saved.presentation.ListChooserState
import com.effyshopping.customer.mobile.features.saved.presentation.ListChooserViewModel
import com.effyshopping.customer.mobile.features.saved.presentation.deleteSummary
import com.effyshopping.customer.mobile.features.saved.presentation.listRefusalText
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The list chooser (068): what a shopper sees and what one tick or one "Create" sends.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ListChooserViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @BeforeTest fun setUp() = Dispatchers.setMain(dispatcher)
    @AfterTest fun tearDown() = Dispatchers.resetMain()

    private companion object {
        const val PRODUCT = "p1"
        const val WEEKLY = "5d1e"
    }

    /** A small in-memory platform: lists, and which of them hold [PRODUCT]. */
    private class FakeLists : ListRepository {
        val names = linkedMapOf<String, String?>("default" to null, WEEKLY to "Weekly Items")
        val holding = mutableSetOf("default")
        val calls = mutableListOf<String>()
        var refuse: ListRefusal? = null
        var failLists = false

        override suspend fun lists(productId: String?): List<SavedList> {
            if (failLists) throw IllegalStateException("down")
            return names.map { (id, name) ->
                SavedList(id, isDefault = id == "default", name = name, count = if (id in holding) 1 else 0,
                    onlyHereCount = 0, containsProduct = productId?.let { id in holding })
            }
        }

        override suspend fun create(name: String, productId: String?): SavedList {
            calls += "create:$name:$productId"
            refuse?.let { throw ListRefusedException(it) }
            names["new"] = name
            if (productId != null) holding += "new"
            return SavedList("new", false, name, 1, 0)
        }

        override suspend fun rename(listId: String, name: String) = error("not used")
        override suspend fun delete(listId: String) = error("not used")

        override suspend fun addEntry(listId: String, productId: String, restoreAddedAt: String?) {
            calls += "add:$listId"
            refuse?.let {
                if (it == ListRefusal.LIST_NOT_FOUND) names.remove(listId)
                throw ListRefusedException(it)
            }
            holding += listId
        }

        override suspend fun removeEntry(listId: String, productId: String) {
            calls += "remove:$listId"
            holding -= listId
        }
    }

    private class FakeSaved : SavedRepository {
        var reads = 0
        override suspend fun membership(): SavedMembership { reads++; return SavedMembership(setOf(PRODUCT)) }
        override suspend fun list(listId: String): List<SavedItem> = emptyList()
        override suspend fun save(productId: String, restoreSavedAt: String?) = Unit
        override suspend fun remove(productId: String) = Unit
    }

    private fun vm(lists: FakeLists, saved: FakeSaved = FakeSaved(), signedIn: Boolean = true): ListChooserViewModel {
        val reload = LoadSavedMembership(saved, SavedStore())
        return ListChooserViewModel(
            productId = PRODUCT,
            isSignedIn = { signedIn },
            loadLists = LoadLists(lists),
            addToList = AddToList(lists, reload),
            removeFromList = RemoveFromList(lists, reload),
            createList = CreateList(lists, reload),
        )
    }

    private fun ready(vm: ListChooserViewModel) = assertIs<ListChooserState.Ready>(vm.state.value)

    @Test
    fun `it shows every list with whether the product is in it`() = runTest(dispatcher) {
        val vm = vm(FakeLists())
        advanceUntilIdle()

        val lists = ready(vm).lists
        assertEquals(listOf("Saved", "Weekly Items"), lists.map { it.label })
        assertEquals(listOf<Boolean?>(true, false), lists.map { it.containsProduct })
    }

    @Test
    fun `ticking a list adds to that list and re-reads the hearts`() = runTest(dispatcher) {
        val lists = FakeLists()
        val saved = FakeSaved()
        val vm = vm(lists, saved)
        advanceUntilIdle()

        vm.toggle(ready(vm).lists[1])
        advanceUntilIdle()

        assertEquals(listOf("add:$WEEKLY"), lists.calls)
        assertEquals(true, ready(vm).lists[1].containsProduct)
        assertEquals(1, saved.reads, "the mirror is re-read from the platform, not patched")
    }

    @Test
    fun `unticking removes from that list only`() = runTest(dispatcher) {
        val lists = FakeLists().apply { holding += WEEKLY }
        val vm = vm(lists)
        advanceUntilIdle()

        vm.toggle(ready(vm).lists[1])
        advanceUntilIdle()

        assertEquals(listOf("remove:$WEEKLY"), lists.calls)
        assertEquals(true, ready(vm).lists[0].containsProduct, "Saved was not touched")
    }

    @Test
    fun `a new list is created with the product in one call`() = runTest(dispatcher) {
        val lists = FakeLists()
        val vm = vm(lists)
        advanceUntilIdle()
        var cleared = false

        vm.create("Daily Items") { cleared = true }
        advanceUntilIdle()

        assertEquals(listOf("create:Daily Items:$PRODUCT"), lists.calls)
        assertTrue(cleared)
        assertEquals(true, ready(vm).lists.last().containsProduct)
    }

    @Test
    fun `a refused name is said on the field and what was typed is kept`() = runTest(dispatcher) {
        val lists = FakeLists().apply { refuse = ListRefusal.NAME_TAKEN }
        val vm = vm(lists)
        advanceUntilIdle()
        var cleared = false

        vm.create("Weekly Items") { cleared = true }
        advanceUntilIdle()

        assertEquals("You already have a list with that name.", ready(vm).nameError)
        assertTrue(!cleared, "the field is cleared only when the list was made")
    }

    @Test
    fun `a list deleted on another device says so and disappears`() = runTest(dispatcher) {
        val lists = FakeLists().apply { refuse = ListRefusal.LIST_NOT_FOUND }
        val vm = vm(lists)
        advanceUntilIdle()

        vm.toggle(ready(vm).lists[1])
        advanceUntilIdle()

        assertEquals("That list no longer exists.", ready(vm).error)
        assertEquals(listOf("Saved"), ready(vm).lists.map { it.label })
    }

    /** FR-037: named lists need an account. A guest is told so, and nothing is asked of the platform. */
    @Test
    fun `a guest is told lists need an account`() = runTest(dispatcher) {
        val lists = FakeLists().apply { failLists = true }
        val vm = vm(lists, signedIn = false)
        advanceUntilIdle()

        assertIs<ListChooserState.SignedOut>(vm.state.value)
    }

    @Test
    fun `a failed read is a failure and not an empty chooser`() = runTest(dispatcher) {
        val vm = vm(FakeLists().apply { failLists = true })
        advanceUntilIdle()

        assertIs<ListChooserState.Failed>(vm.state.value)
    }

    @Test
    fun `every refusal has its own sentence`() {
        val sentences = ListRefusal.entries.map { listRefusalText(it) } + listRefusalText(null)
        assertTrue(sentences.all { it.isNotBlank() })
        assertEquals(7, sentences.toSet().size, "six refusals with their own sentence, plus the generic one the heart's refusal shares")
    }

    /** Code points, as the platform counts: forty emoji are forty, not eighty. */
    @Test
    fun `the remaining count is in characters as the platform counts them`() {
        assertEquals(40, listNameRemaining(""))
        assertEquals(28, listNameRemaining("  Weekly   Items "))
        assertEquals(0, listNameRemaining("🥚".repeat(40)))
        assertEquals(-1, listNameRemaining("🥚".repeat(41)))
    }

    /** Word for word what customer-web says (FR-006, FR-041). */
    @Test
    fun `the delete confirmation states both numbers`() {
        assertEquals("This list is empty.", deleteSummary(0, 0))
        assertEquals(
            "This list has 1 item. All of them are in another list too, so they stay saved.",
            deleteSummary(1, 0),
        )
        assertEquals(
            "This list has 3 items. 1 of them isn't in any other list and will no longer be saved.",
            deleteSummary(3, 1),
        )
        assertEquals(
            "This list has 5 items. 2 of them aren't in any other list and will no longer be saved.",
            deleteSummary(5, 2),
        )
        assertNull(null)
    }
}
