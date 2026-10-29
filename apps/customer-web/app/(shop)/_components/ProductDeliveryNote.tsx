import Link from "next/link"
import { Coins, Truck } from "lucide-react"
import { COVERAGE_REFUSAL_SENTENCE, DELIVERY_TYPE_WORDS } from "@effy/shared-types"
import type { AddressDTO, PointsBalanceDTO } from "@effy/shared-types"

import { defaultAddress, getAddresses, getPoints } from "@/lib/customer-reads"
import { formatMoney } from "@/lib/money"
import { getSession } from "@/lib/session"
import { Bone, Loading } from "@/components/ui/skeletons"

import { PaymentMarks } from "./PaymentMarks"

/**
 * The panel under the buy buttons: who delivers to the default address (its own `coverage`, as in the
 * header and checkout; no day or window), the customer's points (as what they are worth), and what
 * checkout accepts. A guest gets the general line and the payment marks.
 */
export async function ProductDeliveryNote() {
  const session = await getSession()

  let address: AddressDTO | null = null
  let points: PointsBalanceDTO | null = null
  if (session) {
    const [addresses, balance] = await Promise.all([
      getAddresses().catch(() => null),
      getPoints().catch(() => null),
    ])
    address = defaultAddress(addresses)
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
        <Truck aria-hidden="true" className={`mt-1 size-4 shrink-0 ${address?.coverage === "effy" ? "text-brand" : ""}`} />
        <div className="min-w-0 text-sm">
          <p className="font-medium">{title}</p>
          <p className="text-muted-foreground">{body}</p>
        </div>
      </div>
      {points && (
        <div className="flex gap-3 border-t p-4">
          <Coins aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" />
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

/** The card while the shopper's address is read: the same card and its fixed links row, a bone for who delivers. */
export function ProductDeliveryNoteFallback() {
  return (
    <Loading label="Checking who delivers to you">
      <div className="rounded-lg border shadow-xs">
        <div className="flex gap-3 p-4">
          <Truck aria-hidden="true" className="mt-1 size-4 shrink-0 text-muted-foreground" />
          <div className="flex min-w-0 flex-1 flex-col gap-2 py-0.5">
            <Bone className="w-3/4" />
            <Bone className="w-1/2" />
          </div>
        </div>
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
    </Loading>
  )
}
