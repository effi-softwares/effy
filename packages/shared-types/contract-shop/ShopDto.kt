// GENERATED FROM packages/shared-types/src/shop.ts (+ problem.ts) — DO NOT EDIT.
// Regenerate: pnpm --filter @effy/shared-types contract:gen
// The wire contract lives in TypeScript ONCE (Principle II); this file is derived and diff-guarded.
// NOTE: (shop DTOs: email/shop nullable, roles as List<String> narrowed in the app domain).

package com.effyshopping.shop.mobile.contract

import kotlinx.serialization.*
import kotlinx.serialization.json.*
import kotlinx.serialization.descriptors.*
import kotlinx.serialization.encoding.*

@Serializable
data class AdjustStockRequest (
    /**
     * Signed. Never zero — a movement that moves nothing is a record with no fact behind it.
     */
    val delta: Double,

    val note: String? = null,
    val reason: OperatorStockReason
)

@Serializable
enum class OperatorStockReason(val value: String) {
    @SerialName("correction") Correction("correction"),
    @SerialName("damage") Damage("damage"),
    @SerialName("expiry") Expiry("expiry"),
    @SerialName("received") Received("received");
}

/**
 * One call bootstraps the create form: the active types (each with their assigned
 * attributes) and the active category tree (flat, parentId-linked).
 */
@Serializable
data class CatalogSchemaDTO (
    val categories: List<CategoryDTO>,
    val productTypes: List<ProductTypeDTO>
)

/**
 * A node in the platform category taxonomy (flat list; the tree is built client-side via
 * parentId).
 */
@Serializable
data class CategoryDTO (
    val displayOrder: Double,
    val id: String,
    val key: String,
    val name: String,

    @SerialName("parentId")
    val parentID: String? = null,

    val status: SchemaStatus
)

/**
 * Lifecycle for the managed schema entities (product types, attributes, categories).
 */
@Serializable
enum class SchemaStatus(val value: String) {
    @SerialName("active") Active("active"),
    @SerialName("retired") Retired("retired");
}

/**
 * A back-office product classification, with its assigned attributes.
 */
@Serializable
data class ProductTypeDTO (
    val attributes: List<ProductTypeAttributeDTO>,
    val createdAt: String,
    val description: String? = null,
    val id: String,
    val key: String,
    val name: String,
    val status: SchemaStatus,
    val updatedAt: String
)

/**
 * An attribute assigned to a product type (the join, carrying the per-type facts).
 */
@Serializable
data class ProductTypeAttributeDTO (
    val allowedValues: List<AttributeAllowedValueDTO>,

    @SerialName("attributeId")
    val attributeID: String,

    val dataType: AttributeDataType,
    val displayOrder: Double,
    val groupLabel: String? = null,
    val helpText: String? = null,
    val isMandatory: Boolean,
    val key: String,
    val name: String,
    val unit: String? = null,
    val validation: AttributeValidationDTO? = null
)

/**
 * An option for a select-typed attribute.
 */
@Serializable
data class AttributeAllowedValueDTO (
    val displayOrder: Double,
    val id: String,
    val label: String,
    val value: String
)

/**
 * The data type of a back-office-authored attribute — drives the form input + value column.
 */
@Serializable
enum class AttributeDataType(val value: String) {
    @SerialName("boolean") AttributeDataTypeBoolean("boolean"),
    @SerialName("long_text") LongText("long_text"),
    @SerialName("multi_select") MultiSelect("multi_select"),
    @SerialName("number") Number("number"),
    @SerialName("short_text") ShortText("short_text"),
    @SerialName("single_select") SingleSelect("single_select");
}

/**
 * Optional per-attribute validation envelope (jsonb `validation`). All fields optional.
 */
@Serializable
data class AttributeValidationDTO (
    val max: Double? = null,
    val maxLength: Double? = null,
    val min: Double? = null
)

/**
 * POST /shop/v1/products/{id}/status — lifecycle transition.
 */
@Serializable
data class ChangeProductStatusRequest (
    val status: ProductStatus
)

/**
 * Product lifecycle. `draft` → `active` (publish) ↔ `unavailable`; any → `archived` (soft
 * remove).
 */
@Serializable
enum class ProductStatus(val value: String) {
    @SerialName("active") Active("active"),
    @SerialName("archived") Archived("archived"),
    @SerialName("draft") Draft("draft"),
    @SerialName("unavailable") Unavailable("unavailable");
}

/**
 * POST /shop/v1/products/{id}/media — request a presigned direct-to-S3 upload.
 */
@Serializable
data class CreatePresignedUploadRequest (
    val contentType: String,
    val fileSize: Double
)

/**
 * POST /shop/v1/products — create a shop-owned product. `brand` is a first-class column
 * (FR-010a).
 */
@Serializable
data class CreateProductRequest (
    val attributes: List<AttributeValueInputDTO>? = null,
    val brand: String? = null,
    val compareAtAmount: String? = null,
    val gtin: String? = null,
    val longDescription: String? = null,
    val media: List<Media>? = null,
    val name: String,
    val priceAmount: String,

    @SerialName("primaryCategoryId")
    val primaryCategoryID: String,

    val primaryMediaStorageKey: String? = null,

    @SerialName("productTypeId")
    val productTypeID: String,

    @SerialName("sectionIds")
    val sectionIDS: List<String>? = null,

    val shortDescription: String,
    val sku: String? = null,

    /**
     * Shipping weight in grams (032, FR-036a). Omit and the platform records its stated default
     * as an ASSUMPTION. ⚠ There is deliberately no `weightIsAssumed` field: the flag is derived
     * from the act of supplying a weight and is never accepted from a client, or "measured"
     * would mean only "the client said so".
     */
    val weightGrams: Double? = null
)

/**
 * A value supplied for one attribute on create/edit (only the field matching the data type
 * is set).
 */
@Serializable
data class AttributeValueInputDTO (
    @SerialName("attributeId")
    val attributeID: String,

    val valueBoolean: Boolean? = null,
    val valueNumber: Double? = null,
    val valueOptions: List<String>? = null,
    val valueText: String? = null
)

@Serializable
data class Media (
    val altText: String? = null,
    val displayOrder: Double? = null,
    val isPrimary: Boolean? = null,
    val storageKey: String
)

@Serializable
data class CreateShopSectionRequest (
    val displayOrder: Double? = null,
    val name: String
)

/**
 * What the customer bought and when this shop must be ready — READ-ONLY (FR-009a).
 *
 * Owned by 021. While only one service level exists, `readyBy` is a constant offset from
 * the order's placement, so ordering by promise IS ordering by arrival (FR-001b, SC-020).
 *
 * Says NOTHING about who delivers. There is no carrier, driver, or provider field here, by
 * design.
 */
@Serializable
data class DeliveryPromiseDTO (
    /**
     * ISO-8601. The time by which THIS shop must be ready.
     */
    val readyBy: String,

    /**
     * e.g. "standard". A service level the customer bought — never a fulfillment mechanism.
     */
    val serviceLevel: String
)

/**
 * The delivery context a shop needs to prepare and label the order (FR-009). Snapshotted
 * onto the order at placement by 019, so it never changes retroactively.
 */
@Serializable
data class FulfillmentDeliveryDTO (
    val city: String,
    val country: String,
    val line1: String,
    val line2: String? = null,
    val phone: String? = null,
    val postalCode: String,
    val recipientName: String,
    val region: String? = null
)

/**
 * The pick screen (GET /shop/v1/fulfillments/{id}).
 */
@Serializable
data class FulfillmentDetailDTO (
    val delivery: FulfillmentDeliveryDTO,
    val id: String,

    /**
     * THIS shop's lines only. Never another shop's, and never an order-level total.
     */
    val items: List<FulfillmentItemDTO>,

    val orderNumber: String,
    val placedAt: String,
    val promise: DeliveryPromiseDTO,
    val stateChangedAt: String,
    val status: FulfillmentStatus
)

/**
 * One line to pick. Quantities are absolute, never deltas.
 *
 * `orderedQuantity - gatheredQuantity` on a terminal portion is the SHORTFALL — what the
 * customer paid for and will not receive. It carries no financial effect in this slice
 * (FR-010b) and exists to be resolved by a later refunds slice, which is why it must stay
 * queryable rather than implied.
 */
@Serializable
data class FulfillmentItemDTO (
    val gatheredQuantity: Double,

    /**
     * Presigned; may be absent.
     */
    @SerialName("imageUrl")
    val imageURL: String? = null,

    val name: String,
    val orderedQuantity: Double,

    @SerialName("orderItemId")
    val orderItemID: String,

    val sku: String? = null,
    val unavailableQuantity: Double
)

/**
 * The fulfillment state machine (FR-011).
 *
 * `pending` is written by the 019 fan-out. `received` was reserved by 019 and unused until
 * now — it means a human acknowledged the order, which is what distinguishes untouched work
 * from work in progress. `collected` (picked up) and `delivered` are reachable ONLY via the
 * dev-only driver stubs (FR-030) and are terminal + immutable (FR-011f) — a placeholder for
 * the real driver slice.
 */
@Serializable
enum class FulfillmentStatus(val value: String) {
    @SerialName("collected") Collected("collected"),
    @SerialName("delivered") Delivered("delivered"),
    @SerialName("pending") Pending("pending"),
    @SerialName("picking") Picking("picking"),
    @SerialName("ready_for_pickup") ReadyForPickup("ready_for_pickup"),
    @SerialName("received") Received("received");
}

@Serializable
data class FulfillmentQueueDTO (
    val items: List<FulfillmentSummaryDTO>
)

/**
 * A row in the shop's order queue (GET /shop/v1/fulfillments).
 */
@Serializable
data class FulfillmentSummaryDTO (
    /**
     * Computed against the promise — drives in-place escalation, never reordering (FR-001a,
     * SC-018).
     */
    val atRisk: Boolean,

    val gatheredCount: Double,

    /**
     * shop_fulfillment.id — the portion, not the order.
     */
    val id: String,

    /**
     * Items THIS shop must gather. Never the order's total item count.
     */
    val itemCount: Double,

    val orderNumber: String,

    /**
     * ISO-8601, when the customer placed the order.
     */
    val placedAt: String,

    val promise: DeliveryPromiseDTO,

    /**
     * ISO-8601, when the portion last changed state — drives time-in-state (FR-011c).
     */
    val stateChangedAt: String,

    val status: FulfillmentStatus,
    val unavailableCount: Double
)

/**
 * Which slice of the queue to read (FR-016).
 */
@Serializable
enum class FulfillmentQueueState(val value: String) {
    @SerialName("active") Active("active"),
    @SerialName("completed") Completed("completed");
}

/**
 * Record picking progress (PATCH /shop/v1/fulfillments/{id}/items/{orderItemId}).
 *
 * Absolute values, not deltas — idempotent under retry, which matters on a shop tablet with
 * a flaky connection. Lowering `unavailableQuantity` is how an item is un-flagged when it
 * turns up (FR-010d). `gathered + unavailable <= ordered` is enforced server-side and by a
 * DB CHECK.
 */
@Serializable
data class ItemProgressRequest (
    val gatheredQuantity: Double? = null,
    val unavailableQuantity: Double? = null
)

/**
 * Shop lifecycle status (009-shop-management). Only `active` shops serve their operators;
 * `suspended` (temporary hold) and `disabled` (deactivated, retained for audit) both refuse.
 */
@Serializable
enum class ShopLifecycleStatus(val value: String) {
    @SerialName("active") Active("active"),
    @SerialName("disabled") Disabled("disabled"),
    @SerialName("suspended") Suspended("suspended");
}

@Serializable
data class LowStockRowDTO (
    val effectiveThreshold: Double? = null,
    val name: String,
    val onHand: Double,

    @SerialName("productId")
    val productID: String,

    /**
     * "out" sorts above "low" — an empty shelf is not the same problem as a thin one.
     */
    val severity: Severity,

    val sku: String? = null
)

/**
 * "out" sorts above "low" — an empty shelf is not the same problem as a thin one.
 */
@Serializable
enum class Severity(val value: String) {
    @SerialName("low") Low("low"),
    @SerialName("out") Out("out");
}

/**
 * Wire DTO for GET /shop/v1/manager-ping (contracts/shop-manager-ping.contract.md).
 */
@Serializable
data class ShopManagerPingDTO (
    val audience: Audience,
    val message: String,
    val scope: Scope,
    val subject: String
)

@Serializable
enum class Audience(val value: String) {
    @SerialName("shop") Shop("shop");
}

@Serializable
enum class Scope(val value: String) {
    @SerialName("shop_manager") ShopManager("shop_manager");
}

/**
 * ⚠ DEV-ONLY SCAFFOLD (POST /shop/v1/fulfillments/{id}/pickup) — FR-030…FR-034.
 *
 * Stands in for a driver collecting the order so the lifecycle is exercisable before a
 * driver surface exists. The endpoint is STRUCTURALLY ABSENT outside local development
 * (FR-031): it accepts a caller-supplied identity, so a reachable deployed instance would
 * be an order-state forgery primitive. Scheduled for deletion when the driver slice ships
 * (FR-034).
 */
@Serializable
data class PickupStubRequest (
    /**
     * Stored MARKED AS A PLACEHOLDER so stub collections never resemble a real dispatch
     * (FR-033).
     */
    val driverRef: String
)

@Serializable
data class CreatePresignedUploadResponse (
    val storageKey: String,

    @SerialName("uploadUrl")
    val uploadURL: String
)

@Serializable
data class ProblemJSON (
    val detail: String? = null,
    val fields: List<ProblemFieldIssue>? = null,
    val instance: String? = null,
    val status: Double,
    val title: String,
    val type: String
)

/**
 * RFC 9457 problem+json — the platform's single machine-readable error shape (mirrors
 * docs/api/error-envelope.md from 004). Typed ONCE here (Principle II); every web surface
 * consumes it, never re-declares it.
 */
@Serializable
data class ProblemFieldIssue (
    /**
     * The offending field path — or, for a whole-request refusal, a STABLE MACHINE-READABLE
     * CODE.
     *
     * ⚠ 032 uses the second form for delivery-pricing refusals (`cap_below_floor`,
     * `bands_required`, …). "Please check the fields and try again" tells an operator nothing
     * about which of five rules they broke, and every one of those rules fails SILENTLY in
     * production if it is not understood — a cap below the floor makes every delivery cost the
     * cap, forever.
     */
    val field: String,

    val message: String
)

/**
 * Full product detail. `updatedAt` is the optimistic-concurrency token (FR-023a);
 * `missingMandatoryAttributes` is the non-blocking schema-drift notice (FR-020a).
 */
@Serializable
data class ProductDetailDTO (
    val attributes: List<ProductAttributeValueDTO>,
    val brand: String? = null,
    val categoryName: String,
    val compareAtAmount: String? = null,
    val createdAt: String,
    val currency: String,
    val gtin: String? = null,
    val id: String,
    val longDescription: String? = null,
    val media: List<ProductMediaDTO>,
    val missingMandatoryAttributes: List<String>,
    val name: String,
    val priceAmount: String,

    @SerialName("primaryCategoryId")
    val primaryCategoryID: String,

    @SerialName("productTypeId")
    val productTypeID: String,

    val sections: List<String>,

    @SerialName("shopId")
    val shopID: String,

    val shortDescription: String,
    val sku: String? = null,
    val status: ProductStatus,
    val typeName: String,
    val updatedAt: String,

    /**
     * Shipping weight in grams (032). ⚠ A LOGISTICS fact, deliberately distinct from any
     * `net_weight` attribute a shopper reads on the product page — they agree by backfill today
     * and may legitimately diverge, because packaging weighs something. Delivery is priced from
     * this.
     */
    val weightGrams: Double,

    /**
     * ⚠ TRUE means nobody has recorded a real weight and the platform default is in use.
     * Without this flag "500 g" would mean both "we weighed it" and "nobody has said", and no
     * operator could tell which products still need attention (FR-037a).
     */
    val weightIsAssumed: Boolean
)

/**
 * A typed attribute value on a product (EAV, one value shape per data type).
 */
@Serializable
data class ProductAttributeValueDTO (
    @SerialName("attributeId")
    val attributeID: String,

    val dataType: AttributeDataType,
    val key: String,
    val name: String,
    val unit: String? = null,
    val valueBoolean: Boolean? = null,
    val valueNumber: Double? = null,
    val valueOptions: List<String>? = null,
    val valueText: String? = null
)

/**
 * A media object on a product (list/detail carry short-lived presigned GET urls).
 */
@Serializable
data class ProductMediaDTO (
    val altText: String? = null,
    val displayOrder: Double,
    val id: String,
    val isPrimary: Boolean,
    val storageKey: String,
    val url: String
)

/**
 * Paged product list envelope. Structurally a `PagedDTO<ProductListItemDTO>` but declared
 * concretely (not a generic alias) so the Kotlin contract generator can name it.
 */
@Serializable
data class ProductListDTO (
    val items: List<ProductListItemDTO>,
    val page: Double,
    val pageSize: Double,
    val total: Double
)

/**
 * A thin row in the shop catalog table (backend-paginated).
 */
@Serializable
data class ProductListItemDTO (
    val brand: String? = null,
    val categoryName: String,
    val currency: String,
    val id: String,
    val name: String,
    val priceAmount: String,

    @SerialName("primaryImageUrl")
    val primaryImageURL: String? = null,

    val sku: String? = null,
    val status: ProductStatus,
    val typeName: String,
    val updatedAt: String
)

/**
 * A product's stock, as one operator screen needs it.
 */
@Serializable
data class ProductStockDTO (
    /**
     * Product threshold, else shop default, else null — null meaning nothing counts as low.
     */
    val effectiveThreshold: Double? = null,

    /**
     * tracked && effectiveThreshold !== null && onHand > 0 && onHand <= effectiveThreshold. ⚠
     * Mutually exclusive with `outOfStock`: an empty shelf and a thin one are different
     * problems needing different actions, and collapsing them tells the operator nothing to act
     * on.
     */
    val low: Boolean,

    /**
     * null exactly when untracked — the database makes "tracked with no count" unrepresentable.
     */
    val onHand: Double? = null,

    /**
     * tracked && onHand === 0.
     */
    val outOfStock: Boolean,

    @SerialName("productId")
    val productID: String,

    /**
     * This product's own threshold, or null to fall back to the shop default.
     */
    val threshold: Double? = null,

    /**
     * false = unlimited, and identical to how the product behaved before 054 existed (FR-002).
     */
    val tracked: Boolean
)

@Serializable
data class ProductStockDetailDTO (
    /**
     * Newest first (FR-009).
     */
    val movements: List<StockMovementDTO>,

    val stock: ProductStockDTO
)

@Serializable
data class StockMovementDTO (
    val actorKind: StockActorKind,

    /**
     * A display name where the platform holds one. ⚠ Never an email address (no PII in an audit
     * read).
     */
    val actorLabel: String? = null,

    val createdAt: String,
    val id: String,
    val note: String? = null,

    /**
     * The order that caused it, by its customer-facing reference. null for a human's own change.
     */
    val orderNumber: String? = null,

    val quantityAfter: Double,
    val quantityBefore: Double,
    val quantityDelta: Double,
    val reason: StockMovementReason
)

/**
 * WHO acted, kept separate from WHY (`reason`).
 *
 * ⚠ The separation is what makes FR-027 possible: a shop reading its own history must be
 * able to see plainly that back-office made a change, without back-office having to pick a
 * reason that says so. `system` is the paid-order path — the only actor with no person
 * behind it.
 */
@Serializable
enum class StockActorKind(val value: String) {
    @SerialName("back_office") BackOffice("back_office"),
    @SerialName("shop") Shop("shop"),
    @SerialName("system") StockActorKindSystem("system");
}

/**
 * Why a count moved. A CLOSED set, mirroring the CHECK on `public.stock_movement.reason` —
 * the database and this union are one contract, and a value in either that the other lacks
 * is a defect.
 *
 * ⚠ There is deliberately NO `cancellation` or `refund` member. Neither capability exists
 * on the platform (order-flow gap register, Tier 2), and a value nothing can produce
 * implies one that does. The set grows when the slice that needs it lands.
 */
@Serializable
enum class StockMovementReason(val value: String) {
    @SerialName("correction") Correction("correction"),
    @SerialName("damage") Damage("damage"),
    @SerialName("expiry") Expiry("expiry"),
    @SerialName("order_paid") OrderPaid("order_paid"),
    @SerialName("pick_shortfall") PickShortfall("pick_shortfall"),
    @SerialName("received") Received("received"),
    @SerialName("tracking_disabled") TrackingDisabled("tracking_disabled"),
    @SerialName("tracking_enabled") TrackingEnabled("tracking_enabled");
}

/**
 * POST /shop/v1/products/{id}/media/register — record an uploaded object.
 */
@Serializable
data class RegisterMediaRequest (
    val altText: String? = null,
    val displayOrder: Double? = null,
    val isPrimary: Boolean? = null,
    val storageKey: String
)

/**
 * Advance or reverse a portion (POST /shop/v1/fulfillments/{id}/status).
 *
 * Only `picking` and `ready_for_pickup` are requestable: `pending` is the fan-out's,
 * `received` is implicit on first open (FR-011a), and `collected` belongs to the pickup
 * stub alone (FR-030). `ready_for_pickup -> picking` is the ONE permitted reversal
 * (FR-011d).
 */
@Serializable
enum class RequestableTransition(val value: String) {
    @SerialName("picking") Picking("picking"),
    @SerialName("ready_for_pickup") ReadyForPickup("ready_for_pickup");
}

/**
 * Shop RBAC roles. Prefixed so `manager` stays unambiguously the back-office role in logs.
 */
@Serializable
enum class ShopRole(val value: String) {
    @SerialName("shop_manager") ShopManager("shop_manager"),
    @SerialName("shop_staff") ShopStaff("shop_staff");
}

/**
 * PATCH /shop/v1/products/{id}/sections — set a product's section membership.
 */
@Serializable
data class SetProductSectionsRequest (
    @SerialName("sectionIds")
    val sectionIDS: List<String>
)

@Serializable
data class SetShopStockSettingsRequest (
    /**
     * null clears the shop default.
     */
    val defaultThreshold: Double? = null
)

@Serializable
data class SetStockRequest (
    val note: String? = null,
    val onHand: Double,
    val reason: OperatorStockReason
)

@Serializable
data class SetThresholdRequest (
    /**
     * null clears this product's own threshold, falling back to the shop default.
     */
    val threshold: Double? = null
)

@Serializable
data class SetTrackingRequest (
    /**
     * REQUIRED when enabling (FR-003), ignored when disabling.
     */
    val onHand: Double? = null,

    val tracked: Boolean
)

/**
 * A shop-local section (grouping; Uber-Eats-style menu section).
 */
@Serializable
data class ShopSectionDTO (
    val displayOrder: Double,
    val id: String,
    val name: String
)

@Serializable
data class ShopStockSettingsDTO (
    /**
     * null = no default, so nothing counts as low; zero stock is still reported as out
     * (FR-005a).
     */
    val defaultThreshold: Double? = null
)

/**
 * Wire DTO for the assigned shop, embedded in GET /shop/v1/me.
 */
@Serializable
data class ShopSummaryDTO (
    val code: String,
    val id: String,
    val name: String,
    val status: ShopLifecycleStatus
)

/**
 * Wire DTO for GET /shop/v1/me (contracts/shop-me.contract.md). `email` may be null until
 * provisioning supplies it; `shop` is null for an unassigned operator — an expected state,
 * not an error.
 */
@Serializable
data class ShopStaffRecordDTO (
    val email: String? = null,
    val lastSeenAt: String,
    val roles: List<String>,
    val shop: ShopSummaryDTO? = null,
    val status: ShopStaffStatus,
    val subject: String
)

/**
 * Platform-owned lifecycle. A disabled operator is denied despite an otherwise-valid token.
 */
@Serializable
enum class ShopStaffStatus(val value: String) {
    @SerialName("active") Active("active"),
    @SerialName("disabled") Disabled("disabled");
}

@Serializable
data class TransitionRequest (
    val to: RequestableTransition
)

/**
 * PATCH /shop/v1/products/{id}/media/{mediaId} — reorder / set primary / alt text.
 */
@Serializable
data class UpdateMediaRequest (
    val altText: String? = null,
    val displayOrder: Double? = null,
    val isPrimary: Boolean? = null
)

/**
 * PATCH /shop/v1/products/{id} — focused edit. All content fields optional (a subset is
 * patched); `expectedUpdatedAt` is REQUIRED (optimistic concurrency — a stale value → 409,
 * FR-023a).
 */
@Serializable
data class UpdateProductRequest (
    val attributes: List<AttributeValueInputDTO>? = null,
    val brand: String? = null,
    val compareAtAmount: String? = null,
    val expectedUpdatedAt: String,
    val gtin: String? = null,
    val longDescription: String? = null,
    val name: String? = null,
    val priceAmount: String? = null,

    @SerialName("primaryCategoryId")
    val primaryCategoryID: String? = null,

    @SerialName("productTypeId")
    val productTypeID: String? = null,

    val shortDescription: String? = null,
    val sku: String? = null,

    /**
     * Recording a weight here marks it MEASURED (032, FR-036a). Omit to leave it as it stands.
     */
    val weightGrams: Double? = null
)

@Serializable
data class UpdateShopSectionRequest (
    val displayOrder: Double? = null,
    val name: String? = null
)
