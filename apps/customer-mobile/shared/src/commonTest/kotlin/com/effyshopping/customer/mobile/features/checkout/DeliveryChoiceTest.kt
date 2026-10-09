package com.effyshopping.customer.mobile.features.checkout

import com.effyshopping.customer.mobile.features.addresses.domain.AddAddress
import com.effyshopping.customer.mobile.features.addresses.domain.AddressDraft
import com.effyshopping.customer.mobile.features.addresses.domain.AddressRepository
import com.effyshopping.customer.mobile.features.addresses.domain.ListAddresses
import com.effyshopping.customer.mobile.features.addresses.domain.SaveAddressInstructions
import com.effyshopping.customer.mobile.features.addresses.domain.SavedAddress
import com.effyshopping.customer.mobile.features.checkout.data.deliveryRefusalOrNull
import com.effyshopping.customer.mobile.features.checkout.domain.CheckoutIntent
import com.effyshopping.customer.mobile.features.checkout.domain.CheckoutRepository
import com.effyshopping.customer.mobile.features.checkout.domain.CreateIntent
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryChoiceRefusal
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryChoiceRefused
import com.effyshopping.customer.mobile.features.checkout.domain.ChosenWindow
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryFee
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryFeeLine
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryFeeLineKind
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryQuote
import com.effyshopping.customer.mobile.features.checkout.domain.EffyDay
import com.effyshopping.customer.mobile.features.checkout.domain.EffyWindow
import com.effyshopping.customer.mobile.features.checkout.domain.EffyWindows
import com.effyshopping.customer.mobile.features.checkout.domain.PlaceOrder
import com.effyshopping.customer.mobile.features.checkout.domain.QuoteDelivery
import com.effyshopping.customer.mobile.features.checkout.presentation.CheckoutUiState
import com.effyshopping.customer.mobile.features.checkout.presentation.CheckoutViewModel
import com.effyshopping.customer.mobile.features.deliveryinstructions.domain.InstructionsDraft
import com.effyshopping.customer.mobile.features.payment.domain.PaymentHandoff
import com.effyshopping.customer.mobile.features.payment.presentation.holdLapsed
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
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * What happens when the window a shopper chose goes before payment, the refusal on the wire, and the
 * hold (069, 078). Choosing a window is covered in `CheckoutViewModelTest`.
 *
 * ⚠ THE RULE THIS SUITE PINS: the app never chooses a delivery time for the shopper, and never moves
 * them to a different one. A window that has gone leaves NOTHING selected (FR-006, FR-010).
 */
class DeliveryChoiceTest {

    @BeforeTest fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @AfterTest fun tearDown() = Dispatchers.resetMain()

    private val address = SavedAddress(
        id = "a", label = null, recipientName = "Test", phone = null, line1 = "1 Test St", line2 = null,
        city = "Melbourne", region = "VIC", postalCode = "3000", country = "AU", isDefault = true,
    )

    private fun window(slot: String, date: String) = EffyWindow(
        slotId = slot, date = date, startAt = "${date}T17:00:00+11:00", endAt = "${date}T19:00:00+11:00", cutoffAt = "${date}T15:00:00+11:00",
        surchargeAmount = "0.00", fee = DeliveryFee(listOf(DeliveryFeeLine(DeliveryFeeLineKind.Delivery, "6.00")), "6.00"),
    )

    /** Today and tomorrow, each with the windows named. */
    private fun quote(today: List<String> = listOf("evening", "late"), tomorrow: List<String> = listOf("evening")) = DeliveryQuote(
        serviced = true,
        effyWindows = EffyWindows(
            days = listOf(
                EffyDay(date = "2026-10-08", today = true, windows = today.map { window(it, "2026-10-08") }, closedReason = null),
                EffyDay(date = "2026-10-09", today = false, windows = tomorrow.map { window(it, "2026-10-09") }, closedReason = null),
            ),
            unavailable = null,
        ),
    )

    private class Addresses(private val a: SavedAddress) : AddressRepository {
        override suspend fun list() = listOf(a)
        override suspend fun create(draft: AddressDraft) = a
        override suspend fun update(id: String, draft: AddressDraft) = a
        override suspend fun setDefault(id: String) = a
        override suspend fun delete(id: String) = Unit
        override suspend fun saveInstructions(id: String, instructions: InstructionsDraft) = a
    }

    private class Checkout(var quote: DeliveryQuote) : CheckoutRepository {
        val orders = mutableListOf<PlaceOrder>()
        var refuseWith: DeliveryChoiceRefused? = null
        var quoteCalls = 0

        override suspend fun createIntent(order: PlaceOrder): CheckoutIntent {
            orders += order
            refuseWith?.let { throw it }
            return CheckoutIntent(
                orderId = "o1", orderNumber = "EFY-1", clientSecret = "cs", publishableKey = "pk",
                grandTotalAmount = "21.00", currency = "AUD", slotHeldUntil = "2026-10-08T15:10:00+11:00",
            )
        }
        override suspend fun confirm(orderId: String) = true
        override suspend fun quote(addressId: String): DeliveryQuote {
            quoteCalls += 1
            return quote
        }
    }

    private fun vm(checkout: Checkout, handoff: PaymentHandoff = PaymentHandoff()): CheckoutViewModel {
        val repo = Addresses(address)
        return CheckoutViewModel(
            listAddresses = ListAddresses(repo),
            addAddress = AddAddress(repo),
            createIntent = CreateIntent(checkout),
            handoff = handoff,
            quoteDelivery = QuoteDelivery(checkout),
            saveAddressInstructions = SaveAddressInstructions(repo),
        )
    }

    private fun ready(vm: CheckoutViewModel) = assertNotNull(vm.state.value as? CheckoutUiState.Ready)

    // ── A window that goes before payment ───────────────────────────────────────────────────────────

    @Test
    fun `a window that has gone is refused - nothing is selected in its place and no payment opens`() = runTest {
        val checkout = Checkout(quote())
        val handoff = PaymentHandoff()
        val vm = vm(checkout, handoff)
        vm.setWindow("late", "2026-10-08")
        assertEquals(ChosenWindow("late", "2026-10-08"), ready(vm).window)

        // The server refuses, and says what is on offer now: "late" has gone, "evening" has not.
        checkout.refuseWith = DeliveryChoiceRefused(DeliveryChoiceRefusal.SlotUnavailable, quote(today = listOf("evening")))
        vm.payNow()

        val s = ready(vm)
        assertNull(s.window) // ⚠ NOT moved to "evening"
        assertFalse(s.deliveryChosen)
        assertFalse(s.handedOffToPayment)
        assertNotNull(s.error)
        assertEquals(listOf("evening"), s.effyWindows!!.days.first().windows.map { it.slotId })
    }

    @Test
    fun `a refusal without fresh options asks for them`() = runTest {
        val checkout = Checkout(quote())
        checkout.refuseWith = DeliveryChoiceRefused(DeliveryChoiceRefusal.SlotUnavailable, null)
        val vm = vm(checkout)
        val before = checkout.quoteCalls
        vm.setWindow("evening", "2026-10-08")
        vm.payNow()
        assertEquals(before + 1, checkout.quoteCalls)
        assertNull(ready(vm).window)
    }

    // ── The wire ────────────────────────────────────────────────────────────────────────────────────

    @Test
    fun `the server's refusal decodes - byte for byte what the Go wire test emits`() {
        // Byte-identical to deliveryChoiceRefusalWire in checkout/delivery_wire_contract_test.go.
        val wire = """{"type":"https://effyshopping.com/problems/conflict","title":"Conflict","status":409,"detail":"that delivery time is no longer available — choose another","instance":"/v1/checkout/intent","request_id":"req-1","code":"slot_unavailable"}"""
        val refused = assertNotNull(deliveryRefusalOrNull(wire))
        assertEquals(DeliveryChoiceRefusal.SlotUnavailable, refused.reason)
        assertNull(refused.quote)
    }

    @Test
    fun `any other conflict is not mistaken for a delivery refusal`() {
        assertNull(deliveryRefusalOrNull("""{"type":"https://effyshopping.com/problems/conflict","title":"Conflict","status":409}"""))
        assertNull(deliveryRefusalOrNull("""{"title":"Conflict","status":409,"code":"something_new"}"""))
        assertNull(deliveryRefusalOrNull("not json"))
    }

    // ── The hold ────────────────────────────────────────────────────────────────────────────────────

    @OptIn(kotlin.time.ExperimentalTime::class)
    @Test
    fun `a hold is live until the moment it lapses`() {
        val until = "2026-10-08T15:10:00+11:00"
        val at = { iso: String -> kotlin.time.Instant.parse(iso).toEpochMilliseconds() }
        assertFalse(holdLapsed(until, at("2026-10-08T15:09:59+11:00")))
        assertTrue(holdLapsed(until, at("2026-10-08T15:10:00+11:00")))
    }

    @Test
    fun `a courier order holds nothing - and a malformed value never blocks payment`() {
        assertFalse(holdLapsed(null, 0))
        assertFalse(holdLapsed("not-a-time", Long.MAX_VALUE))
    }
}
