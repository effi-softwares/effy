import Link from "next/link"
import { Coins, Truck } from "lucide-react"
import { COVERAGE_REFUSAL_SENTENCE, DELIVERY_TYPE_WORDS } from "@effy/shared-types"
import type { AddressDTO, PointsBalanceDTO } from "@effy/shared-types"

import { edgeApi, perCustomer } from "@/lib/api/edge"
import { formatMoney } from "@/lib/money"
import { readServerSession } from "@/lib/session"

import { PaymentMarks } from "./PaymentMarks"

/**
 * The panel under the buy buttons (reference: Product detail; FR-023): who delivers to the customer's
 * address, their points, and what checkout accepts.
 *
 * ⚠ SAME ANSWER AS THE HEADER AND CHECKOUT — the default address's own `coverage`. Nothing here is
 * worked out from a postcode, and nothing promises a day or a window: that is chosen at checkout.
 *
 * ⚠ Points are said as what they are worth and "use them to pay" — never as money off this product.
 *
 * A guest gets the general line and the payment marks; both customer rows need a session.
 */
export async function ProductDeliveryNote() {
  const session = await readServerSession()

  let address: AddressDTO | null = null
  let points: PointsBalanceDTO | null = null
  if (session) {
    const api = edgeApi(session)
    const [addresses, balance] = await Promise.all([
      api.get<AddressDTO[]>("/customer/v1/addresses", perCustomer).catch(() => null),
      api.get<PointsBalanceDTO>("/customer/v1/points", perCustomer).catch(() => null),
    ])
    address = addresses?.find((a) => a.isDefault) ?? addresses?.[0] ?? null
    points = balance && Number(balance.points) > 0 ? balance : null
  }

  const place = address ? `${address.label ?? address.recipientName} · ${address.city} ${address.postalCode}` : null
  const title =
    address?.coverage === "effy"
      ? `${DELIVERY_TYPE_WORDS.effy} to ${place}`
      : address?.coverage === "courier"
        ? `${DELIVERY_TYPE_WORDS.courier} to ${place}`
        : address?.coverage === "none"
          ? COVERAGE_REFUSAL_SENTENCE
          : "Delivered by Effy, or by courier where we can't reach"
  const body =
    address?.coverage === "effy"
      ? "Choose a delivery window at checkout."
      : address?.coverage === "courier"
        ? DELIVERY_TYPE_WORDS.courierPartner
        : address?.coverage === "none"
          ? "Choose another address at checkout."
          : "Who delivers depends on your address — you'll see it at checkout."

  return (
    <div className="rounded-lg border shadow-xs">
      <div className="flex gap-3 p-4">
        <Truck aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${address?.coverage === "effy" ? "text-brand" : ""}`} />
        <div className="min-w-0 text-sm">
          <p className="font-medium">{title}</p>
          <p className="text-muted-foreground">{body}</p>
        </div>
      </div>
      {points && (
        <div className="flex gap-3 border-t p-4">
          <Coins aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="min-w-0 text-sm">
            <p className="font-medium">
              You have{" "}
              <Link href="/account/points" className="text-primary">
                {Number(points.points).toLocaleString("en-AU")} Effy points
              </Link>{" "}
              (worth {formatMoney(points.valueAmount, "AUD")})
            </p>
            <p className="text-muted-foreground">Use them to pay at checkout.</p>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4">
        <PaymentMarks />
        <span className="flex gap-4 text-sm">
          <Link href="/legal/delivery-policy" className="underline underline-offset-4">
            Delivery policy
          </Link>
          <Link href="/legal/refunds-returns" className="underline underline-offset-4">
            Refunds &amp; returns
          </Link>
        </span>
      </div>
    </div>
  )
}

export function ProductDeliveryNoteFallback() {
  return <div aria-hidden="true" className="h-36 animate-pulse rounded-lg bg-muted" />
}
