package com.effyshopping.customer.mobile.features.addresses.domain

import com.effyshopping.customer.mobile.core.delivery.Coverage
import com.effyshopping.customer.mobile.features.deliveryinstructions.domain.DeliveryInstructions
import com.effyshopping.customer.mobile.features.deliveryinstructions.domain.InstructionsDraft

/**
 * The address book domain (022). A first-class account capability to view / add / edit / set-default /
 * delete the customer's saved delivery addresses — over the SAME model checkout already uses (019,
 * `/customer/v1/addresses`). Every call is customer-scoped from the session
 * token (the client never sends an identity, FR-020).
 *
 * Distinct from the checkout feature's slim `Address`/`AddressRepository` (that one exists only to pick
 * an address while paying); the book carries the full editable shape (label, phone, region, country).
 */

/** A saved delivery address as the book shows and edits it. */
data class SavedAddress(
    val id: String,
    val label: String?,
    val recipientName: String,
    val phone: String?,
    val line1: String,
    val line2: String?,
    val city: String,
    val region: String?,
    val postalCode: String,
    val country: String,
    val isDefault: Boolean,
    /** 066 — the instructions this address prefills at checkout; null when none are saved. */
    val defaultInstructions: DeliveryInstructions? = null,
    /**
     * 076 — who delivers to this address today, as the server just worked it out. Never cached past
     * the read it came with; null only from a server older than 076.
     */
    val coverage: Coverage? = null,
)

/**
 * The customer's input for an add or an edit — the fields the form collects. `label` already holds the
 * chip's resolved value ("Home"/"Work"/free text, or null); mapping chips → this string is presentation.
 * Country defaults to AU (the existing model), so the form need not ask for it.
 */
data class AddressDraft(
    val recipientName: String,
    val line1: String,
    val city: String,
    val postalCode: String,
    val label: String? = null,
    val phone: String? = null,
    val line2: String? = null,
    val region: String? = null,
    /**
     * 066 — the address's default delivery instructions, as the form left them.
     *
     * ⚠ THREE STATES. `null` = this draft does not concern them (leave whatever is saved alone);
     * an EMPTY draft = the shopper cleared them; anything else = save exactly this.
     */
    val defaultInstructions: InstructionsDraft? = null,
)

/**
 * The address CRUD (022). Reuses the 019 endpoints in place. `create` never forces a default — the
 * backend auto-defaults only the customer's FIRST address (FR-010); `setDefault` is the deliberate
 * per-row action. `delete` throws [com.effyshopping.customer.mobile.core.error.AppException] with
 * [com.effyshopping.customer.mobile.core.error.AppError.DefaultDeleteBlocked] on the server's 409 when
 * deleting the default while other addresses remain (FR-016a).
 */
interface AddressRepository {
    suspend fun list(): List<SavedAddress>
    suspend fun create(draft: AddressDraft): SavedAddress
    suspend fun update(id: String, draft: AddressDraft): SavedAddress
    suspend fun setDefault(id: String): SavedAddress

    /** 066 — set (or, with an empty draft, clear) an address's saved delivery instructions only. */
    suspend fun saveInstructions(id: String, instructions: InstructionsDraft): SavedAddress
    suspend fun delete(id: String)
}

class ListAddresses(private val repo: AddressRepository) {
    suspend operator fun invoke(): List<SavedAddress> = repo.list()
}

class AddAddress(private val repo: AddressRepository) {
    suspend operator fun invoke(draft: AddressDraft): SavedAddress = repo.create(draft)
}

class UpdateAddress(private val repo: AddressRepository) {
    suspend operator fun invoke(id: String, draft: AddressDraft): SavedAddress = repo.update(id, draft)
}

/** 066 — checkout's "save to this address": writes the default instructions and nothing else. */
class SaveAddressInstructions(private val repo: AddressRepository) {
    suspend operator fun invoke(id: String, instructions: InstructionsDraft): SavedAddress =
        repo.saveInstructions(id, instructions)
}
class SetDefault(private val repo: AddressRepository) {
    suspend operator fun invoke(id: String): SavedAddress = repo.setDefault(id)
}

class DeleteAddress(private val repo: AddressRepository) {
    suspend operator fun invoke(id: String) = repo.delete(id)
}
