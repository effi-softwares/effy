package com.effyshopping.customer.mobile.features.checkout

import com.effyshopping.customer.mobile.features.addresses.domain.AddAddress
import com.effyshopping.customer.mobile.features.addresses.domain.AddressDraft
import com.effyshopping.customer.mobile.features.addresses.domain.AddressRepository
import com.effyshopping.customer.mobile.features.addresses.domain.ListAddresses
import com.effyshopping.customer.mobile.features.addresses.domain.SaveAddressInstructions
import com.effyshopping.customer.mobile.features.addresses.domain.SavedAddress
import com.effyshopping.customer.mobile.features.checkout.domain.CheckoutIntent
import com.effyshopping.customer.mobile.features.checkout.domain.CheckoutPoints
import com.effyshopping.customer.mobile.features.checkout.domain.CheckoutRepository
import com.effyshopping.customer.mobile.features.checkout.domain.CreateIntent
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryQuote
import com.effyshopping.customer.mobile.features.checkout.domain.PlaceOrder
import com.effyshopping.customer.mobile.features.checkout.domain.PointsRefusal
import com.effyshopping.customer.mobile.features.checkout.domain.PointsRefused
import com.effyshopping.customer.mobile.features.checkout.domain.QuoteDelivery
import com.effyshopping.customer.mobile.features.checkout.presentation.CheckoutUiState
import com.effyshopping.customer.mobile.features.checkout.presentation.CheckoutViewModel
import com.effyshopping.customer.mobile.features.deliveryinstructions.domain.InstructionsDraft
import com.effyshopping.customer.mobile.features.payment.domain.PaymentHandoff
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * 074 US2 — points at checkout on mobile.
 *
 * ⚠ The app does not know the order total before the intent call, so "the most I can" is sent as the
 * balance and the server answers with the most it will take; the app asks once more with that. These
 * pin that it retries ONLY for that, and that a points-paid order skips the payment screen.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class PointsCheckoutViewModelTest {

    @BeforeTest fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @AfterTest fun tearDown() = Dispatchers.resetMain()

    private val home = SavedAddress(
        id = "a", label = null, recipientName = "T", phone = null, line1 = "1 Test St", line2 = null,
        city = "Melbourne", region = "VIC", postalCode = "3000", country = "AU", isDefault = true,
    )

    private inner class Addresses : AddressRepository {
        override suspend fun list() = listOf(home)
        override suspend fun create(draft: AddressDraft) = home
        override suspend fun update(id: String, draft: AddressDraft) = home
        override suspend fun setDefault(id: String) = home
        override suspend fun delete(id: String) = Unit
        override suspend fun saveInstructions(id: String, instructions: InstructionsDraft) = home
    }

    private class Checkout(private val usable: Long?, private val replies: MutableList<(PlaceOrder) -> CheckoutIntent>) : CheckoutRepository {
        val orders = mutableListOf<PlaceOrder>()
        override suspend fun createIntent(order: PlaceOrder): CheckoutIntent {
            orders += order
            return replies.removeAt(0)(order)
        }
        override suspend fun confirm(orderId: String) = true
        override suspend fun quote(addressId: String) = DeliveryQuote(
            serviced = true, sameDayAvailable = false, standardTotalAmount = "6.00", sameDayTotalAmount = null,
            points = usable?.let { CheckoutPoints(usable = it, centsPerPoint = 1) },
        )
    }

    private fun intent(order: PlaceOrder, paidWithPoints: Boolean = false) = CheckoutIntent(
        orderId = "o1", orderNumber = "EFY-1", clientSecret = if (paidWithPoints) "" else "cs", publishableKey = "pk",
        grandTotalAmount = "16.00", currency = "AUD", pointsUsed = order.pointsToUse,
        cardAmount = if (paidWithPoints) "0.00" else "6.00", paidWithPoints = paidWithPoints,
    )

    private fun vm(checkout: Checkout, handoff: PaymentHandoff = PaymentHandoff()) = CheckoutViewModel(
        listAddresses = ListAddresses(Addresses()), addAddress = AddAddress(Addresses()), createIntent = CreateIntent(checkout),
        handoff = handoff, quoteDelivery = QuoteDelivery(checkout), saveAddressInstructions = SaveAddressInstructions(Addresses()),
    )

    private fun ready(vm: CheckoutViewModel) = vm.state.value as CheckoutUiState.Ready

    @Test
    fun uses_the_whole_balance_by_default_and_hands_over_to_payment() {
        val checkout = Checkout(1000, mutableListOf({ o -> intent(o) }))
        val model = vm(checkout)
        assertNotNull(ready(model).points)
        model.payNow()
        assertEquals(1000, checkout.orders.single().pointsToUse)
        assertTrue(ready(model).handedOffToPayment)
    }

    @Test
    fun retries_once_with_the_most_the_server_will_take() {
        val checkout = Checkout(5000, mutableListOf(
            { _ -> throw PointsRefused(PointsRefusal.ExceedTotal, maxPoints = 1600) },
            { o -> intent(o, paidWithPoints = true) },
        ))
        val model = vm(checkout)
        model.payNow()
        assertEquals(listOf(5000L, 1600L), checkout.orders.map { it.pointsToUse })
        assertEquals("o1", ready(model).placedWithPoints)
        model.placedConsumed()
        assertNull(ready(model).placedWithPoints)
    }

    @Test
    fun a_changed_balance_is_refused_plainly_and_not_retried() {
        val checkout = Checkout(1000, mutableListOf({ _ -> throw PointsRefused(PointsRefusal.BalanceChanged, maxPoints = null) }))
        val model = vm(checkout)
        model.payNow()
        assertEquals(1, checkout.orders.size)
        assertTrue(ready(model).error!!.contains("balance has changed"))
        assertTrue(!ready(model).paying)
    }

    @Test
    fun switching_points_off_sends_none_and_a_customer_without_points_sees_no_control() {
        val checkout = Checkout(1000, mutableListOf({ o -> intent(o) }))
        val model = vm(checkout)
        model.setUsePoints(false)
        model.payNow()
        assertEquals(0, checkout.orders.single().pointsToUse)

        assertNull(ready(vm(Checkout(null, mutableListOf()))).points)
    }
}
