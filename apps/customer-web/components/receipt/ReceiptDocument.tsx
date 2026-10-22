import { Package } from "lucide-react"

import { sellerIdentity } from "@effy/legal-content"
import { DELIVERY_FEE_LINE_LABEL, type OrderDTO, type OrderItemDTO, type PaymentMethodSummaryDTO } from "@effy/shared-types"

import { CatalogImage } from "@/components/storefront/CatalogImage"
import { BuyLineAgain, PrintReceipt } from "@/components/receipt/ReceiptActions"
import { Badge } from "@/components/ui/badge"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"

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
export function ReceiptDocument({
  order,
  unavailable = [],
  buyAgain = false,
  children,
}: {
  order: OrderDTO
  /** Names of lines that were out of stock and are not coming. They stay on the record, marked. */
  unavailable?: readonly string[]
  /** Offer "Buy again" on each line (the order page; not the confirmation a moment after buying). */
  buyAgain?: boolean
  /** The receipt's foot — where it was sent, and to whom it was billed. */
  children?: React.ReactNode
}) {
  const missing = new Set(unavailable)
  return (
    <section aria-labelledby="receipt-title" className="rounded-lg border bg-card shadow-xs">
      <Masthead order={order} />
      <div className="px-6 pb-6">
        <table className="w-full border-collapse text-sm tabular-nums">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th scope="col" className="h-10 px-2 text-left font-medium">Item</th>
              <th scope="col" className="h-10 px-2 text-right font-medium">Qty</th>
              <th scope="col" className="h-10 px-2 text-right font-medium">Amount</th>
              {buyAgain && (
                <th scope="col" className="h-10 px-2 max-md:hidden print:hidden">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <LineItem
                key={item.productId}
                item={item}
                currency={order.currency}
                unavailable={missing.has(item.productName)}
                buyAgain={buyAgain}
              />
            ))}
          </tbody>
        </table>
        <Totals order={order} />
      </div>
      {children && <div className="border-t p-6">{children}</div>}
    </section>
  )
}

/**
 * Who sold it, to which order, and when — the three things that make this a record.
 *
 * ⚠ THE SELLER'S IDENTITY COMES FROM `@effy/legal-content` AND ONLY WHAT IS RECORDED IS SHOWN. A
 * missing ABN or address is omitted, never filled with a placeholder: this is a document a customer
 * keeps (052; `legal-absence.test.tsx`).
 */
function Masthead({ order }: { order: OrderDTO }) {
  const paid = order.paymentStatus === "succeeded" || order.status === "paid"
  const seller = sellerIdentity()
  const facts = [
    order.placedAt ? formatPlacedAt(order.placedAt) : null,
    seller.tradingName,
    seller.legalEntityName,
    seller.abn ? `ABN ${seller.abn}` : null,
    seller.registeredAddress,
    seller.supportEmail,
  ].filter((f): f is string => Boolean(f))

  return (
    <div className="flex items-start justify-between gap-4 p-6">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h2 id="receipt-title" className="flex items-center gap-2 leading-none font-semibold">
          Receipt {paid ? <Badge variant="secondary">Paid</Badge> : null}
        </h2>
        <p className="text-sm text-muted-foreground">
          Order <span className="font-medium text-foreground tabular-nums">{order.orderNumber}</span>
          {facts.map((f) => (
            <span key={f}> · {f}</span>
          ))}
        </p>
      </div>
      <PrintReceipt />
    </div>
  )
}

function LineItem({
  item,
  currency,
  unavailable,
  buyAgain,
}: {
  item: OrderItemDTO
  currency: string
  unavailable: boolean
  buyAgain: boolean
}) {
  return (
    <tr className="border-b last:border-b-0">
      <td className="px-2 py-2.5">
        <div className="flex items-center gap-3">
          {/*
            ⚠ DECORATION ONLY. A missing picture is a plain tile and the line stays whole — nothing
            here is gated on it (FR-003). Every OTHER field is the order's own immutable snapshot,
            which is why a renamed or re-priced product still shows what was actually bought (FR-011).
          */}
          <div className={cn("relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-md bg-secondary text-muted-foreground", unavailable && "opacity-50")}>
            {item.imageUrl ? (
              <CatalogImage src={item.imageUrl} widths={item.imageWidths} alt="" fill sizes="40px" className="object-cover" />
            ) : (
              <Package aria-hidden="true" className="size-[18px]" />
            )}
          </div>
          <div className="min-w-0">
            <div className={cn("font-medium", unavailable && "text-muted-foreground")}>
              {item.productName}
              {/* 098 — the size as it was sold. */}
              {item.variantLabel ? <span className="font-normal text-muted-foreground"> · {item.variantLabel}</span> : null}
            </div>
            {/* The unit price beside the line total: what makes a line checkable, not merely stated. */}
            <div className="text-xs text-muted-foreground">
              <span>{formatMoney(item.unitPriceAmount, currency)} each</span>
              {unavailable && <span> · Out of stock — not included</span>}
            </div>
          </div>
        </div>
      </td>
      <td className={cn("px-2 py-2.5 text-right", unavailable && "text-muted-foreground")}>{item.quantity}</td>
      <td className={cn("px-2 py-2.5 text-right", unavailable && "text-muted-foreground line-through")}>
        {formatMoney(item.lineSubtotalAmount, currency)}
      </td>
      {buyAgain && (
        <td className="px-2 py-2.5 text-right max-md:hidden print:hidden">
          <BuyLineAgain
            variantId={item.variantId}
            variantLabel={item.variantLabel}
            productId={item.productId}
            name={item.productName}
            imageUrl={item.imageUrl ?? null}
            unitPriceAmount={item.unitPriceAmount}
            currency={currency}
          />
        </td>
      )}
    </tr>
  )
}

function Totals({ order }: { order: OrderDTO }) {
  const discount = order.discountAmount && order.discountAmount !== "0.00" ? order.discountAmount : null
  const delivery =
    order.deliveryFeeAmount && order.deliveryFeeAmount !== "0.00" ? order.deliveryFeeAmount : null

  return (
    <div className="mt-4 ml-auto max-w-sm">
      <dl className="flex flex-col gap-2">
        <Row label="Items subtotal" value={formatMoney(order.itemSubtotalAmount, order.currency)} />
        {/* 094 — one row per promotion as sold; an order from before 094 has one code. */}
        {order.promotions && order.promotions.length > 0
          ? order.promotions
              .filter((p) => p.goodsAmount !== "0.00")
              .map((p) => (
                <Row
                  key={`${p.headline}-${p.code ?? ""}`}
                  label={
                    <>
                      {p.headline}
                      {p.code ? <span className="font-medium text-foreground"> {p.code}</span> : null}
                    </>
                  }
                  value={`−${formatMoney(p.goodsAmount, order.currency)}`}
                />
              ))
          : discount ? (
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
        {order.deliveryDiscountAmount && order.deliveryDiscountAmount !== "0.00" ? (
          <Row label="Delivery offer" value={`−${formatMoney(order.deliveryDiscountAmount, order.currency)}`} />
        ) : null}
        {/* 077 — an order placed since the fee engine shows the lines it was SOLD with (stored, never
            re-priced); a free delivery is shown as the lines that make its $0. Before 077, one row. */}
        {order.deliveryFee && order.deliveryFee.lines.length > 0
          ? order.deliveryFee.lines.map((l, i) => (
              <Row
                key={`${l.kind}-${i}`}
                label={DELIVERY_FEE_LINE_LABEL[l.kind]}
                value={l.amount.startsWith("-") ? `−${formatMoney(l.amount.slice(1), order.currency)}` : formatMoney(l.amount, order.currency)}
              />
            ))
          : delivery ? <Row label="Delivery" value={formatMoney(delivery, order.currency)} /> : null}
      </dl>

      <div className="mt-3 flex items-baseline justify-between gap-4 border-t pt-3">
        <dt className="text-base font-semibold">Total paid</dt>
        <dd className="text-base font-semibold tabular-nums">
          {formatMoney(order.grandTotalAmount, order.currency)}
        </dd>
      </div>

      {/* 074 — points are a way of PAYING: a line beside the card's, never a discount above the total. */}
      {order.paymentSplit ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Paid with{" "}
          <span className="font-medium text-foreground tabular-nums">
            {order.paymentSplit.pointsUsed.toLocaleString("en-AU")} Effy points
          </span>{" "}
          ({formatMoney(order.paymentSplit.pointsAmount, order.currency)})
          {Number(order.paymentSplit.cardAmount) > 0 ? (
            <> and {formatMoney(order.paymentSplit.cardAmount, order.currency)} by card</>
          ) : null}
        </p>
      ) : null}
      {order.paymentMethod ? <PaidWith method={order.paymentMethod} /> : null}
    </div>
  )
}

function Row({ label, value }: { label: React.ReactNode; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className={cn("text-sm", value.startsWith("−") && "font-medium text-brand")}>{label}</dt>
      <dd className={cn("text-sm tabular-nums", value.startsWith("−") && "font-medium text-brand")}>{value}</dd>
    </div>
  )
}

/**
 * How it was paid (FR-006). ⚠ Rendered ONLY when captured — a pre-052 order, or one whose
 * post-commit capture failed, simply has no such line. Absent, never blank.
 */
function PaidWith({ method }: { method: PaymentMethodSummaryDTO }) {
  return (
    <p className="mt-2 text-xs text-muted-foreground">
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
