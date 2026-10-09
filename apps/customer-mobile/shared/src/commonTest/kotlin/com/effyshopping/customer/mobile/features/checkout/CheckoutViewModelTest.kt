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
import kotlin.test.assertNotNull
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
        // The quote the fake returns. ⚠ A COURIER quote by default, on purpose: it has one fee ($6.00)
        // and NOTHING TO CHOOSE, so the tests that are not about delivery can go straight to paying.
        private val quote: DeliveryQuote = DeliveryQuote(
            serviced = true,
            courier = com.effyshopping.customer.mobile.features.checkout.domain.CourierDelivery(
                estimate = "2–4 business days",
                fee = com.effyshopping.customer.mobile.features.checkout.domain.DeliveryFee(listOf(com.effyshopping.customer.mobile.features.checkout.domain.DeliveryFeeLine(com.effyshopping.customer.mobile.features.checkout.domain.DeliveryFeeLineKind.Delivery, "6.00")), "6.00"),
                noWindowLeft = false,
            ),
        ),
        /** 077 — when set, the first intent is refused as "the delivery fee changed", with this quote. */
        private var feeChangedTo: DeliveryQuote? = null,
        /** 078 — when set, the first intent is refused over the delivery choice. */
        private var refusal: com.effyshopping.customer.mobile.features.checkout.domain.DeliveryChoiceRefused? = null,
        /** 079 — a quote per ADDRESS: who delivers is decided from where the order is going. */
        private val quoteFor: Map<String, DeliveryQuote> = emptyMap(),
    ) : CheckoutRepository {
        var lastOrder: PlaceOrder? = null
        var intents = 0
        override suspend fun createIntent(order: PlaceOrder): CheckoutIntent {
            lastOrder = order
            intents += 1
            feeChangedTo?.let { feeChangedTo = null; throw com.effyshopping.customer.mobile.features.checkout.domain.DeliveryFeeChanged(it) }
            refusal?.let { refusal = null; throw it }
            return CheckoutIntent(
                orderId = "o1", orderNumber = "EFY-1", clientSecret = "cs",
                publishableKey = "pk", grandTotalAmount = "10.00", currency = "AUD",
            )
        }
        override suspend fun confirm(orderId: String) = true
        val quoted = mutableListOf<String>()
        override suspend fun quote(addressId: String): DeliveryQuote {
            quoted += addressId
            return quoteFor[addressId] ?: quote
        }
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
        assertEquals("6.00", s.deliveryFee?.totalAmount)
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

    // ── 077: one delivery fee for the order ────────────────────────────────────────────────────

    private fun fee(vararg lines: Pair<com.effyshopping.customer.mobile.features.checkout.domain.DeliveryFeeLineKind, String>, total: String) =
        com.effyshopping.customer.mobile.features.checkout.domain.DeliveryFee(
            lines.map { com.effyshopping.customer.mobile.features.checkout.domain.DeliveryFeeLine(it.first, it.second) }, total,
        )

    @Test
    fun `077 - a delivery fee that changed is shown, nothing is paid, and paying again sends the new total`() = runTest {
        // The same windows, each $1.50 dearer: a new fee plan went live between the quote and the pay button.
        val was = windowsQuote()
        val dearer = was.copy(effyWindows = was.effyWindows!!.copy(days = was.effyWindows!!.days.map { d ->
            d.copy(windows = d.windows.map { w -> w.copy(fee = fee(com.effyshopping.customer.mobile.features.checkout.domain.DeliveryFeeLineKind.Delivery to "7.50", total = "7.50")) })
        }))
        val checkout = FakeCheckout(quote = was, feeChangedTo = dearer)
        val handoff = PaymentHandoff()
        val vm = vm(listOf(addr("a", isDefault = true)), checkout = checkout, handoff = handoff)
        vm.setWindow("afternoon", "2026-10-09")
        assertEquals("6.00", ready(vm)?.deliveryFee?.totalAmount)

        vm.payNow()
        val s = ready(vm)!!
        assertEquals(DeliveryFeeWords.FEE_CHANGED, s.error)
        // The window is still the one chosen; its fee is the new one.
        assertEquals("7.50", s.deliveryFee?.totalAmount)
        assertFalse(s.handedOffToPayment)

        vm.payNow()
        assertEquals(2, checkout.intents)
        assertEquals("7.50", checkout.lastOrder?.shownDeliveryAmount)
        assertTrue(ready(vm)!!.handedOffToPayment)
    }

    // ── 078: one window for the order ──────────────────────────────────────────────────────────

    private fun window(slot: String, date: String, surcharge: String, total: String) =
        com.effyshopping.customer.mobile.features.checkout.domain.EffyWindow(
            slotId = slot, date = date, startAt = "${date}T16:00:00+11:00", endAt = "${date}T18:00:00+11:00", cutoffAt = "${date}T14:00:00+11:00",
            surchargeAmount = surcharge, fee = fee(com.effyshopping.customer.mobile.features.checkout.domain.DeliveryFeeLineKind.Delivery to total, total = total),
        )

    /** Today has one window ($5 dearer); two later days have the same window at the plain fee. */
    private fun windowsQuote(
        drop: Set<String> = emptySet(),
        unavailable: com.effyshopping.customer.mobile.features.checkout.domain.WindowsUnavailable? = null,
    ): DeliveryQuote {
        fun day(date: String, today: Boolean) = com.effyshopping.customer.mobile.features.checkout.domain.EffyDay(
            date = date, today = today,
            windows = listOf(window("afternoon", date, if (today) "5.00" else "0.00", if (today) "11.00" else "6.00")).filter { date !in drop },
            closedReason = if (date in drop) com.effyshopping.customer.mobile.features.checkout.domain.EffyDayClosed.Full else null,
        )
        return DeliveryQuote(
            serviced = true,
            effyWindows = com.effyshopping.customer.mobile.features.checkout.domain.EffyWindows(
                days = listOf(day("2026-10-08", true), day("2026-10-09", false), day("2026-10-10", false)), unavailable = unavailable,
            ),
        )
    }

    @Test
    fun `078 - no window is chosen for the shopper, and paying without one is refused before any round trip`() = runTest {
        val checkout = FakeCheckout(quote = windowsQuote())
        val vm = vm(listOf(addr("a", isDefault = true)), checkout = checkout)
        assertNotNull(ready(vm)?.effyWindows)
        assertNull(ready(vm)?.window)
        assertEquals(false, ready(vm)?.deliveryChosen)
        assertNull(ready(vm)?.deliveryFee)

        vm.payNow()
        assertEquals("Choose a delivery time to continue.", ready(vm)?.error)
        assertEquals(0, checkout.intents)
    }

    @Test
    fun `078 - a later-day window is sent as ONE window with the total shown`() = runTest {
        val checkout = FakeCheckout(quote = windowsQuote())
        val vm = vm(listOf(addr("a", isDefault = true)), checkout = checkout)
        vm.setWindow("afternoon", "2026-10-10")
        assertEquals("6.00", ready(vm)?.deliveryFee?.totalAmount)

        vm.payNow()
        val sent = checkout.lastOrder!!
        assertEquals(com.effyshopping.customer.mobile.features.checkout.domain.ChosenWindow("afternoon", "2026-10-10"), sent.deliveryWindow)
        assertEquals("6.00", sent.shownDeliveryAmount)
    }

    @Test
    fun `078 - the same window today costs more, and that is the total shown and sent`() = runTest {
        val checkout = FakeCheckout(quote = windowsQuote())
        val vm = vm(listOf(addr("a", isDefault = true)), checkout = checkout)
        vm.setWindow("afternoon", "2026-10-08")
        assertEquals("11.00", ready(vm)?.deliveryFee?.totalAmount)
        vm.payNow()
        assertEquals("11.00", checkout.lastOrder?.shownDeliveryAmount)
        assertEquals("2026-10-08", checkout.lastOrder?.deliveryWindow?.date)
    }

    @Test
    fun `078 - a window the quote does not offer on that day cannot be chosen`() = runTest {
        val vm = vm(listOf(addr("a", isDefault = true)), checkout = FakeCheckout(quote = windowsQuote(drop = setOf("2026-10-09"))))
        vm.setWindow("afternoon", "2026-10-09") // that day is full
        vm.setWindow("evening", "2026-10-10")   // no such window
        vm.setWindow("afternoon", "2026-10-20") // no such day
        assertNull(ready(vm)?.window)
    }

    @Test
    fun `078 - a window that has gone is not replaced - the shopper is told and nothing is chosen`() = runTest {
        val left = windowsQuote(drop = setOf("2026-10-09"))
        val checkout = FakeCheckout(
            quote = windowsQuote(),
            refusal = com.effyshopping.customer.mobile.features.checkout.domain.DeliveryChoiceRefused(
                com.effyshopping.customer.mobile.features.checkout.domain.DeliveryChoiceRefusal.SlotUnavailable, left,
            ),
        )
        val vm = vm(listOf(addr("a", isDefault = true)), checkout = checkout)
        vm.setWindow("afternoon", "2026-10-09")
        vm.payNow()

        val s = ready(vm)!!
        assertEquals("That delivery time is no longer available. Please choose another.", s.error)
        assertNull(s.window)
        assertEquals(false, s.paying)
        assertEquals(false, s.handedOffToPayment)
        assertEquals(left.effyWindows, s.effyWindows)
    }

    @Test
    fun `078 - the choice survives a refusal that is not about the window`() = runTest {
        val checkout = FakeCheckout(quote = windowsQuote(), feeChangedTo = windowsQuote())
        val vm = vm(listOf(addr("a", isDefault = true)), checkout = checkout)
        vm.setWindow("afternoon", "2026-10-10")
        vm.payNow()
        assertEquals(com.effyshopping.customer.mobile.features.checkout.domain.ChosenWindow("afternoon", "2026-10-10"), ready(vm)?.window)
        vm.payNow()
        assertEquals(2, checkout.intents)
        assertEquals("2026-10-10", checkout.lastOrder?.deliveryWindow?.date)
    }

    @Test
    fun `078 - with no window on any day there is nothing to choose and pay says the one sentence`() = runTest {
        val none = windowsQuote(
            drop = setOf("2026-10-08", "2026-10-09", "2026-10-10"),
            unavailable = com.effyshopping.customer.mobile.features.checkout.domain.WindowsUnavailable.NoWindows,
        )
        val checkout = FakeCheckout(quote = none)
        val vm = vm(listOf(addr("a", isDefault = true)), checkout = checkout)
        assertEquals(false, ready(vm)?.deliveryChosen)
        vm.payNow()
        assertEquals(com.effyshopping.customer.mobile.features.checkout.presentation.DeliveryWindowWords.NO_WINDOWS, ready(vm)?.error)
        assertEquals(0, checkout.intents)
    }

    @Test
    fun `078 - changing the address drops the window`() = runTest {
        val vm = vm(listOf(addr("a", isDefault = true), addr("b")), checkout = FakeCheckout(quote = windowsQuote()))
        vm.setWindow("afternoon", "2026-10-10")
        assertNotNull(ready(vm)?.window)
        vm.select("b")
        assertNull(ready(vm)?.window)
        assertEquals(false, ready(vm)?.deliveryChosen)
    }

    // ── 079: Delivered by Effy, or by a courier ─────────────────────────────────────────────────

    private fun courierQuote(noWindowLeft: Boolean = false) = DeliveryQuote(
        serviced = true,
        courier = com.effyshopping.customer.mobile.features.checkout.domain.CourierDelivery(
            estimate = "2–4 business days",
            fee = fee(com.effyshopping.customer.mobile.features.checkout.domain.DeliveryFeeLineKind.Delivery to "9.00", total = "9.00"),
            noWindowLeft = noWindowLeft,
        ),
    )
    private val effyType = com.effyshopping.customer.mobile.features.checkout.domain.DeliveryType.EFFY
    private val courierType = com.effyshopping.customer.mobile.features.checkout.domain.DeliveryType.COURIER

    @Test
    fun `079 - a courier order has nothing to choose - its fee is shown and pay is not waiting`() = runTest {
        val vm = vm(listOf(addr("far", isDefault = true)), checkout = FakeCheckout(quote = courierQuote()))
        val s = ready(vm)!!
        assertEquals(courierType, s.quote?.deliveryType)
        assertNotNull(s.courier)
        assertNull(s.effyWindows)
        assertEquals(true, s.deliveryChosen)
        assertEquals("9.00", s.deliveryFee?.totalAmount)
        assertNull(s.window)
    }

    @Test
    fun `079 - a courier order sends the type and the total shown - and no window`() = runTest {
        val checkout = FakeCheckout(quote = courierQuote())
        val vm = vm(listOf(addr("far", isDefault = true)), checkout = checkout)
        vm.payNow()
        val sent = checkout.lastOrder!!
        assertEquals(courierType, sent.deliveryType)
        assertEquals("9.00", sent.shownDeliveryAmount)
        assertNull(sent.deliveryWindow)
        assertEquals(true, ready(vm)?.handedOffToPayment)
    }

    @Test
    fun `079 - an Effy order says so on the intent`() = runTest {
        val effy = FakeCheckout(quote = windowsQuote())
        val vm = vm(listOf(addr("a", isDefault = true)), checkout = effy)
        assertEquals(effyType, ready(vm)?.quote?.deliveryType)
        vm.setWindow("afternoon", "2026-10-10")
        vm.payNow()
        assertEquals(effyType, effy.lastOrder?.deliveryType)
    }

    /**
     * ⚠ 083 — A SERVICED QUOTE WITH NEITHER WINDOWS NOR A COURIER CANNOT BE PAID FOR. It is a server
     * fault (a serviced address always answers one or the other); the app must not turn it into an
     * order with no window and no delivery charge.
     */
    @Test
    fun `083 - a serviced quote that offers nothing cannot be paid for`() = runTest {
        val broken = FakeCheckout(quote = DeliveryQuote(serviced = true))
        val vm = vm(listOf(addr("a", isDefault = true)), checkout = broken)
        assertNull(ready(vm)?.quote?.deliveryType)
        assertEquals(false, ready(vm)?.deliveryChosen)
        assertNull(ready(vm)?.deliveryFee)
        vm.payNow()
        assertEquals(0, broken.intents)
        assertEquals("Choose a delivery time to continue.", ready(vm)?.error)
    }

    @Test
    fun `079 - changing the address re-decides everything - the window is gone and the fee follows the address`() = runTest {
        val checkout = FakeCheckout(quoteFor = mapOf("home" to windowsQuote(), "far" to courierQuote()))
        val vm = vm(listOf(addr("home", isDefault = true), addr("far")), checkout = checkout)
        vm.setWindow("afternoon", "2026-10-10")
        assertEquals("6.00", ready(vm)?.deliveryFee?.totalAmount)

        vm.select("far")
        val far = ready(vm)!!
        assertNull(far.window)
        assertNotNull(far.courier)
        assertEquals("9.00", far.deliveryFee?.totalAmount)
        vm.payNow()
        // ⚠ Nothing of the first address went with it: not its window, not its $6.00.
        assertEquals("far", checkout.lastOrder?.addressId)
        assertEquals(courierType, checkout.lastOrder?.deliveryType)
        assertEquals("9.00", checkout.lastOrder?.shownDeliveryAmount)
        assertNull(checkout.lastOrder?.deliveryWindow)
    }

    @Test
    fun `079 - back at the Effy address nothing is selected and pay waits for a choice`() = runTest {
        val checkout = FakeCheckout(quoteFor = mapOf("home" to windowsQuote(), "far" to courierQuote()))
        val vm = vm(listOf(addr("home", isDefault = true), addr("far")), checkout = checkout)
        vm.setWindow("afternoon", "2026-10-10")
        vm.select("far")
        vm.select("home")
        val s = ready(vm)!!
        assertEquals(listOf("home", "far", "home"), checkout.quoted)
        assertNull(s.courier)
        assertNull(s.window)
        assertEquals(false, s.deliveryChosen)
        assertNull(s.deliveryFee)
    }

    @Test
    fun `079 - two addresses Effy both delivers to, offering the same window - the choice does not follow the shopper`() = runTest {
        // The case "keep it while it is offered" would get wrong: the window IS on offer at the new address.
        val vm = vm(listOf(addr("home", isDefault = true), addr("work")), checkout = FakeCheckout(quote = windowsQuote()))
        vm.setWindow("afternoon", "2026-10-10")
        vm.select("work")
        assertNull(ready(vm)?.window)
        assertEquals(false, ready(vm)?.deliveryChosen)
    }

    @Test
    fun `079 - who delivers changed under the shopper - nothing is paid, they are told, and the new section is shown`() = runTest {
        val nowCourier = courierQuote(noWindowLeft = true)
        val checkout = FakeCheckout(
            quote = windowsQuote(),
            refusal = com.effyshopping.customer.mobile.features.checkout.domain.DeliveryChoiceRefused(
                com.effyshopping.customer.mobile.features.checkout.domain.DeliveryChoiceRefusal.DeliveryTypeChanged, nowCourier,
            ),
        )
        val vm = vm(listOf(addr("a", isDefault = true)), checkout = checkout)
        vm.setWindow("afternoon", "2026-10-10")
        vm.payNow()

        val s = ready(vm)!!
        assertEquals(com.effyshopping.customer.mobile.features.checkout.presentation.DeliveryTypeWords.TYPE_CHANGED, s.error)
        assertEquals(false, s.handedOffToPayment)
        assertEquals(false, s.paying)
        assertNull(s.window)
        assertEquals(true, s.courier?.noWindowLeft)
        // Pressing pay again buys what is NOW on the screen.
        vm.payNow()
        assertEquals(2, checkout.intents)
        assertEquals(courierType, checkout.lastOrder?.deliveryType)
        assertNull(checkout.lastOrder?.deliveryWindow)
        assertEquals("9.00", checkout.lastOrder?.shownDeliveryAmount)
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
