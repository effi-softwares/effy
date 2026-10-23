// The customer's order documents, on the order page and in the app, as data and as a PDF. Never a price
// on the delivery note, never a shop, never a count of shops or bags.

import type { WireInt } from "./cart"

/** The approved customer-facing mailbox, the one contact any document carries. */
export const DOCUMENT_CONTACT = "hello@effyshopping.com" as const

export type DeliveryNoteLineStatus = "supplied" | "part" | "unavailable"

/** One line of the delivery note: a product, merged across the order's packages. */
export interface DeliveryNoteLineDTO {
  name: string
  ordered: WireInt
  supplied: WireInt
  status: DeliveryNoteLineStatus
}

/** `GET /commerce/v1/orders/{id}/delivery-note` — what was supplied, line by line. */
export interface DeliveryNoteDTO {
  orderNumber: string
  placedAt: string
  /** When the last of the order arrived. */
  deliveredAt: string
  /** Always `DOCUMENT_CONTACT`. */
  contact: string
  /** Merged by product across packages, so nothing reveals how many suppliers filled it. */
  lines: DeliveryNoteLineDTO[]
}

export const DELIVERY_NOTE_LINE_WORDS: Record<DeliveryNoteLineStatus, string> = {
  supplied: "Supplied",
  part: "Part supplied",
  unavailable: "Unavailable",
}

/** A product's GST status: taxable, or GST-free (basic food). Null = not yet classified. */
export type GstStatus = "taxable" | "gst_free"

export const GST_STATUS_WORDS: Record<GstStatus, string> = {
  taxable: "Taxable",
  gst_free: "GST-free",
}

/** `GET /catalog/v1/gst/missing`: live products nobody has classified yet. */
export interface GstMissingDTO {
  total: number
  items: Array<{ productId: string; name: string; shopName: string; categoryName: string }>
}

/** `POST /catalog/v1/gst/bulk`: one status on many products. */
export interface GstBulkRequest {
  productIds: string[]
  gstStatus: GstStatus
}

/** A tax invoice or adjustment note exactly as issued: the frozen snapshot the PDF renders. Money is a decimal string; it never changes. */
export interface TaxDocumentDTO {
  kind: "invoice" | "adjustment"
  number: string
  issuedAt: string
  issuer: { legalName: string; abn: string }
  /** The buyer's identity, printed at $1,000 or more; null below it. */
  buyer: { name: string; businessName?: string; abn?: string } | null
  orderNumber: string
  lines: Array<{ name: string; quantity: WireInt; amount: string; taxable: boolean }>
  fees: Array<{ label: string; amount: string; taxable: boolean }>
  totals: { total: string; gst: string; taxableTotal: string; gstFreeTotal: string }
  payments: Array<{ label: string; amount: string }>
  /** An adjustment's invoice number. */
  refersTo?: string
}

/** `GET /commerce/v1/orders/{id}/tax-documents`. */
export interface OrderTaxDocumentsDTO {
  invoice: TaxDocumentDTO | null
  adjustments: TaxDocumentDTO[]
}

/** `GET|PUT /orders/v1/admin/tax-settings` (admin only). */
export interface TaxSettingsDTO {
  legalName: string | null
  abn: string | null
  feeTreatment: GstStatus | null
  invoicesEnabled: boolean
  /** Live products with no GST status: invoices cannot be turned on while this is above zero. */
  unclassifiedProducts: number
}

/** `PUT /commerce/v1/orders/{id}/business-identity`: the buyer's own business, for its invoice. */
export interface BusinessIdentityRequest {
  businessName?: string | null
  abn?: string | null
}
