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
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryMethod
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryQuote
import com.effyshopping.customer.mobile.features.checkout.domain.DeliverySlot
import com.effyshopping.customer.mobile.features.checkout.domain.PlaceOrder
import com.effyshopping.customer.mobile.features.checkout.domain.QuoteDelivery
import com.effyshopping.customer.mobile.features.checkout.domain.SameDayUnavailable
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
 * 069 — choosing a same-day slot and a standard day, and what happens when one goes before payment.
 *
 * ⚠ THE RULE THIS SUITE PINS: the app never chooses a delivery time for the shopper, and never moves
 * them to a different one. A slot that has gone leaves NOTHING selected (FR-006, FR-010).
 */
class DeliveryChoiceTest {

    @BeforeTest fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @AfterTest fun tearDown() = Dispatchers.resetMain()

    private val address = SavedAddress(
        id = "a", label = null, recipientName = "Test", phone = null, line1 = "1 Test St", line2 = null,
        city = "Melbourne", region = "VIC", postalCode = "3000", country = "AU", isDefault = true,
    )

    private val evening = DeliverySlot("evening", "2026-10-08", "2026-10-08T17:00:00+11:00", "2026-10-08T19:00:00+11:00", "2026-10-08T15:00:00+11:00")
    private val late = DeliverySlot("late", "2026-10-08", "2026-10-08T19:00:00+11:00", "2026-10-08T21:00:00+11:00", "2026-10-08T17:00:00+11:00")
    private val days = listOf("2026-10-09", "2026-10-10", "2026-10-13")

    private fun quote(
        slots: List<DeliverySlot> = listOf(evening, late),
        days: List<String> = this.days,
        deliveries: Int = 1,
        sameDayDeliveries: Int = 1,
    ) = DeliveryQuote(
        serviced = true,
        sameDayAvailable = slots.isNotEmpty(),
        standardTotalAmount = "6.00",
        sameDayTotalAmount = if (slots.isNotEmpty()) "11.00" else null,
        slots = slots,
        standardDays = days,
        sameDayUnavailable = if (slots.isEmpty()) SameDayUnavailable.SlotsClosed else null,
        deliveries = deliveries,
        sameDayDeliveries = sameDayDeliveries,
        sameDayPartAmount = if (slots.isNotEmpty()) "11.00" else null,
        standardPartAmount = if (slots.isNotEmpty()) "0.00" else null,
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

    // ── Choosing ────────────────────────────────────────────────────────────────────────────────────

    @Test
    fun `the earliest standard day is preselected and no slot is`() = runTest {
        val s = ready(vm(Checkout(quote())))
        assertEquals("2026-10-09", s.standardDate)
        assertNull(s.slotId, "a delivery window is never chosen for the shopper")
        assertTrue(s.deliveryChosen, "standard with the default day is ready to pay")
    }

    @Test
    fun `same-day cannot be paid for until a slot is chosen`() = runTest {
        val checkout = Checkout(quote())
        val vm = vm(checkout)
        vm.setMethod(DeliveryMethod.SAME_DAY)
        assertFalse(ready(vm).deliveryChosen)

        vm.payNow()
        assertEquals("Choose a delivery time to continue.", ready(vm).error)
        assertTrue(checkout.orders.isEmpty(), "no intent is created without a slot")

        vm.setSlot("late")
        assertTrue(ready(vm).deliveryChosen)
        assertNull(ready(vm).error)
    }

    @Test
    fun `a same-day order sends the method and the slot - and no day when everything arrives today`() = runTest {
        val checkout = Checkout(quote())
        val vm = vm(checkout)
        vm.setMethod(DeliveryMethod.SAME_DAY)
        vm.setSlot("late")
        vm.payNow()

        val order = checkout.orders.single()
        assertEquals(DeliveryMethod.SAME_DAY, order.deliveryMethod)
        assertEquals("late", order.sameDaySlotId)
        assertNull(order.standardDate)
        assertTrue(ready(vm).handedOffToPayment)
    }

    @Test
    fun `a standard order sends the chosen day and no slot`() = runTest {
        val checkout = Checkout(quote())
        val vm = vm(checkout)
        vm.setStandardDate("2026-10-13")
        vm.payNow()

        val order = checkout.orders.single()
        assertEquals("2026-10-13", order.standardDate)
        assertNull(order.sameDaySlotId)
    }

    @Test
    fun `a slot left selected is not sent once the shopper switches back to standard`() = runTest {
        val checkout = Checkout(quote())
        val vm = vm(checkout)
        vm.setMethod(DeliveryMethod.SAME_DAY)
        vm.setSlot("evening")
        vm.setMethod(DeliveryMethod.STANDARD)
        vm.payNow()

        assertNull(checkout.orders.single().sameDaySlotId)
        assertEquals("2026-10-09", checkout.orders.single().standardDate)
    }

    @Test
    fun `a mixed order needs one slot AND one day`() = runTest {
        val checkout = Checkout(quote(deliveries = 2, sameDayDeliveries = 1))
        val vm = vm(checkout)
        vm.setMethod(DeliveryMethod.SAME_DAY)
        val s = ready(vm)
        assertTrue(s.needsSlot)
        assertTrue(s.needsDay)

        vm.setSlot("evening")
        vm.setStandardDate("2026-10-10")
        vm.payNow()
        val order = checkout.orders.single()
        assertEquals("evening", order.sameDaySlotId)
        assertEquals("2026-10-10", order.standardDate)
    }

    @Test
    fun `a slot or a day the quote does not offer cannot be selected`() = runTest {
        val vm = vm(Checkout(quote()))
        vm.setMethod(DeliveryMethod.SAME_DAY)
        vm.setSlot("made-up")
        vm.setStandardDate("2030-01-01")
        assertNull(ready(vm).slotId)
        assertEquals("2026-10-09", ready(vm).standardDate)
    }

    @Test
    fun `with no open slot same-day is not offered and says why`() = runTest {
        val vm = vm(Checkout(quote(slots = emptyList())))
        val s = ready(vm)
        assertFalse(s.sameDayOfferable)
        assertEquals(SameDayUnavailable.SlotsClosed, s.quote?.sameDayUnavailable)

        vm.setMethod(DeliveryMethod.SAME_DAY)
        assertEquals(DeliveryMethod.STANDARD, ready(vm).method)
    }

    @Test
    fun `a quote from a server older than 069 offers no days and still lets the shopper pay`() = runTest {
        val checkout = Checkout(quote(slots = emptyList(), days = emptyList()))
        val vm = vm(checkout)
        assertFalse(ready(vm).needsDay)
        vm.payNow()
        assertNull(checkout.orders.single().standardDate)
    }

    // ── Refusal ─────────────────────────────────────────────────────────────────────────────────────

    @Test
    fun `a slot that has gone is refused - nothing is selected in its place and no payment opens`() = runTest {
        val checkout = Checkout(quote())
        checkout.refuseWith = DeliveryChoiceRefused(DeliveryChoiceRefusal.SlotUnavailable, quote(slots = listOf(late)))
        val handoff = PaymentHandoff()
        val vm = vm(checkout, handoff)
        vm.setMethod(DeliveryMethod.SAME_DAY)
        vm.setSlot("evening")
        vm.payNow()

        val s = ready(vm)
        assertEquals("That delivery time is no longer available. Please choose another.", s.error)
        assertFalse(s.paying)
        assertFalse(s.handedOffToPayment, "the payment screen does not open")
        // The options are the ones the server sent with the refusal…
        assertEquals(listOf("late"), s.quote?.slots?.map { it.id })
        // …and ⚠ the remaining slot was NOT chosen for them.
        assertNull(s.slotId)
        assertFalse(s.deliveryChosen)
        assertEquals(1, checkout.orders.size, "one intent — the refused one. No quiet retry.")
    }

    @Test
    fun `when the last slot goes same-day falls away and standard is offered - but not paid for`() = runTest {
        val checkout = Checkout(quote())
        checkout.refuseWith = DeliveryChoiceRefused(DeliveryChoiceRefusal.SlotUnavailable, quote(slots = emptyList()))
        val vm = vm(checkout)
        vm.setMethod(DeliveryMethod.SAME_DAY)
        vm.setSlot("evening")
        vm.payNow()

        val s = ready(vm)
        assertEquals(DeliveryMethod.STANDARD, s.method)
        assertFalse(s.handedOffToPayment, "the shopper is shown standard; they are not charged for it")
        assertNotNull(s.error)
    }

    @Test
    fun `a day that has gone is refused and the earliest day now on offer is selected`() = runTest {
        val checkout = Checkout(quote())
        checkout.refuseWith = DeliveryChoiceRefused(DeliveryChoiceRefusal.DateUnavailable, quote(days = listOf("2026-10-10", "2026-10-13")))
        val vm = vm(checkout)
        vm.payNow()

        val s = ready(vm)
        assertEquals("That delivery day is no longer available. Please choose another.", s.error)
        assertEquals("2026-10-10", s.standardDate)
        assertFalse(s.handedOffToPayment)
    }

    @Test
    fun `a refusal without fresh options asks for them`() = runTest {
        val checkout = Checkout(quote())
        checkout.refuseWith = DeliveryChoiceRefused(DeliveryChoiceRefusal.SlotUnavailable, null)
        val vm = vm(checkout)
        val before = checkout.quoteCalls
        vm.setMethod(DeliveryMethod.SAME_DAY)
        vm.setSlot("evening")
        vm.payNow()
        assertEquals(before + 1, checkout.quoteCalls)
        assertNull(ready(vm).slotId)
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
    fun `a standard order holds nothing - and a malformed value never blocks payment`() {
        assertFalse(holdLapsed(null, 0))
        assertFalse(holdLapsed("not-a-time", Long.MAX_VALUE))
    }
}
