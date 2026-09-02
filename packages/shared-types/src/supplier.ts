/**
 * 057-shop-console-redesign — who a shop restocks from.
 *
 * ⚠ SHOP-SCOPED, AND NO SHOP IDENTIFIER CROSSES THIS CONTRACT. Every read is already resolved to the
 * caller's own shop server-side (the same rule 020's fulfillment contract holds to), so no DTO here
 * carries a `shopId`. A client that could name a shop is a client that could name someone else's.
 *
 * ⚠ NOTHING HERE EVER REACHES A CUSTOMER SURFACE. Shops are hidden fulfilment nodes; a supplier name
 * would disclose the fulfilment chain behind a single-brand storefront.
 */

/**
 * ⚠ Soft-retirement, not deletion. A purchase order names its supplier forever, so a shop must be
 * able to tidy a supplier they no longer buy from without rewriting history. An archived supplier
 * stays readable on past orders and disappears from the product-assignment picker.
 */
export type SupplierStatus = "active" | "archived"

export interface SupplierDTO {
  id: string
  name: string
  contactEmail: string | null
  contactPhone: string | null
  notes: string | null
  status: SupplierStatus
  createdAt: string
  updatedAt: string
}

export interface CreateSupplierRequest {
  name: string
  contactEmail?: string | null
  contactPhone?: string | null
  notes?: string | null
}

/**
 * ⚠ EVERY FIELD IS OPTIONAL, AND THE WRITE READS THE PRESENCE OF A KEY — not its value.
 *
 * 056 shipped a defect where `COALESCE($n, col)` could not distinguish "leave this alone" from
 * "clear this", so a field once set could never be emptied again. An absent key here means "leave
 * alone"; an explicit `null` means "clear it". The repository must branch on `in`, never on
 * truthiness.
 */
export interface UpdateSupplierRequest {
  name?: string
  contactEmail?: string | null
  contactPhone?: string | null
  notes?: string | null
  status?: SupplierStatus
}
