package com.effyshopping.customer.mobile.features.payment

import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.features.paymentmethods.domain.KeptCard
import com.effyshopping.customer.mobile.features.paymentmethods.domain.ListPaymentMethods
import com.effyshopping.customer.mobile.features.paymentmethods.domain.PaymentMethodsRepository
import com.effyshopping.customer.mobile.features.paymentmethods.domain.RemovePaymentMethod
import com.effyshopping.customer.mobile.features.paymentmethods.presentation.PaymentMethodsViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * PaymentMethodsViewModel (051 US6).
 *
 * ⚠ No comma in a backtick test name — Kotlin/Native forbids it while the JVM accepts it, so a comma
 * makes the iOS test compilation fail while Android stays green (033).
 */
@OptIn(ExperimentalCoroutinesApi::class)
class PaymentMethodsViewModelTest {

    @BeforeTest fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @AfterTest fun tearDown() = Dispatchers.resetMain()

    private class FakeRepo(
        var cards: List<KeptCard> = emptyList(),
        var listThrows: AppError? = null,
        var removeThrows: AppError? = null,
    ) : PaymentMethodsRepository {
        var removed = mutableListOf<String>()
        override suspend fun list(): List<KeptCard> {
            listThrows?.let { throw AppException(it) }
            return cards
        }
        override suspend fun remove(id: String) {
            removeThrows?.let { throw AppException(it) }
            removed += id
        }
    }

    private fun viewModel(repo: FakeRepo) =
        PaymentMethodsViewModel(ListPaymentMethods(repo), RemovePaymentMethod(repo))

    private fun card(id: String = "pm_1", usable: Boolean = true) = KeptCard(
        id = id, brand = "visa", last4 = "4242", expMonth = 4, expYear = 2028,
        isDefault = true, usable = usable, unusableReason = if (usable) null else "This card has expired.",
    )

    @Test
    fun `loads the shoppers kept cards`() = runTest {
        val vm = viewModel(FakeRepo(cards = listOf(card())))
        assertEquals(1, vm.state.value.cards.size)
        assertFalse(vm.state.value.loading)
        assertFalse(vm.state.value.loadFailed)
    }

    /**
     * ⚠ THE DISTINCTION THIS VIEWMODEL EXISTS TO PRESERVE (FR-036).
     *
     * "You have no cards" and "we could not ask" are different facts. Falling back to an empty list on
     * a failed read tells a shopper with saved cards something false about their own account — and it
     * is the easy mistake to ship, because `catch { emptyList() }` looks like sensible defensive code.
     */
    @Test
    fun `a failed read is reported as a failure and never as an empty list`() = runTest {
        val vm = viewModel(FakeRepo(listThrows = AppError.Network))
        assertTrue(vm.state.value.loadFailed, "a failed read was not reported as a failure")
        assertTrue(vm.state.value.cards.isEmpty())
        assertFalse(vm.state.value.loading)
    }

    @Test
    fun `having no cards is not a failure`() = runTest {
        val vm = viewModel(FakeRepo(cards = emptyList()))
        assertFalse(vm.state.value.loadFailed, "an empty account was reported as a read failure")
        assertTrue(vm.state.value.cards.isEmpty())
    }

    @Test
    fun `removing a card drops it from the list`() = runTest {
        val repo = FakeRepo(cards = listOf(card("pm_1"), card("pm_2")))
        val vm = viewModel(repo)
        vm.remove("pm_1")

        assertEquals(listOf("pm_1"), repo.removed)
        assertEquals(listOf("pm_2"), vm.state.value.cards.map { it.id })
        assertNull(vm.state.value.removing)
    }

    /**
     * ⚠ A FAILED REMOVAL MUST KEEP THE CARD. Dropping it optimistically would show the shopper a card
     * that still exists at the provider and can still be charged — the list would be lying about what
     * Effy can do with their money.
     */
    @Test
    fun `a failed removal keeps the card and says the cards are unchanged`() = runTest {
        val repo = FakeRepo(cards = listOf(card("pm_1")), removeThrows = AppError.Network)
        val vm = viewModel(repo)
        vm.remove("pm_1")

        assertEquals(listOf("pm_1"), vm.state.value.cards.map { it.id })
        val error = vm.state.value.error.orEmpty()
        assertTrue(error.contains("unchanged", ignoreCase = true), "the message did not say the cards are unchanged: $error")
        assertNull(vm.state.value.removing)
    }

    /** An unusable card still carries its reason through the domain, unchanged (FR-023). */
    @Test
    fun `an unusable card keeps the reason the server computed`() = runTest {
        val vm = viewModel(FakeRepo(cards = listOf(card(usable = false))))
        assertEquals("This card has expired.", vm.state.value.cards.single().unusableReason)
    }
}
