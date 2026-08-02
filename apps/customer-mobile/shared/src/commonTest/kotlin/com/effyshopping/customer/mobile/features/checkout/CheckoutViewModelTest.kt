package com.effyshopping.customer.mobile.features.checkout

import com.effyshopping.customer.mobile.core.storage.InMemoryDevicePreferences
import com.effyshopping.customer.mobile.features.addresses.domain.AddAddress
import com.effyshopping.customer.mobile.features.addresses.domain.AddressDraft
import com.effyshopping.customer.mobile.features.addresses.domain.AddressRepository
import com.effyshopping.customer.mobile.features.addresses.domain.ListAddresses
import com.effyshopping.customer.mobile.features.addresses.domain.SavedAddress
import com.effyshopping.customer.mobile.features.cart.data.CartLocalStore
import com.effyshopping.customer.mobile.features.cart.domain.CartStore
import com.effyshopping.customer.mobile.features.checkout.domain.CheckoutIntent
import com.effyshopping.customer.mobile.features.checkout.domain.CheckoutRepository
import com.effyshopping.customer.mobile.features.checkout.domain.PayForOrder
import com.effyshopping.customer.mobile.core.payment.PaymentDriver
import com.effyshopping.customer.mobile.core.payment.PaymentResult
import com.effyshopping.customer.mobile.features.checkout.domain.PlaceOrder
import com.effyshopping.customer.mobile.features.checkout.presentation.CheckoutUiState
import com.effyshopping.customer.mobile.features.checkout.presentation.CheckoutViewModel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
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
 * ⚠ THIS SUITE SHRANK BY DESIGN. It used to be dominated by the delivery step — quote fetching, a
 * method preference, per-package overrides, scheduled dates, set-aside confirmation, requoting.
 * Delivery zones, quotes and fees were WITHDRAWN from the platform, so those tests were not "fixed":
 * the behaviour they described no longer exists.
 *
 * What remains is what checkout still is on this surface: choose a shipping address, optionally
 * diverge the billing address, pay.
 */
class CheckoutViewModelTest {

    // ⚠ The ViewModel loads its addresses from `init` on `viewModelScope`, which dispatches to Main.
    // Without a test Main the state never leaves Loading and every assertion here reads a screen the
    // shopper would never see.
    @BeforeTest fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @AfterTest fun tearDown() = Dispatchers.resetMain()

    private fun addr(id: String, isDefault: Boolean = false) = SavedAddress(
        id = id, label = null, recipientName = "Test", phone = null,
        line1 = "1 Test St", line2 = null, city = "Melbourne", region = "VIC",
        postalCode = "3000", country = "AU", isDefault = isDefault,
    )

    private class FakeAddresses(private val items: List<SavedAddress>) : AddressRepository {
        override suspend fun list() = items
        override suspend fun create(draft: AddressDraft) = items.first()
        override suspend fun update(id: String, draft: AddressDraft) = items.first()
        override suspend fun setDefault(id: String) = items.first()
        override suspend fun delete(id: String) = Unit
    }

    private class FakeCheckout : CheckoutRepository {
        override suspend fun createIntent(order: PlaceOrder) = CheckoutIntent(
            orderId = "o1", orderNumber = "EFY-1", clientSecret = "cs",
            publishableKey = "pk", grandTotalAmount = "10.00", currency = "AUD",
        )
        override suspend fun confirm(orderId: String) = true
    }

    private class FakePaymentDriver : PaymentDriver {
        override suspend fun presentPaymentSheet(clientSecret: String, publishableKey: String) =
            PaymentResult.Completed
    }

    private fun vm(addresses: List<SavedAddress>): CheckoutViewModel {
        val repo = FakeAddresses(addresses)
        return CheckoutViewModel(
            cart = CartStore(CartLocalStore(InMemoryDevicePreferences()), CoroutineScope(UnconfinedTestDispatcher())),
            listAddresses = ListAddresses(repo),
            addAddress = AddAddress(repo),
            pay = PayForOrder(FakeCheckout(), FakePaymentDriver(), "pk_test"),
        )
    }

    private fun ready(vm: CheckoutViewModel) = vm.state.value as? CheckoutUiState.Ready

    // ── Address selection ──────────────────────────────────────────────────────────────────────

    @Test
    fun `the default address is pre-selected`() = runTest {
        val vm = vm(listOf(addr("a"), addr("b", isDefault = true)))
        assertEquals("b", ready(vm)?.selectedId)
    }

    // ⚠ Deterministic when nothing is marked default — a shopper must not get a different address
    // depending on read order.
    @Test
    fun `with no default it falls back to the first saved address`() = runTest {
        val vm = vm(listOf(addr("a"), addr("b")))
        assertEquals("a", ready(vm)?.selectedId)
    }

    @Test
    fun `selecting a different address is per-order only`() = runTest {
        val vm = vm(listOf(addr("a", isDefault = true), addr("b")))
        vm.select("b")

        assertEquals("b", ready(vm)?.selectedId)
        // ⚠ The SAVED default is untouched (022 FR-006): choosing where one order goes is not the same
        // as changing where every future order goes.
        assertTrue(ready(vm)!!.addresses.first { it.id == "a" }.isDefault)
    }

    // ── Billing (023 US4) ──────────────────────────────────────────────────────────────────────

    @Test
    fun `billing defaults to same as shipping`() = runTest {
        val vm = vm(listOf(addr("a", isDefault = true)))
        assertTrue(ready(vm)!!.billingSameAsShipping)
        assertNull(ready(vm)!!.effectiveBillingId)
    }

    // FR-013: turning "same as shipping" back ON discards the divergent choice rather than remembering it.
    @Test
    fun `re-enabling same-as-shipping discards the divergent billing address`() = runTest {
        val vm = vm(listOf(addr("a", isDefault = true), addr("b")))
        vm.setBillingSameAsShipping(false)
        vm.selectBilling("b")
        assertEquals("b", ready(vm)?.effectiveBillingId)

        vm.setBillingSameAsShipping(true)

        assertNull(ready(vm)?.billingSelectedId)
        assertNull(ready(vm)?.effectiveBillingId)
    }

    // ⚠ A billing address EQUAL to shipping is sent as null, not as a duplicate snapshot — "same as
    // shipping" is the ABSENCE of a divergent billing address, not a copy of one.
    @Test
    fun `billing equal to shipping sends nothing`() = runTest {
        val vm = vm(listOf(addr("a", isDefault = true)))
        vm.setBillingSameAsShipping(false)
        vm.selectBilling("a")

        assertNull(ready(vm)?.effectiveBillingId)
    }

    // ── Paying ─────────────────────────────────────────────────────────────────────────────────

    // FR-012: a diverged billing address must be chosen before paying.
    @Test
    fun `paying without a chosen billing address is refused`() = runTest {
        val vm = vm(listOf(addr("a", isDefault = true)))
        vm.setBillingSameAsShipping(false)

        vm.payNow()

        assertFalse(ready(vm)!!.paying)
        assertEquals("Choose a billing address.", ready(vm)?.error)
    }

    @Test
    fun `paying with no address at all is refused`() = runTest {
        val vm = vm(emptyList())

        vm.payNow()

        assertEquals("Add a delivery address to continue.", ready(vm)?.error)
    }
}
