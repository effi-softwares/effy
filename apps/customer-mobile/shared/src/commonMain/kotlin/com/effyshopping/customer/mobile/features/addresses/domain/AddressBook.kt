package com.effyshopping.customer.mobile.features.addresses.domain

import com.effyshopping.customer.mobile.core.delivery.Coverage
import com.effyshopping.customer.mobile.features.deliveryinstructions.domain.DeliveryInstructions
import com.effyshopping.customer.mobile.features.deliveryinstructions.domain.InstructionsDraft

/**
 * The address book: view, add, edit, set default and delete saved delivery addresses (`/customer/v1/addresses`,
 * customer-scoped by the session). Distinct from checkout's slim `Address`/`AddressRepository`, which only
 * picks one; this carries the full editable shape (label, phone, region, country).
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
    /** The instructions this address prefills at checkout; null when none are saved. */
    val defaultInstructions: DeliveryInstructions? = null,
    /**
     * Who delivers to this address today, as the server just worked it out. Never cached past
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
     * The address's default delivery instructions, as the form left them.
     *
     * Three states. `null` = this draft does not concern them (leave whatever is saved alone);
     * an empty draft = the shopper cleared them; anything else = save exactly this.
     */
    val defaultInstructions: InstructionsDraft? = null,
)

/**
 * The address CRUD. `create` never forces a default (the backend defaults only the first address);
 * `setDefault` is the per-row action. `delete` throws [com.effyshopping.customer.mobile.core.error.AppException]
 * with [com.effyshopping.customer.mobile.core.error.AppError.DefaultDeleteBlocked] on the server's 409 for the
 * default while others remain.
 */
interface AddressRepository {
    suspend fun list(): List<SavedAddress>
    suspend fun create(draft: AddressDraft): SavedAddress
    suspend fun update(id: String, draft: AddressDraft): SavedAddress
    suspend fun setDefault(id: String): SavedAddress

    /** Set (or, with an empty draft, clear) an address's saved delivery instructions only. */
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

/** Checkout's "save to this address": writes the default instructions and nothing else. */
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
