package com.effyshopping.customer.mobile.features.checkout

import com.effyshopping.customer.mobile.core.delivery.CoverageWords
import com.effyshopping.customer.mobile.features.deliveryinstructions.domain.DeliveryInstructions
import com.effyshopping.customer.mobile.features.deliveryinstructions.domain.Handover
import com.effyshopping.customer.mobile.features.deliveryinstructions.domain.InstructionsDraft
import com.effyshopping.customer.mobile.features.addresses.domain.SaveAddressInstructions
import com.effyshopping.customer.mobile.features.addresses.domain.AddAddress
import com.effyshopping.customer.mobile.features.addresses.domain.AddressDraft
import com.effyshopping.customer.mobile.features.addresses.domain.AddressRepository
import com.effyshopping.customer.mobile.features.addresses.domain.ListAddresses
import com.effyshopping.customer.mobile.features.addresses.domain.SavedAddress
import com.effyshopping.customer.mobile.features.checkout.domain.CheckoutIntent
import com.effyshopping.customer.mobile.features.checkout.domain.CheckoutRepository
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryMethod
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryQuote
import com.effyshopping.customer.mobile.features.checkout.domain.CreateIntent
import com.effyshopping.customer.mobile.features.checkout.domain.QuoteDelivery
import com.effyshopping.customer.mobile.features.checkout.domain.PlaceOrder
import com.effyshopping.customer.mobile.features.payment.domain.PaymentHandoff
import com.effyshopping.customer.mobile.features.checkout.presentation.CheckoutUiState
import com.effyshopping.customer.mobile.features.checkout.presentation.CheckoutViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import com.effyshopping.customer.mobile.features.checkout.presentation.DeliveryFeeWords
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

        /** 066 — every write to an address's saved instructions, in order. */
        val savedInstructions = mutableListOf<Pair<String, InstructionsDraft>>()
        override suspend fun saveInstructions(id: String, instructions: InstructionsDraft): SavedAddress {
            savedInstructions += id to instructions
            return items.first { it.id == id }.copy(defaultInstructions = instructions.toInstructions())
        }
    }

    private class FakeCheckout(
        // 047: the quote the fake returns. Serviced by default so the existing pay tests still pass.
        private val quote: DeliveryQuote = DeliveryQuote(
            serviced = true, sameDayAvailable = false, standardTotalAmount = "6.00", sameDayTotalAmount = null,
        ),
        /** 077 — when set, the first intent is refused as "the delivery fee changed", with this quote. */
        private var feeChangedTo: DeliveryQuote? = null,
    ) : CheckoutRepository {
        var lastOrder: PlaceOrder? = null
        var intents = 0
        override suspend fun createIntent(order: PlaceOrder): CheckoutIntent {
            lastOrder = order
            intents += 1
            feeChangedTo?.let { feeChangedTo = null; throw com.effyshopping.customer.mobile.features.checkout.domain.DeliveryFeeChanged(it) }
            return CheckoutIntent(
                orderId = "o1", orderNumber = "EFY-1", clientSecret = "cs",
                publishableKey = "pk", grandTotalAmount = "10.00", currency = "AUD",
            )
        }
        override suspend fun confirm(orderId: String) = true
        override suspend fun quote(addressId: String) = quote
    }

    private fun vm(
        addresses: List<SavedAddress>,
        checkout: FakeCheckout = FakeCheckout(),
        handoff: PaymentHandoff = PaymentHandoff(),
    ): CheckoutViewModel {
        val repo = FakeAddresses(addresses)
        lastAddresses = repo
        return CheckoutViewModel(
            listAddresses = ListAddresses(repo),
            addAddress = AddAddress(repo),
            createIntent = CreateIntent(checkout),
            handoff = handoff,
            quoteDelivery = QuoteDelivery(checkout),
            saveAddressInstructions = SaveAddressInstructions(repo),
        )
    }

    private fun ready(vm: CheckoutViewModel) = vm.state.value as? CheckoutUiState.Ready

    /** The address fake behind the most recent [vm] — for asserting what was (not) written back. */
    private var lastAddresses: FakeAddresses? = null

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

    /**
     * ⚠ THE DEFECT THIS PINS. Checkout used to create the intent AND present the provider's modal sheet
     * in one call. 051 built an Effy-drawn payment screen to replace that sheet and never routed to it,
     * so the modal kept appearing with every test green — the new screen was unreachable, not broken.
     * This asserts the handoff actually happens.
     */
    @Test
    fun `paying hands the created intent to the payment screen`() = runTest {
        val handoff = PaymentHandoff()
        val vm = vm(listOf(addr("a", isDefault = true)), handoff = handoff)

        vm.payNow()

        assertEquals("o1", handoff.pending?.orderId)
        assertEquals("cs", handoff.pending?.clientSecret)
        assertTrue(ready(vm)!!.handedOffToPayment)
        // ⚠ The busy state is cleared on the way out. Leaving it set means a shopper who backs out of
        // payment returns to a checkout whose pay button is stuck spinning.
        assertFalse(ready(vm)!!.paying)
    }

    /**
     * ⚠ The one-shot must disarm, or backing out of payment re-fires it and bounces the shopper straight
     * back in — with no way out but the app switcher.
     */
    @Test
    fun `the handoff signal is consumed once`() = runTest {
        val vm = vm(listOf(addr("a", isDefault = true)))
        vm.payNow()
        assertTrue(ready(vm)!!.handedOffToPayment)

        vm.handoffConsumed()

        assertFalse(ready(vm)!!.handedOffToPayment)
    }

    @Test
    fun `paying with no address at all is refused`() = runTest {
        val vm = vm(emptyList())

        vm.payNow()

        assertEquals("Add a delivery address to continue.", ready(vm)?.error)
    }

    // ── Delivery quote (047) ─────────────────────────────────────────────────────────────────────

    @Test
    fun `the selected address is quoted on entry`() = runTest {
        val vm = vm(listOf(addr("a", isDefault = true)))
        val s = ready(vm)!!
        assertTrue(s.serviced)
        assertEquals("6.00", s.quote?.standardTotalAmount)
    }

    @Test
    fun `an unserviceable address blocks pay with one reason`() = runTest {
        val unserviced = FakeCheckout(quote = DeliveryQuote.Unserviced)
        val vm = vm(listOf(addr("a", isDefault = true)), checkout = unserviced)

        assertFalse(ready(vm)!!.serviced)
        vm.payNow()

        assertFalse(ready(vm)!!.paying)
        // 076 — the ONE refusal sentence, the same the address book and the website show.
        assertEquals(CoverageWords.REFUSAL, ready(vm)?.error)
        assertNull(unserviced.lastOrder) // never reached placement
    }

    // ⚠ 069 changed what this test can say. It used to read "offerable only when the WHOLE order
    // qualifies" — same-day is now offered when ANY delivery can go today and a slot is open, and it
    // cannot be paid for without a slot. The slot rules themselves are in DeliveryChoiceTest.
    @Test
    fun `same-day is sent on pay - with the slot it needs`() = runTest {
        val slot = com.effyshopping.customer.mobile.features.checkout.domain.DeliverySlot(
            id = "evening", date = "2026-10-08",
            startAt = "2026-10-08T17:00:00+11:00", endAt = "2026-10-08T19:00:00+11:00", cutoffAt = "2026-10-08T15:00:00+11:00",
        )
        val sameDay = FakeCheckout(
            quote = DeliveryQuote(
                serviced = true, sameDayAvailable = true,
                standardTotalAmount = "6.00", sameDayTotalAmount = "10.00",
                slots = listOf(slot), standardDays = listOf("2026-10-09"), deliveries = 1, sameDayDeliveries = 1,
            ),
        )
        val vm = vm(listOf(addr("a", isDefault = true)), checkout = sameDay)
        assertTrue(ready(vm)!!.sameDayOfferable)

        vm.setMethod(DeliveryMethod.SAME_DAY)
        assertEquals(DeliveryMethod.SAME_DAY, ready(vm)?.method)

        vm.setSlot("evening")
        vm.payNow()
        assertEquals(DeliveryMethod.SAME_DAY, sameDay.lastOrder?.deliveryMethod)
        assertEquals("evening", sameDay.lastOrder?.sameDaySlotId)
    }

    // ── 077: one delivery fee for the order ────────────────────────────────────────────────────

    private fun fee(vararg lines: Pair<com.effyshopping.customer.mobile.features.checkout.domain.DeliveryFeeLineKind, String>, total: String) =
        com.effyshopping.customer.mobile.features.checkout.domain.DeliveryFee(
            lines.map { com.effyshopping.customer.mobile.features.checkout.domain.DeliveryFeeLine(it.first, it.second) }, total,
        )

    private val pricedSameDay = DeliveryQuote(
        serviced = true, sameDayAvailable = true, standardTotalAmount = "6.00", sameDayTotalAmount = "9.00",
        standardFee = fee(com.effyshopping.customer.mobile.features.checkout.domain.DeliveryFeeLineKind.Delivery to "6.00", total = "6.00"),
        slots = listOf(
            com.effyshopping.customer.mobile.features.checkout.domain.DeliverySlot(
                id = "evening", date = "2026-10-08", startAt = "2026-10-08T17:00:00+11:00", endAt = "2026-10-08T19:00:00+11:00",
                cutoffAt = "2026-10-08T15:00:00+11:00", surchargeAmount = "3.00",
                fee = fee(
                    com.effyshopping.customer.mobile.features.checkout.domain.DeliveryFeeLineKind.Delivery to "6.00",
                    com.effyshopping.customer.mobile.features.checkout.domain.DeliveryFeeLineKind.WindowSurcharge to "3.00",
                    total = "9.00",
                ),
            ),
        ),
        standardDays = listOf("2026-10-09"), deliveries = 1, sameDayDeliveries = 1,
    )

    @Test
    fun `077 - the fee shown is the chosen window's, and that total is sent with the order`() = runTest {
        val checkout = FakeCheckout(quote = pricedSameDay)
        val vm = vm(listOf(addr("a", isDefault = true)), checkout = checkout)
        assertEquals("6.00", ready(vm)?.deliveryFee?.totalAmount) // a later day, until same-day is chosen

        vm.setMethod(DeliveryMethod.SAME_DAY)
        assertEquals(null, ready(vm)?.deliveryFee) // nothing to show until a window is chosen
        vm.setSlot("evening")
        assertEquals("9.00", ready(vm)?.deliveryFee?.totalAmount)

        vm.payNow()
        assertEquals("9.00", checkout.lastOrder?.shownDeliveryAmount)
    }

    @Test
    fun `077 - a delivery fee that changed is shown, nothing is paid, and paying again sends the new total`() = runTest {
        val dearer = pricedSameDay.copy(standardFee = fee(com.effyshopping.customer.mobile.features.checkout.domain.DeliveryFeeLineKind.Delivery to "7.50", total = "7.50"))
        val checkout = FakeCheckout(quote = pricedSameDay, feeChangedTo = dearer)
        val handoff = PaymentHandoff()
        val vm = vm(listOf(addr("a", isDefault = true)), checkout = checkout, handoff = handoff)

        vm.payNow()
        val s = ready(vm)!!
        assertEquals(DeliveryFeeWords.FEE_CHANGED, s.error)
        assertEquals("7.50", s.deliveryFee?.totalAmount)
        assertFalse(s.handedOffToPayment)

        vm.payNow()
        assertEquals(2, checkout.intents)
        assertEquals("7.50", checkout.lastOrder?.shownDeliveryAmount)
        assertTrue(ready(vm)!!.handedOffToPayment)
    }

    @Test
    fun `same-day cannot be chosen when it is not offerable`() = runTest {
        val vm = vm(listOf(addr("a", isDefault = true))) // default fake: standard only
        vm.setMethod(DeliveryMethod.SAME_DAY)
        assertEquals(DeliveryMethod.STANDARD, ready(vm)?.method) // ignored — not offerable
    }

    // ── Delivery instructions (066) ────────────────────────────────────────────────────────────

    private val sideGate = DeliveryInstructions(Handover.LeaveAtDoor, "Side gate")

    private fun home() = addr("a", isDefault = true).copy(defaultInstructions = sideGate)

    @Test
    fun `saying nothing sends no instructions`() = runTest {
        val checkout = FakeCheckout()
        val vm = vm(listOf(addr("a", isDefault = true)), checkout)
        vm.payNow()
        assertNull(checkout.lastOrder!!.deliveryInstructions)
    }

    @Test
    fun `a choice and a note are sent with the order`() = runTest {
        val checkout = FakeCheckout()
        val vm = vm(listOf(addr("a", isDefault = true)), checkout)
        vm.setInstructions(InstructionsDraft(Handover.MeetAtDoor, "  Ring twice  "))
        vm.payNow()
        assertEquals(DeliveryInstructions(Handover.MeetAtDoor, "Ring twice"), checkout.lastOrder!!.deliveryInstructions)
    }

    /** FR-013. */
    @Test
    fun `the selected address's saved instructions are prefilled`() = runTest {
        val checkout = FakeCheckout()
        val vm = vm(listOf(home()), checkout)
        assertEquals(InstructionsDraft(Handover.LeaveAtDoor, "Side gate"), ready(vm)!!.instructions)
        assertFalse(ready(vm)!!.instructionsDiffer)
        vm.payNow()
        assertEquals(sideGate, checkout.lastOrder!!.deliveryInstructions)
        assertTrue(lastAddresses!!.savedInstructions.isEmpty())
    }

    /** ⚠ FR-014 — an override is for THIS order; the address keeps what it had. */
    @Test
    fun `editing for one order does not write to the address`() = runTest {
        val checkout = FakeCheckout()
        val vm = vm(listOf(home()), checkout)
        vm.setInstructions(InstructionsDraft(Handover.LeaveAtDoor, "Front door today"))
        assertTrue(ready(vm)!!.instructionsDiffer)
        vm.payNow()
        assertEquals("Front door today", checkout.lastOrder!!.deliveryInstructions!!.note)
        assertTrue(lastAddresses!!.savedInstructions.isEmpty())
    }

    @Test
    fun `asking to save writes the address after the order accepted the instructions`() = runTest {
        val checkout = FakeCheckout()
        val vm = vm(listOf(addr("a", isDefault = true)), checkout)
        vm.setInstructions(InstructionsDraft(note = "Reception"))
        vm.setSaveInstructions(true)
        vm.payNow()
        assertEquals(listOf("a" to InstructionsDraft(note = "Reception")), lastAddresses!!.savedInstructions)
        assertEquals("Reception", ready(vm)!!.addresses.first().defaultInstructions!!.note)
        assertFalse(ready(vm)!!.saveInstructions)
    }

    /** ⚠ FR-015 — a note is about a place. Typed text does not follow the shopper to another address. */
    @Test
    fun `switching address replaces the draft and resets the save choice`() = runTest {
        val vm = vm(listOf(home(), addr("b")))
        vm.setInstructions(InstructionsDraft(Handover.LeaveAtDoor, "typed for home"))
        vm.setSaveInstructions(true)

        vm.select("b")
        assertEquals(InstructionsDraft(), ready(vm)!!.instructions)
        assertFalse(ready(vm)!!.saveInstructions)

        vm.select("a")
        assertEquals(InstructionsDraft(Handover.LeaveAtDoor, "Side gate"), ready(vm)!!.instructions)
    }

    @Test
    fun `clearing a prefilled default sends nothing - not the saved default`() = runTest {
        val checkout = FakeCheckout()
        val vm = vm(listOf(home()), checkout)
        vm.setInstructions(InstructionsDraft())
        vm.payNow()
        assertNull(checkout.lastOrder!!.deliveryInstructions)
        assertTrue(lastAddresses!!.savedInstructions.isEmpty())
    }
}
