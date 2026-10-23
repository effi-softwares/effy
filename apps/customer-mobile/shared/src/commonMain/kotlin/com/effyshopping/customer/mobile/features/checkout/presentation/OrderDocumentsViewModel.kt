package com.effyshopping.customer.mobile.features.checkout.presentation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryNote
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryNoteResult
import com.effyshopping.customer.mobile.features.checkout.domain.BusinessIdentityResult
import com.effyshopping.customer.mobile.features.checkout.domain.OrderDocumentsRepository
import com.effyshopping.customer.mobile.features.checkout.domain.TaxDocument
import com.effyshopping.customer.mobile.features.checkout.domain.TaxDocumentsResult
import com.effyshopping.customer.mobile.features.checkout.domain.taxRefusalWords
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * The order's Documents section: the delivery note, and its PDF to share or save.
 *
 * Every outcome is said out loud: a note not ready yet says when it will be, and a download that fails
 * says so rather than doing nothing.
 */
class OrderDocumentsViewModel(
    private val orderId: String,
    private val repo: OrderDocumentsRepository,
) : ViewModel() {

    sealed interface State {
        data object Loading : State
        data class Ready(val note: DeliveryNote, val downloading: Boolean = false, val message: String? = null) : State
        data object NotYet : State
        /** Not loaded — said once, in the section; the rest of the order still shows. */
        data object Unavailable : State
    }

    private val _state = MutableStateFlow<State>(State.Loading)
    val state: StateFlow<State> = _state.asStateFlow()

    /** The tax invoice, on request: nothing is issued until the customer asks. */
    sealed interface Tax {
        data object Idle : Tax
        data object Loading : Tax
        data class Ready(val documents: List<TaxDocument>, val sharing: String? = null, val message: String? = null) : Tax
        data class Refused(val text: String) : Tax
    }

    private val _tax = MutableStateFlow<Tax>(Tax.Idle)
    val tax: StateFlow<Tax> = _tax.asStateFlow()

    /** Ask for the tax invoice — this issues it on the server, once. */
    fun getTaxInvoice() {
        if (_tax.value is Tax.Loading || _tax.value is Tax.Ready) return
        _tax.value = Tax.Loading
        viewModelScope.launch {
            _tax.value = when (val r = repo.taxDocuments(orderId)) {
                is TaxDocumentsResult.Ready -> Tax.Ready(r.documents)
                is TaxDocumentsResult.Refused -> Tax.Refused(taxRefusalWords(r.code))
                TaxDocumentsResult.Failed -> Tax.Refused(taxRefusalWords(""))
            }
        }
    }

    fun shareTaxDocument(number: String, share: (ByteArray, String) -> Unit) {
        val ready = _tax.value as? Tax.Ready ?: return
        if (ready.sharing != null) return
        _tax.value = ready.copy(sharing = number, message = null)
        viewModelScope.launch {
            val bytes = repo.taxDocumentPdf(orderId, number)
            if (bytes != null) share(bytes, "Effy $number.pdf")
            _tax.update { t ->
                (t as? Tax.Ready)?.copy(sharing = null, message = if (bytes == null) "We couldn't get the PDF just now. Please try again." else null) ?: t
            }
        }
    }

    /** The customer's business name and ABN, before the invoice is issued. */
    suspend fun saveBusinessIdentity(businessName: String, abn: String): String? =
        when (repo.setBusinessIdentity(orderId, businessName.trim().ifEmpty { null }, abn.filterNot(Char::isWhitespace).ifEmpty { null })) {
            BusinessIdentityResult.SAVED -> null
            BusinessIdentityResult.ABN_INVALID -> "That ABN isn't valid. Check the 11 digits."
            BusinessIdentityResult.REFUSED -> "We couldn't save that. The invoice may already have been issued."
            BusinessIdentityResult.FAILED -> "We couldn't save that just now. Please try again."
        }

    fun load() {
        viewModelScope.launch {
            _state.value = when (val r = repo.deliveryNote(orderId)) {
                is DeliveryNoteResult.Ready -> State.Ready(r.note)
                DeliveryNoteResult.NotYet -> State.NotYet
                DeliveryNoteResult.Unavailable, DeliveryNoteResult.Failed -> State.Unavailable
            }
        }
    }

    /** Fetch the PDF and hand it to [share] (the platform's share sheet). */
    fun download(share: (ByteArray, String) -> Unit) {
        val ready = _state.value as? State.Ready ?: return
        if (ready.downloading) return
        _state.value = ready.copy(downloading = true, message = null)
        viewModelScope.launch {
            val bytes = repo.deliveryNotePdf(orderId)
            if (bytes != null) share(bytes, "Effy delivery note ${ready.note.orderNumber}.pdf")
            _state.update { s ->
                (s as? State.Ready)?.copy(downloading = false, message = if (bytes == null) "We couldn't get the PDF just now. Please try again." else null) ?: s
            }
        }
    }
}
