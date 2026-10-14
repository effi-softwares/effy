import Link from "next/link"
import { COVERAGE_REFUSAL_SENTENCE, DELIVERY_TYPE_WORDS } from "@effy/shared-types"
import type { AddressDTO } from "@effy/shared-types"

import { defaultAddress, getAddresses } from "@/lib/customer-reads"
import { getSession } from "@/lib/session"

/**
 * The black bar across the top: where Effy is delivering, and who delivers there (FR-016).
 *
 * ⚠ THE ANSWER IS THE ADDRESS'S OWN `coverage` — the one the address book and checkout show, decided
 * by the platform's single coverage function. This component never works it out from a postcode: a
 * second derivation here is how the bar would one day promise an Effy window that checkout refuses.
 *
 * ⚠ It says only what is true. No default address → an invitation, not an assertion. Coverage absent
 * (a server older than 076) → the place, and no claim about who delivers.
 *
 * Read per customer, so it renders inside a Suspense boundary and never holds up the static shell.
 */
export async function DeliveryBar() {
  const session = await getSession()
  if (!session) return <GuestDeliveryBar />

  let address: AddressDTO | null = null
  try {
    address = defaultAddress(await getAddresses())
  } catch {
    return <DeliveryBarFallback />
  }

  if (!address) {
    return (
      <Link href="/addresses" className="flex min-w-0 items-center gap-2 hover:underline">
        <Dot />
        <span className="truncate">Add an address to see who delivers to you</span>
      </Link>
    )
  }

  const place = [address.label ?? address.recipientName, `${address.city} ${address.postalCode}`]
    .filter(Boolean)
    .join(" · ")
  const who =
    address.coverage === "effy"
      ? DELIVERY_TYPE_WORDS.effy
      : address.coverage === "courier"
        ? DELIVERY_TYPE_WORDS.courier
        : address.coverage === "none"
          ? COVERAGE_REFUSAL_SENTENCE
          : null

  return (
    <Link href="/addresses" className="group flex min-w-0 items-center gap-2" data-testid="delivery-bar">
      <Dot muted={address.coverage === "none"} />
      <span className="truncate">
        Delivering to <b className="font-semibold">{place}</b>
        {who && <span className="max-md:hidden"> — {who}</span>}
      </span>
      <span className="underline max-md:hidden">Change</span>
    </Link>
  )
}

function GuestDeliveryBar() {
  return (
    <Link href="/sign-in?next=%2Faddresses" className="flex min-w-0 items-center gap-2 hover:underline">
      <Dot />
      <span className="truncate">Sign in to see who delivers to your address</span>
    </Link>
  )
}

/** The bar before the customer's address is known — and what a failed read falls back to. */
export function DeliveryBarFallback() {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Dot />
      <span className="truncate">Groceries, delivered</span>
    </span>
  )
}

function Dot({ muted = false }: { muted?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`size-2 shrink-0 rounded-full ring-[3px] ring-white/20 ${muted ? "bg-muted-foreground" : "bg-brand"}`}
    />
  )
}
