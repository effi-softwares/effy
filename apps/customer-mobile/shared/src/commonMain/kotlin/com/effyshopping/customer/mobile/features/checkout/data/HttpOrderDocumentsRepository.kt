package com.effyshopping.customer.mobile.features.checkout.data

import com.effyshopping.customer.mobile.commerce.contract.BusinessIdentityRequest
import com.effyshopping.customer.mobile.commerce.contract.DeliveryNoteDTO
import com.effyshopping.customer.mobile.commerce.contract.OrderTaxDocumentsDTO
import com.effyshopping.customer.mobile.commerce.contract.TaxDocumentDTOKind
import com.effyshopping.customer.mobile.features.checkout.domain.BusinessIdentityResult
import com.effyshopping.customer.mobile.features.checkout.domain.TaxDocument
import com.effyshopping.customer.mobile.features.checkout.domain.TaxDocumentKind
import com.effyshopping.customer.mobile.features.checkout.domain.TaxDocumentsResult
import com.effyshopping.customer.mobile.commerce.contract.DeliveryNoteLineStatus as WireStatus
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryNote
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryNoteLine
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryNoteLineStatus
import com.effyshopping.customer.mobile.features.checkout.domain.DeliveryNoteResult
import com.effyshopping.customer.mobile.features.checkout.domain.OrderDocumentsRepository
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.get
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import io.ktor.client.statement.readRawBytes
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.CancellationException

/**
 * 096 US7 — `GET commerce/v1/orders/{id}/delivery-note` (JSON) and `?format=pdf` (the bytes).
 *
 * ⚠ 404 covers both "not yours" and "no such order"; the server refuses them identically, so this
 * client cannot tell them apart either. 409 is "not delivered yet".
 */
class HttpOrderDocumentsRepository(private val edge: HttpClient) : OrderDocumentsRepository {

    override suspend fun deliveryNote(orderId: String): DeliveryNoteResult = try {
        val response = edge.get("commerce/v1/orders/$orderId/delivery-note")
        when (response.status) {
            HttpStatusCode.OK -> DeliveryNoteResult.Ready(response.body<DeliveryNoteDTO>().toDomain())
            HttpStatusCode.Conflict -> DeliveryNoteResult.NotYet
            HttpStatusCode.NotFound -> DeliveryNoteResult.Unavailable
            else -> DeliveryNoteResult.Failed
        }
    } catch (e: CancellationException) {
        throw e
    } catch (_: Throwable) {
        DeliveryNoteResult.Failed
    }

    override suspend fun taxDocuments(orderId: String): TaxDocumentsResult = try {
        val response = edge.get("commerce/v1/orders/$orderId/tax-documents")
        when (response.status) {
            HttpStatusCode.OK -> TaxDocumentsResult.Ready(response.body<OrderTaxDocumentsDTO>().toDomain())
            HttpStatusCode.Conflict -> TaxDocumentsResult.Refused(refusalCode(response.bodyAsText()))
            HttpStatusCode.NotFound -> TaxDocumentsResult.Refused("not_found")
            else -> TaxDocumentsResult.Failed
        }
    } catch (e: CancellationException) {
        throw e
    } catch (_: Throwable) {
        TaxDocumentsResult.Failed
    }

    override suspend fun taxDocumentPdf(orderId: String, number: String): ByteArray? = try {
        val response = edge.get("commerce/v1/orders/$orderId/tax-documents?doc=$number&format=pdf")
        if (response.status == HttpStatusCode.OK) response.readRawBytes().takeIf { it.size > 4 } else null
    } catch (e: CancellationException) {
        throw e
    } catch (_: Throwable) {
        null
    }

    override suspend fun setBusinessIdentity(orderId: String, businessName: String?, abn: String?): BusinessIdentityResult = try {
        val response = edge.put("commerce/v1/orders/$orderId/business-identity") {
            contentType(ContentType.Application.Json)
            setBody(BusinessIdentityRequest(abn = abn, businessName = businessName))
        }
        when {
            response.status == HttpStatusCode.NoContent || response.status == HttpStatusCode.OK -> BusinessIdentityResult.SAVED
            response.status == HttpStatusCode.UnprocessableEntity && refusalCode(response.bodyAsText()) == "abn_invalid" -> BusinessIdentityResult.ABN_INVALID
            response.status.value in 400..499 -> BusinessIdentityResult.REFUSED
            else -> BusinessIdentityResult.FAILED
        }
    } catch (e: CancellationException) {
        throw e
    } catch (_: Throwable) {
        BusinessIdentityResult.FAILED
    }

    override suspend fun deliveryNotePdf(orderId: String): ByteArray? = try {
        val response = edge.get("commerce/v1/orders/$orderId/delivery-note?format=pdf")
        if (response.status == HttpStatusCode.OK) response.readRawBytes().takeIf { it.size > 4 } else null
    } catch (e: CancellationException) {
        throw e
    } catch (_: Throwable) {
        null
    }
}

internal val lenientJson = Json { ignoreUnknownKeys = true }

/** The refusal's code: the problem's `type`, last segment (`…/problems/invoices_unavailable`). */
internal fun refusalCode(body: String): String = runCatching {
    lenientJson.parseToJsonElement(body).jsonObject["type"]?.jsonPrimitive?.content?.substringAfterLast('/')?.replace('-', '_')
}.getOrNull() ?: ""

internal fun OrderTaxDocumentsDTO.toDomain(): List<TaxDocument> = listOfNotNull(invoice).plus(adjustments).map {
    TaxDocument(
        kind = if (it.kind == TaxDocumentDTOKind.Adjustment) TaxDocumentKind.ADJUSTMENT else TaxDocumentKind.INVOICE,
        number = it.number,
        issuedAt = it.issuedAt,
    )
}

internal fun DeliveryNoteDTO.toDomain(): DeliveryNote = DeliveryNote(
    orderNumber = orderNumber,
    deliveredAt = deliveredAt,
    lines = lines.map {
        DeliveryNoteLine(
            name = it.name,
            ordered = it.ordered.toInt(),
            supplied = it.supplied.toInt(),
            status = when (it.status) {
                WireStatus.Supplied -> DeliveryNoteLineStatus.SUPPLIED
                WireStatus.Part -> DeliveryNoteLineStatus.PART
                WireStatus.Unavailable -> DeliveryNoteLineStatus.UNAVAILABLE
            },
        )
    },
)
