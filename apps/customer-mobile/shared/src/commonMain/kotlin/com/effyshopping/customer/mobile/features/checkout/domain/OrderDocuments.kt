package com.effyshopping.customer.mobile.features.checkout.domain

/**
 * 096 US7 — the order's delivery note: what the customer was supplied, line by line, once the order has
 * arrived. Digital only — there is no paper note in the bag.
 *
 * ⚠ No prices and nothing about how the order was filled: the server merges the lines across packages.
 */
data class DeliveryNote(val orderNumber: String, val deliveredAt: String, val lines: List<DeliveryNoteLine>)

data class DeliveryNoteLine(val name: String, val ordered: Int, val supplied: Int, val status: DeliveryNoteLineStatus)

enum class DeliveryNoteLineStatus { SUPPLIED, PART, UNAVAILABLE }

/** The customer's words for a line that was not supplied in full; nothing for one that was. */
fun DeliveryNoteLineStatus.words(): String? = when (this) {
    DeliveryNoteLineStatus.SUPPLIED -> null
    DeliveryNoteLineStatus.PART -> "Part supplied"
    DeliveryNoteLineStatus.UNAVAILABLE -> "Unavailable"
}

sealed interface DeliveryNoteResult {
    data class Ready(val note: DeliveryNote) : DeliveryNoteResult
    /** The order has not arrived yet. */
    data object NotYet : DeliveryNoteResult
    /** Not this customer's, or no such order — the server says the same for both. */
    data object Unavailable : DeliveryNoteResult
    data object Failed : DeliveryNoteResult
}

/** 096 US8 — one issued tax document: the invoice or an adjustment note, by its number. */
data class TaxDocument(val kind: TaxDocumentKind, val number: String, val issuedAt: String)

enum class TaxDocumentKind { INVOICE, ADJUSTMENT }

fun TaxDocumentKind.words(): String = when (this) {
    TaxDocumentKind.INVOICE -> "Tax invoice"
    TaxDocumentKind.ADJUSTMENT -> "Adjustment note"
}

sealed interface TaxDocumentsResult {
    /** The invoice first, then its adjustment notes. */
    data class Ready(val documents: List<TaxDocument>) : TaxDocumentsResult
    /** Refused, with the server's code (`invoices_unavailable`, `buyer_identity_required`, …). */
    data class Refused(val code: String) : TaxDocumentsResult
    data object Failed : TaxDocumentsResult
}

enum class BusinessIdentityResult { SAVED, ABN_INVALID, REFUSED, FAILED }

/** Each refusal in the customer's words — never the server's prose. */
fun taxRefusalWords(code: String): String = when (code) {
    "invoices_unavailable" -> "Tax invoices aren't available yet. Please try again later."
    "invoice_not_available_for_order" -> "A tax invoice isn't available for this order."
    "buyer_identity_required" -> "Orders of \$1,000 or more need your name on the invoice. Add it in Account, then try again."
    else -> "We couldn't get your tax invoice just now. Please try again."
}

interface OrderDocumentsRepository {
    suspend fun deliveryNote(orderId: String): DeliveryNoteResult

    /** The note as a PDF, or null when it could not be fetched. */
    suspend fun deliveryNotePdf(orderId: String): ByteArray?

    /** ⚠ ISSUES the invoice on the first call (it is on request, never on viewing the order). */
    suspend fun taxDocuments(orderId: String): TaxDocumentsResult

    suspend fun taxDocumentPdf(orderId: String, number: String): ByteArray?

    /** The customer's own business name and ABN, for an invoice not yet issued (FR-085). */
    suspend fun setBusinessIdentity(orderId: String, businessName: String?, abn: String?): BusinessIdentityResult
}
