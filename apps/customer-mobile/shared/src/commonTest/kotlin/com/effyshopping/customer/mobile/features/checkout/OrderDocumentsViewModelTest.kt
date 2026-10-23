package com.effyshopping.customer.mobile.features.checkout

import com.effyshopping.customer.mobile.features.checkout.domain.BusinessIdentityResult
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryNote
import com.effyshopping.customer.mobile.features.checkout.domain.TaxDocument
import com.effyshopping.customer.mobile.features.checkout.domain.TaxDocumentKind
import com.effyshopping.customer.mobile.features.checkout.domain.TaxDocumentsResult
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryNoteLine
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryNoteLineStatus
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryNoteResult
import com.effyshopping.customer.mobile.features.checkout.domain.OrderDocumentsRepository
import com.effyshopping.customer.mobile.features.checkout.domain.words
import com.effyshopping.customer.mobile.features.checkout.presentation.OrderDocumentsViewModel
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
import kotlin.test.assertNull

/** The order's Documents section. */
@OptIn(ExperimentalCoroutinesApi::class)
class OrderDocumentsViewModelTest {
    @BeforeTest fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())
    @AfterTest fun tearDown() = Dispatchers.resetMain()

    private val note = DeliveryNote(
        "EFY-ESDPKF", "2026-10-21T05:00:00Z",
        listOf(
            DeliveryNoteLine("Milk", 3, 3, DeliveryNoteLineStatus.SUPPLIED),
            DeliveryNoteLine("Sourdough", 3, 1, DeliveryNoteLineStatus.PART),
        ),
    )

    private class Repo(
        var result: DeliveryNoteResult,
        var pdf: ByteArray? = byteArrayOf(0x25, 0x50, 0x44, 0x46, 0x2D),
        var tax: TaxDocumentsResult = TaxDocumentsResult.Refused("invoices_unavailable"),
        var identity: BusinessIdentityResult = BusinessIdentityResult.SAVED,
    ) : OrderDocumentsRepository {
        var pdfCalls = 0
        var taxCalls = 0
        var identitySent: Pair<String?, String?>? = null
        override suspend fun deliveryNote(orderId: String) = result
        override suspend fun deliveryNotePdf(orderId: String): ByteArray? { pdfCalls++; return pdf }
        override suspend fun taxDocuments(orderId: String): TaxDocumentsResult { taxCalls++; return tax }
        override suspend fun taxDocumentPdf(orderId: String, number: String): ByteArray? = pdf
        override suspend fun setBusinessIdentity(orderId: String, businessName: String?, abn: String?): BusinessIdentityResult {
            identitySent = businessName to abn
            return identity
        }
    }

    @Test fun shows_the_note_and_shares_its_pdf_by_order_number() = runTest {
        val repo = Repo(DeliveryNoteResult.Ready(note))
        val vm = OrderDocumentsViewModel("o1", repo)
        vm.load()
        assertEquals(OrderDocumentsViewModel.State.Ready(note), vm.state.value)
        var shared: Pair<Int, String>? = null
        vm.download { bytes, name -> shared = bytes.size to name }
        assertEquals(5 to "Effy delivery note EFY-ESDPKF.pdf", shared)
        assertEquals(OrderDocumentsViewModel.State.Ready(note), vm.state.value)
    }

    @Test fun a_failed_download_says_so_and_shares_nothing() = runTest {
        val repo = Repo(DeliveryNoteResult.Ready(note), pdf = null)
        val vm = OrderDocumentsViewModel("o1", repo)
        vm.load()
        var shared = false
        vm.download { _, _ -> shared = true }
        assertEquals(false, shared)
        assertEquals("We couldn't get the PDF just now. Please try again.", (vm.state.value as OrderDocumentsViewModel.State.Ready).message)
    }

    @Test fun before_delivery_and_when_unavailable() = runTest {
        val notYet = OrderDocumentsViewModel("o1", Repo(DeliveryNoteResult.NotYet)).also { it.load() }
        assertEquals(OrderDocumentsViewModel.State.NotYet, notYet.state.value)
        val failed = OrderDocumentsViewModel("o1", Repo(DeliveryNoteResult.Failed)).also { it.load() }
        assertEquals(OrderDocumentsViewModel.State.Unavailable, failed.state.value)
        // No download is offered before the note is ready.
        val repo = Repo(DeliveryNoteResult.NotYet)
        OrderDocumentsViewModel("o1", repo).also { it.load(); it.download { _, _ -> } }
        assertEquals(0, repo.pdfCalls)
    }

    @Test fun only_lines_not_supplied_in_full_carry_words() {
        assertNull(DeliveryNoteLineStatus.SUPPLIED.words())
        assertEquals("Part supplied", DeliveryNoteLineStatus.PART.words())
        assertEquals("Unavailable", DeliveryNoteLineStatus.UNAVAILABLE.words())
    }

    /** Nothing is issued until the customer asks; refusals are the customer's words. */
    @Test fun the_tax_invoice_is_on_request_and_refusals_are_worded() = runTest {
        val repo = Repo(DeliveryNoteResult.NotYet)
        val vm = OrderDocumentsViewModel("o1", repo)
        vm.load()
        assertEquals(0, repo.taxCalls)
        assertEquals(OrderDocumentsViewModel.Tax.Idle, vm.tax.value)
        vm.getTaxInvoice()
        assertEquals(OrderDocumentsViewModel.Tax.Refused("Tax invoices aren't available yet. Please try again later."), vm.tax.value)

        val docs = listOf(TaxDocument(TaxDocumentKind.INVOICE, "EFY-INV-000001", "2026-10-22T01:00:00Z"))
        val ready = OrderDocumentsViewModel("o1", Repo(DeliveryNoteResult.NotYet, tax = TaxDocumentsResult.Ready(docs)))
        ready.getTaxInvoice()
        assertEquals(OrderDocumentsViewModel.Tax.Ready(docs), ready.tax.value)
        var shared: String? = null
        ready.shareTaxDocument("EFY-INV-000001") { _, name -> shared = name }
        assertEquals("Effy EFY-INV-000001.pdf", shared)
    }

    @Test fun business_details_are_trimmed_and_an_invalid_abn_is_said() = runTest {
        val repo = Repo(DeliveryNoteResult.NotYet)
        val vm = OrderDocumentsViewModel("o1", repo)
        assertNull(vm.saveBusinessIdentity("  Lovelace Analytics ", "51 824 753 556"))
        assertEquals("Lovelace Analytics" to "51824753556", repo.identitySent)
        repo.identity = BusinessIdentityResult.ABN_INVALID
        assertEquals("That ABN isn't valid. Check the 11 digits.", vm.saveBusinessIdentity("", "1"))
    }
}
