import Image from "next/image"

import { sellerIdentity } from "@effy/legal-content"
import type { OrderDTO, OrderItemDTO, PaymentMethodSummaryDTO } from "@effy/shared-types"

import { StatusPill } from "@/components/receipt/StatusPill"
import { formatMoney } from "@/lib/money"

/**
 * THE RECEIPT DOCUMENT — the itemised record of one paid order (052 US1).
 *
 * ⚠ NOT A CARD LAYOUT, and Principle V requires that to be argued rather than assumed. The banned
 * pattern is a dashboard aesthetic: tiled content boxes and metric cards at the top of a page. There
 * are none here. The border is the EDGE OF THE PAPER and the shaded block is a TOTALS BLOCK — the
 * conventional anatomy of an invoice, and what eBay and Amazon order detail render (Principle V's own
 * reference platforms). The interior is what the principle prefers: a line-item table, a totals table,
 * and labelled detail rows. Recorded in plan.md § Constitution Check.
 *
 * ⚠ It discloses NO fulfilment structure — no shop, count, distance or ring (FR-009).
 *
 * Pure and synchronous, so it is unit-testable: the pages hosting it are async Server Components,
 * which Vitest cannot render. (The same reasoning as `OrderAddresses`.)
 */
export function ReceiptDocument({ order }: { order: OrderDTO }) {
  return (
    <section className="overflow-hidden rounded-xl border">
      <Masthead order={order} />

      <div className="px-6 pt-1">
        <LineItemHeader />
        {order.items.map((item, i) => (
          <LineItem
            key={item.productId}
            item={item}
            currency={order.currency}
            last={i === order.items.length - 1}
          />
        ))}
      </div>

      <Totals order={order} />
    </section>
  )
}

function Masthead({ order }: { order: OrderDTO }) {
  const paid = order.paymentStatus === "succeeded" || order.status === "paid"
  return (
    <div className="flex items-start justify-between gap-6 border-b p-6">
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2.5">
          <h2 className="text-[17px] font-semibold tracking-[-0.01em]">Receipt</h2>
          {paid ? <StatusPill tone="paid">Paid</StatusPill> : null}
        </div>
        <div className="flex flex-col gap-0.5 text-[13px] text-muted-foreground">
          <p>
            Order <span className="font-medium tabular-nums text-foreground">{order.orderNumber}</span>
          </p>
          {order.placedAt ? <p>{formatPlacedAt(order.placedAt)}</p> : null}
        </div>
      </div>

      <SellerIdentityBlock />
    </div>
  )
}

/**
 * The seller identity block (FR-030).
 *
 * ⚠ EVERY OPTIONAL FIELD IS OMITTED WHEN UNSUPPLIED — never blank, never the bracketed placeholder
 * (FR-031). `sellerIdentity()` owns that decision so three surfaces cannot each get it subtly wrong;
 * an unsupplied ABN arrives here as `null` and renders as nothing at all.
 *
 * ⚠ The ABN's ABSENCE is a first-class fact, not an oversight: it is one of the two reasons this
 * document is a receipt rather than a tax invoice (research R13).
 */
function SellerIdentityBlock() {
  const seller = sellerIdentity()
  return (
    <div className="flex shrink-0 flex-col gap-0.5 text-right">
      <p className="text-[13px] font-semibold">{seller.tradingName}</p>
      {seller.legalEntityName ? (
        <p className="text-[12.5px] text-muted-foreground">{seller.legalEntityName}</p>
      ) : null}
      {seller.abn ? <p className="text-[12.5px] text-muted-foreground">ABN {seller.abn}</p> : null}
      {seller.registeredAddress ? (
        <p className="text-[12.5px] text-muted-foreground">{seller.registeredAddress}</p>
      ) : null}
      <p className="text-[12.5px] text-muted-foreground">{seller.supportEmail}</p>
    </div>
  )
}

function LineItemHeader() {
  return (
    <div className="grid grid-cols-[56px_minmax(0,1fr)_56px_92px] items-center gap-4 border-b py-3.5">
      <span />
      <span className="text-[11px] font-medium uppercase tracking-[0.07em] text-muted-foreground">Item</span>
      <span className="text-center text-[11px] font-medium uppercase tracking-[0.07em] text-muted-foreground">
        Qty
      </span>
      <span className="text-right text-[11px] font-medium uppercase tracking-[0.07em] text-muted-foreground">
        Amount
      </span>
    </div>
  )
}

function LineItem({
  item,
  currency,
  last,
}: {
  item: OrderItemDTO
  currency: string
  last: boolean
}) {
  return (
    <div
      className={`grid grid-cols-[56px_minmax(0,1fr)_56px_92px] items-center gap-4 py-4 ${last ? "" : "border-b border-muted"}`}
    >
      {/*
        ⚠ DECORATION ONLY. A missing image renders an empty tile and the line stays whole — nothing
        here is gated on it (FR-003). Every OTHER field is the order's own immutable snapshot, which
        is why a renamed or re-priced product still shows what was actually bought (FR-011).
      */}
      <div className="relative size-14 shrink-0 overflow-hidden rounded-md border bg-muted">
        {item.imageUrl ? (
          <Image src={item.imageUrl} alt="" fill sizes="56px" className="object-cover" unoptimized />
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[14.5px] font-medium leading-tight">{item.productName}</span>
        {/* ⚠ The unit price. It has been on the wire since 019 and NO surface rendered it — which is
            what makes a line checkable rather than merely stated (FR-003). */}
        <span className="text-[12.5px] tabular-nums text-muted-foreground">
          {formatMoney(item.unitPriceAmount, currency)} each
        </span>
      </div>

      <span className="text-center text-sm tabular-nums">{item.quantity}</span>
      <span className="text-right text-[14.5px] font-medium tabular-nums">
        {formatMoney(item.lineSubtotalAmount, currency)}
      </span>
    </div>
  )
}

/**
 * ⚠ THE RESERVED TAX-INVOICE BLOCK (052 FR-033/FR-034) — deliberately NOT RENDERED.
 *
 * When this platform can issue a compliant Australian tax invoice, it slots in HERE, between the
 * totals and the addresses, and the document's structure does not otherwise change:
 *
 *     [LEGAL ENTITY NAME]              ABN 00 000 000 000
 *     Taxable supplies                            $19.00
 *     GST-free supplies                            $9.80
 *     GST included                                 $1.73
 *
 * TWO prerequisites stand in the way. NEITHER is engineering work in this slice, and both are
 * recorded in specs/052-order-confirmation-invoice/research.md § R13:
 *
 *   1. ⚠ The ABN is UNSUPPLIED. `packages/legal-content/src/identifiers.json` holds the fail-loud
 *      placeholder `[ABN]`; the constitution forbids inferring a real-world identifier. Operator input.
 *
 *   2. ⚠ Per-item GST treatment is UNMODELLED, and for a grocer this is the harder one. Basic food is
 *      GST-free in Australia, so an Effy basket is a MIXED SUPPLY: "total price includes GST" is FALSE
 *      for most orders, and the ATO's "extent to which each sale is taxable" requirement cannot be met
 *      from data that does not exist. It needs a taxable/GST-free flag on `public.product`.
 *
 * ⚠ Supplying the ABN alone is NOT enough — `canIssueTaxInvoice()` stays false until (2) lands too.
 */

/**
 * ⚠ EVERY LINE MUST ADD UP (FR-004, SC-002): items − discount + delivery = total = what was charged.
 *
 * A component that is genuinely zero is OMITTED rather than rendered as a dash — a dash reads as
 * "unknown", and on a financial record those are different claims.
 */
function Totals({ order }: { order: OrderDTO }) {
  const discount = order.discountAmount && order.discountAmount !== "0.00" ? order.discountAmount : null
  const delivery =
    order.deliveryFeeAmount && order.deliveryFeeAmount !== "0.00" ? order.deliveryFeeAmount : null

  return (
    <div className="border-t bg-muted/40 px-6 pb-5 pt-4">
      <dl className="flex flex-col gap-2.5">
        <Row label="Items subtotal" value={formatMoney(order.itemSubtotalAmount, order.currency)} />
        {discount ? (
          <Row
            label={
              <>
                Discount{" "}
                {order.promoCode ? <span className="font-medium text-foreground">{order.promoCode}</span> : null}
              </>
            }
            value={`−${formatMoney(discount, order.currency)}`}
          />
        ) : null}
        {delivery ? <Row label="Delivery" value={formatMoney(delivery, order.currency)} /> : null}
      </dl>

      <div className="mt-3.5 flex items-baseline justify-between gap-4 border-t pt-3.5">
        <dt className="text-base font-semibold">Total paid</dt>
        <dd className="text-2xl font-semibold tracking-[-0.01em] tabular-nums">
          {formatMoney(order.grandTotalAmount, order.currency)}
        </dd>
      </div>

      {order.paymentMethod ? <PaidWith method={order.paymentMethod} /> : null}
    </div>
  )
}

function Row({ label, value }: { label: React.ReactNode; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm tabular-nums">{value}</dd>
    </div>
  )
}

/**
 * How it was paid (FR-006). ⚠ Rendered ONLY when captured — a pre-052 order, or one whose
 * post-commit capture failed, simply has no such line. Absent, never blank.
 */
function PaidWith({ method }: { method: PaymentMethodSummaryDTO }) {
  return (
    <p className="mt-3.5 border-t pt-3.5 text-[13.5px] text-muted-foreground">
      Paid with <span className="font-medium capitalize text-foreground">{brandLabel(method)}</span>
      {method.last4 ? (
        <>
          {" "}
          ending <span className="font-medium tabular-nums text-foreground">{method.last4}</span>
        </>
      ) : null}
    </p>
  )
}

function brandLabel(method: PaymentMethodSummaryDTO): string {
  if (method.brand) return method.brand.replace(/_/g, " ")
  return method.type === "pay_over_time" ? "pay over time" : method.type
}

/**
 * ⚠ Fixed to `Australia/Melbourne`, not the server's zone. A receipt states when an order was placed,
 * and the platform trades in one timezone (047 judges its cutoff in the same one). Rendering this on a
 * server in another zone would print a different date than the shopper experienced.
 */
function formatPlacedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Australia/Melbourne",
  }).format(d)
}
