package com.effyshopping.customer.mobile.features.checkout

import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.core.payment.PaymentDriver
import com.effyshopping.customer.mobile.core.payment.PaymentResult
import com.effyshopping.customer.mobile.features.addresses.domain.AddAddress
import com.effyshopping.customer.mobile.features.addresses.domain.AddressDraft
import com.effyshopping.customer.mobile.features.addresses.domain.AddressRepository
import com.effyshopping.customer.mobile.features.addresses.domain.ListAddresses
import com.effyshopping.customer.mobile.features.addresses.domain.SavedAddress
import com.effyshopping.customer.mobile.features.addresses.presentation.AddressForm
import com.effyshopping.customer.mobile.features.cart.domain.CartMergeRepository
import com.effyshopping.customer.mobile.features.cart.domain.GuestCartLine
import com.effyshopping.customer.mobile.features.cart.domain.GuestCartStore
import com.effyshopping.customer.mobile.features.checkout.domain.CheckoutIntent
import com.effyshopping.customer.mobile.features.checkout.domain.CheckoutRepository
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryMethod
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryOption
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryQuote
import com.effyshopping.customer.mobile.features.checkout.domain.PayForOrder
import com.effyshopping.customer.mobile.features.checkout.domain.PlaceOrder
import com.effyshopping.customer.mobile.features.checkout.domain.QuoteDelivery
import com.effyshopping.customer.mobile.features.checkout.domain.QuotePackage
import com.effyshopping.customer.mobile.features.checkout.domain.QuotePackageItem
import com.effyshopping.customer.mobile.features.checkout.presentation.AddressTarget
import com.effyshopping.customer.mobile.features.checkout.presentation.CheckoutUiState
import com.effyshopping.customer.mobile.features.checkout.presentation.CheckoutViewModel
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
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

// ── Hand-written fakes (no mocking lib) ───────────────────────────────────────────────────────────────

private class FakeCartMerge : CartMergeRepository {
    var merged = false
    override suspend fun merge(lines: List<GuestCartLine>) { merged = true }
}

private class FakePayment(private val result: PaymentResult = PaymentResult.Completed) : PaymentDriver {
    var presented = 0
    override suspend fun presentPaymentSheet(clientSecret: String, publishableKey: String): PaymentResult {
        presented++
        return result
    }
}

/** The checkout/intent side. `requoteTimes` throws a 409 that many times first. */
private class FakeCheckout(
    private val quote: DeliveryQuote,
    private var requoteTimes: Int = 0,
) : CheckoutRepository {
    var quoteCalls = 0
    var lastOrder: PlaceOrder? = null
    var intentCalls = 0

    override suspend fun quote(addressId: String): DeliveryQuote {
        quoteCalls++
        return quote
    }

    override suspend fun createIntent(order: PlaceOrder): CheckoutIntent {
        intentCalls++
        lastOrder = order
        if (requoteTimes > 0) {
            requoteTimes--
            throw AppException(AppError.RequoteRequired)
        }
        return CheckoutIntent("ord1", "EF-1", "cs", "pk", "20.00", "AUD")
    }

    override suspend fun confirm(orderId: String): Boolean = true
}

/** The 022 Address Book the checkout picker reads/writes (023). Auto-defaults the first address. */
private class FakeBook(seed: List<SavedAddress>) : AddressRepository {
    val store = seed.toMutableList()
    var createCalls = 0
    private var seq = 0

    override suspend fun list(): List<SavedAddress> = store.toList()

    override suspend fun create(draft: AddressDraft): SavedAddress {
        createCalls++
        val created = SavedAddress(
            id = "new-${++seq}", label = draft.label, recipientName = draft.recipientName, phone = draft.phone,
            line1 = draft.line1, line2 = draft.line2, city = draft.city, region = draft.region,
            postalCode = draft.postalCode, country = "AU", isDefault = store.isEmpty(),
        )
        store.add(created)
        return created
    }

    override suspend fun update(id: String, draft: AddressDraft): SavedAddress = store.first { it.id == id }
    override suspend fun setDefault(id: String): SavedAddress = store.first { it.id == id }
    override suspend fun delete(id: String) { store.removeAll { it.id == id } }
}

private fun saved(id: String, isDefault: Boolean) = SavedAddress(
    id = id, label = null, recipientName = "R-$id", phone = null,
    line1 = "$id St", line2 = null, city = "Melbourne", region = "VIC",
    postalCode = "3000", country = "AU", isDefault = isDefault,
)

private val VALID_FORM = AddressForm(recipientName = "New Person", line1 = "1 New St", city = "Geelong", postalCode = "3220")

private fun option(method: DeliveryMethod, fee: String, dates: List<String> = emptyList()) =
    DeliveryOption(method, method.name, fee, "window", dates)

private fun pkg(key: String, serviceable: Boolean, options: List<DeliveryOption>) =
    QuotePackage(key, listOf(QuotePackageItem("prod-$key", "item-$key", null, 1)), serviceable, options)

@OptIn(ExperimentalCoroutinesApi::class)
class CheckoutViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @BeforeTest fun setUp() { Dispatchers.setMain(dispatcher) }

    @AfterTest fun tearDown() { Dispatchers.resetMain() }

    private fun vmFor(
        repo: FakeCheckout,
        book: FakeBook = FakeBook(listOf(saved("addr1", isDefault = true))),
        payment: FakePayment = FakePayment(),
    ): CheckoutViewModel =
        CheckoutViewModel(
            guestCart = GuestCartStore(),
            cartRepo = FakeCartMerge(),
            listAddresses = ListAddresses(book),
            addAddress = AddAddress(book),
            quoteDelivery = QuoteDelivery(repo),
            pay = PayForOrder(repo, payment, publishableKey = "pk_test_fake"),
        )

    private fun twoServiceable() = DeliveryQuote(
        quoteId = "q1",
        expiresAt = "2026-07-22T05:00:00Z",
        packages = listOf(
            pkg("pkg_a", true, listOf(option(DeliveryMethod.SAME_DAY, "7.00"), option(DeliveryMethod.STANDARD, "5.00"))),
            pkg("pkg_b", true, listOf(option(DeliveryMethod.SAME_DAY, "8.00"), option(DeliveryMethod.STANDARD, "5.00"))),
        ),
    )

    private fun ready(vm: CheckoutViewModel) = vm.state.value as CheckoutUiState.Ready

    // ── Delivery (021) — regression ───────────────────────────────────────────────────────────────────

    @Test
    fun autoQuotesOnEntryAndGroupsAnonymousPackages() = runTest(dispatcher) {
        val vm = vmFor(FakeCheckout(twoServiceable()))
        advanceUntilIdle()

        val s = ready(vm)
        val quote = assertNotNull(s.quote)
        assertEquals(2, quote.packages.size)
        assertEquals(2, s.selections.size)
        assertTrue(quote.packages.all { it.items.all { i -> i.name.startsWith("item-") } })
    }

    @Test
    fun defaultPreferenceAppliesToEveryPackage() = runTest(dispatcher) {
        val vm = vmFor(FakeCheckout(twoServiceable()))
        advanceUntilIdle()

        vm.setDefaultPreference(DeliveryMethod.SAME_DAY)
        assertTrue(ready(vm).selections.values.all { it.method == DeliveryMethod.SAME_DAY })
    }

    @Test
    fun overrideChangesOnlyThatPackage() = runTest(dispatcher) {
        val vm = vmFor(FakeCheckout(twoServiceable()))
        advanceUntilIdle()

        vm.setDefaultPreference(DeliveryMethod.SAME_DAY)
        vm.overridePackage("pkg_a", DeliveryMethod.STANDARD)
        val s = ready(vm)
        assertEquals(DeliveryMethod.STANDARD, s.selections.getValue("pkg_a").method)
        assertEquals(DeliveryMethod.SAME_DAY, s.selections.getValue("pkg_b").method)
    }

    @Test
    fun undeliverablePackageIsSetAsideAndBlocksUntilConfirmed() = runTest(dispatcher) {
        val quote = DeliveryQuote(
            "q2", "2026-07-22T05:00:00Z",
            listOf(
                pkg("pkg_ok", true, listOf(option(DeliveryMethod.STANDARD, "5.00"))),
                pkg("pkg_no", false, emptyList()),
            ),
        )
        val repo = FakeCheckout(quote)
        val payment = FakePayment()
        val vm = vmFor(repo, payment = payment)
        advanceUntilIdle()

        assertTrue(ready(vm).quote!!.hasSetAside)

        vm.payNow()
        advanceUntilIdle()
        assertNotNull(ready(vm).error)
        assertEquals(0, repo.intentCalls)
        assertEquals(0, payment.presented)

        vm.confirmSetAside(true)
        vm.payNow()
        advanceUntilIdle()
        assertTrue(vm.state.value is CheckoutUiState.Placed)
        assertEquals(listOf("pkg_no"), repo.lastOrder!!.excludedPackageKeys)
        assertEquals(listOf("pkg_ok"), repo.lastOrder!!.selections.map { it.packageKey })
        assertEquals("q2", repo.lastOrder!!.quoteId)
    }

    @Test
    fun fullyUndeliverableBlocksEntirely() = runTest(dispatcher) {
        val repo = FakeCheckout(DeliveryQuote("q3", "2026-07-22T05:00:00Z", listOf(pkg("pkg_no", false, emptyList()))))
        val vm = vmFor(repo)
        advanceUntilIdle()

        vm.payNow()
        advanceUntilIdle()
        val s = ready(vm)
        assertNotNull(s.error)
        assertEquals(0, repo.intentCalls)
        assertTrue(s.quote!!.fullyUndeliverable)
    }

    @Test
    fun staleQuoteReQuotesBeforeCharging() = runTest(dispatcher) {
        val repo = FakeCheckout(twoServiceable(), requoteTimes = 1)
        val payment = FakePayment()
        val vm = vmFor(repo, payment = payment)
        advanceUntilIdle()
        val quotesAfterEntry = repo.quoteCalls

        vm.payNow()
        advanceUntilIdle()

        val s = ready(vm)
        assertNotNull(s.requoteNotice)
        assertFalse(s.paying)
        assertEquals(quotesAfterEntry + 1, repo.quoteCalls)
        assertEquals(0, payment.presented)
        assertNull(s.error)
    }

    @Test
    fun happyPathPlacesAndSendsQuoteWithSelections() = runTest(dispatcher) {
        val repo = FakeCheckout(twoServiceable())
        val vm = vmFor(repo)
        advanceUntilIdle()
        vm.payNow()
        advanceUntilIdle()

        assertTrue(vm.state.value is CheckoutUiState.Placed)
        assertEquals("q1", repo.lastOrder!!.quoteId)
        assertEquals(listOf("pkg_a", "pkg_b"), repo.lastOrder!!.selections.map { it.packageKey })
        assertTrue(repo.lastOrder!!.excludedPackageKeys.isEmpty())
    }

    // ── US1: pre-select the default shipping address (023 T012) ────────────────────────────────────────

    @Test
    fun defaultAddressPreSelectedAsShipping() = runTest(dispatcher) {
        val book = FakeBook(listOf(saved("addr1", isDefault = false), saved("addr2", isDefault = true)))
        val vm = vmFor(FakeCheckout(twoServiceable()), book)
        advanceUntilIdle()

        assertEquals("addr2", ready(vm).selectedId) // the default, not the first
    }

    @Test
    fun deterministicSelectionWhenNoneDefault() = runTest(dispatcher) {
        val book = FakeBook(listOf(saved("addr1", isDefault = false), saved("addr2", isDefault = false)))
        val vm = vmFor(FakeCheckout(twoServiceable()), book)
        advanceUntilIdle()

        assertEquals("addr1", ready(vm).selectedId) // deterministically the first saved (FR-002)
    }

    @Test
    fun noSavedAddressBlocksPay() = runTest(dispatcher) {
        val repo = FakeCheckout(twoServiceable())
        val vm = vmFor(repo, FakeBook(emptyList()))
        advanceUntilIdle()

        val s = ready(vm)
        assertNull(s.selectedId)
        assertTrue(s.addresses.isEmpty())

        vm.payNow()
        advanceUntilIdle()
        assertNotNull(ready(vm).error)
        assertEquals(0, repo.intentCalls) // nothing placed without an address (FR-007)
    }

    // ── US2: switch the shipping address, re-quote, default unchanged (023 T016) ───────────────────────

    @Test
    fun switchingShippingRequotesAndLeavesSavedDefaultUnchanged() = runTest(dispatcher) {
        val book = FakeBook(listOf(saved("addr1", isDefault = true), saved("addr2", isDefault = false)))
        val repo = FakeCheckout(twoServiceable())
        val vm = vmFor(repo, book)
        advanceUntilIdle()
        assertEquals("addr1", ready(vm).selectedId)
        val quotesAfterEntry = repo.quoteCalls

        vm.select("addr2")
        advanceUntilIdle()

        assertEquals("addr2", ready(vm).selectedId)
        assertEquals(quotesAfterEntry + 1, repo.quoteCalls) // re-quoted for the new destination (FR-005)
        // Per-order only: the saved default is untouched (FR-006).
        assertEquals("addr1", book.store.first { it.isDefault }.id)
    }

    // ── US3: add a new address inline (023 T020) ───────────────────────────────────────────────────────

    @Test
    fun addNewAddressIsSavedAndSelectedAsShipping() = runTest(dispatcher) {
        val book = FakeBook(listOf(saved("addr1", isDefault = true)))
        val repo = FakeCheckout(twoServiceable())
        val vm = vmFor(repo, book)
        advanceUntilIdle()

        vm.openAddAddress(AddressTarget.SHIPPING)
        vm.onSheetFormChange(VALID_FORM)
        vm.submitAddress()
        advanceUntilIdle()

        val s = ready(vm)
        assertNull(s.sheet) // closed on success
        assertEquals(1, book.createCalls) // written to the book (edge)
        assertTrue(s.addresses.any { it.recipientName == "New Person" })
        assertEquals(s.addresses.last().id, s.selectedId) // the new address is now the shipping selection
    }

    @Test
    fun invalidAddShowsFieldErrorsAndSavesNothing() = runTest(dispatcher) {
        val book = FakeBook(listOf(saved("addr1", isDefault = true)))
        val vm = vmFor(FakeCheckout(twoServiceable()), book)
        advanceUntilIdle()

        vm.openAddAddress(AddressTarget.SHIPPING)
        vm.onSheetFormChange(AddressForm(line1 = "5 Kept St")) // missing name/city/postcode
        vm.submitAddress()
        advanceUntilIdle()

        val sheet = assertNotNull(ready(vm).sheet)
        assertTrue(sheet.fieldErrors.containsKey("recipientName"))
        assertTrue(sheet.fieldErrors.containsKey("postalCode"))
        assertEquals("5 Kept St", sheet.form.line1) // input preserved
        assertEquals(0, book.createCalls)
    }

    @Test
    fun dismissingTheSheetSavesNothing() = runTest(dispatcher) {
        val book = FakeBook(listOf(saved("addr1", isDefault = true)))
        val vm = vmFor(FakeCheckout(twoServiceable()), book)
        advanceUntilIdle()

        vm.openAddAddress(AddressTarget.SHIPPING)
        vm.onSheetFormChange(VALID_FORM)
        vm.dismissSheet()
        advanceUntilIdle()

        assertNull(ready(vm).sheet)
        assertEquals(0, book.createCalls) // SC-009: nothing persisted
    }

    // ── US4: billing same-as-shipping / divergent (023 T024) ───────────────────────────────────────────

    @Test
    fun billingSameAsShippingByDefaultOmitsBillingId() = runTest(dispatcher) {
        val repo = FakeCheckout(twoServiceable())
        val vm = vmFor(repo)
        advanceUntilIdle()
        assertTrue(ready(vm).billingSameAsShipping)

        vm.payNow()
        advanceUntilIdle()
        assertTrue(vm.state.value is CheckoutUiState.Placed)
        assertNull(repo.lastOrder!!.billingAddressId) // NULL = same as shipping (FR-009)
    }

    @Test
    fun divergentBillingSendsBillingId() = runTest(dispatcher) {
        val book = FakeBook(listOf(saved("addr1", isDefault = true), saved("addr2", isDefault = false)))
        val repo = FakeCheckout(twoServiceable())
        val vm = vmFor(repo, book)
        advanceUntilIdle()

        vm.setBillingSameAsShipping(false)
        vm.selectBilling("addr2")
        vm.payNow()
        advanceUntilIdle()

        assertTrue(vm.state.value is CheckoutUiState.Placed)
        assertEquals("addr2", repo.lastOrder!!.billingAddressId)
    }

    @Test
    fun billingEqualToShippingOmitsBillingId() = runTest(dispatcher) {
        val repo = FakeCheckout(twoServiceable())
        val vm = vmFor(repo) // single address addr1 = shipping
        advanceUntilIdle()

        vm.setBillingSameAsShipping(false)
        vm.selectBilling("addr1") // same as shipping → must still send NULL
        vm.payNow()
        advanceUntilIdle()

        assertTrue(vm.state.value is CheckoutUiState.Placed)
        assertNull(repo.lastOrder!!.billingAddressId)
    }

    @Test
    fun togglingBillingBackOnDiscardsTheDivergentSelection() = runTest(dispatcher) {
        val book = FakeBook(listOf(saved("addr1", isDefault = true), saved("addr2", isDefault = false)))
        val repo = FakeCheckout(twoServiceable())
        val vm = vmFor(repo, book)
        advanceUntilIdle()

        vm.setBillingSameAsShipping(false)
        vm.selectBilling("addr2")
        assertEquals("addr2", ready(vm).billingSelectedId)
        vm.setBillingSameAsShipping(true) // FR-013: discards the divergent choice
        assertNull(ready(vm).billingSelectedId)

        vm.payNow()
        advanceUntilIdle()
        assertNull(repo.lastOrder!!.billingAddressId)
    }

    @Test
    fun payBlockedWhenBillingOffAndNoneChosen() = runTest(dispatcher) {
        val repo = FakeCheckout(twoServiceable())
        val vm = vmFor(repo)
        advanceUntilIdle()

        vm.setBillingSameAsShipping(false)
        vm.payNow()
        advanceUntilIdle()

        assertNotNull(ready(vm).error)
        assertEquals(0, repo.intentCalls) // no order without a billing address chosen (FR-012)
    }
}
