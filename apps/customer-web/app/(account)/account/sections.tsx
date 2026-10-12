import Link from "next/link"
import { allDocuments } from "@effy/legal-content"
import type { AddressDTO, PaymentMethodDTO } from "@effy/shared-types"

import { AddressList } from "@/app/(account)/addresses/_components/AddressList"
import { edgeApi, uncached } from "@/lib/api/edge"
import { getSession } from "@/lib/dal"

import { PasswordCard } from "./PasswordCard"
import { PaymentMethodList } from "./PaymentMethodList"
import { SessionCard } from "./SessionCard"
import { DeleteAccountFlow } from "./privacy/DeleteAccountFlow"

/*
 * The account area's sections — each rendered by ITS OWN PAGE since 084.
 *
 * Until 084 these were tabs of one `/account` page selected by `?tab=`. The reference gives every
 * section an address of its own behind a shared sidebar, so they moved here unchanged and each page
 * renders one. `/account?tab=x` still arrives: the Overview page redirects it (FR-014).
 */

/**
 * The address book (022), rendered in the content area rather than on its own page. The list is
 * fetched server-side and handed to the client `AddressList`, which owns add / edit / delete /
 * set-default and reflects each mutation locally (FR-008) — the same component the old `/addresses`
 * page used, now hosted here so managing addresses never leaves the account hub.
 *
 * Cold path — customer profile management (022, routing law 011 FR-028). Per-customer → no cache.
 */
export async function AddressBook() {
  const session = await getSession()
  let addresses: AddressDTO[] = []
  if (session?.idToken) {
    try {
      addresses = await edgeApi(session).get<AddressDTO[]>("/customer/v1/addresses", {
        cache: "no-store",
      })
    } catch {
      addresses = []
    }
  }

  return (
    <section aria-labelledby="address-book-heading">
      <h1 id="address-book-heading" className="mb-6 text-2xl font-semibold tracking-tight sm:text-3xl">
        Address book
      </h1>
      <AddressList initial={addresses} />
    </section>
  )
}

/**
 * Payment methods (051 US6) — the cards a shopper chose to keep.
 *
 * ⚠ Served by the commerce service, unlike the address book above it (the customer service):
 * listing a card is a call to the payment provider, so it lives with checkout.
 *
 * ⚠ A FAILED READ IS NOT AN EMPTY LIST. Falling back to `[]` here would tell a shopper with saved cards
 * that they have none — a false statement about their own account, and exactly the FR-036 failure mode.
 * The flag keeps the two apart.
 */
export async function PaymentMethods() {
  const session = await getSession()
  let cards: PaymentMethodDTO[] = []
  let loadFailed = false
  if (session?.accessToken) {
    try {
      const res = await edgeApi(session).get<{ paymentMethods: PaymentMethodDTO[] }>(
        "/commerce/v1/payment-methods",
        uncached(),
      )
      cards = res.paymentMethods ?? []
    } catch {
      loadFailed = true
    }
  }

  return (
    <section aria-labelledby="payment-methods-heading">
      <h1 id="payment-methods-heading" className="mb-6 text-2xl font-semibold tracking-tight sm:text-3xl">
        Payment methods
      </h1>
      <PaymentMethodList initial={cards} loadFailed={loadFailed} />
    </section>
  )
}

/**
 * Security (034 US4) — how you sign in, and the controls that end your sessions.
 *
 * ⚠ COMPOSED FROM THE CREDENTIALS THE ACCOUNT ACTUALLY HOLDS (FR-025), never a fixed row list.
 * `PasswordCard` branches on the platform-owned `hasPassword`, never on how the customer signed in.
 * ⚠ SIGN OUT LIVES HERE (FR-028), off the account root where a stray tap could reach it while
 * browsing — the reason this is its own tab and not part of the personal view.
 */
export function SecuritySection({
  hasPassword,
  passwordUpdatedAt,
}: {
  hasPassword: boolean
  passwordUpdatedAt: string | null
}) {
  return (
    <section aria-labelledby="security-heading">
      <h1 id="security-heading" className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Security
      </h1>
      <div className="mt-6 divide-y">
        <div className="py-6 first:pt-0">
          <PasswordCard hasPassword={hasPassword} passwordUpdatedAt={passwordUpdatedAt} />
        </div>
        <div className="py-6">
          <SessionCard />
        </div>
      </div>
    </section>
  )
}

/**
 * Privacy & data (034 US6) — and the host for account deletion.
 *
 * ⚠ THE DELETION CONTROL IS THE LAST THING IN THE TAB (FR-039), deliberately. `Account → Privacy &
 * data → bottom` matches the VERIFIED Uber path; SC-007 makes a fresh-account reviewer the test.
 */
export function PrivacySection() {
  return (
    <div className="space-y-8">
      <section aria-labelledby="privacy-heading">
        <h1 id="privacy-heading" className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Privacy &amp; data
        </h1>
        <ul className="mt-4 divide-y">
          {/* ⚠ An in-app privacy policy link is required by BOTH stores (Apple 5.1.1(i), Google User
              Data policy) and belongs HERE, in the privacy area. The full list of documents lives in
              the Legal tab, not duplicated here. */}
          <li>
            <Link
              href="/legal/privacy-policy"
              className="flex min-h-[48px] items-center py-3 text-sm hover:text-foreground/70"
            >
              Privacy policy
            </Link>
          </li>
        </ul>
      </section>

      {/*
        The LAST item in the tab, and the one bordered container in the customer account area.

        ⚠ A CARD HERE IS A DELIBERATE PRINCIPLE V EXCEPTION, not a lapse. The doctrine's objection is
        to cards used as a LAYOUT device — a grid of equal-weight boxes that flattens hierarchy. This
        is the opposite job: a border that QUARANTINES one irreversible action from the reversible
        policy links above it, so the boundary itself carries the warning. It is the long-established
        "danger zone" convention, and no sectioned-list alternative separates destructive from
        non-destructive without it.

        ⚠ The tint is `--destructive` — one of the platform's exactly two semantic colours — used as
        a BORDER and a barely-there ground, never as a fill or a label. The heading stays neutral: the
        border and the destructive confirm button are the signal, and a third red would spend the
        colour's meaning on decoration.
      */}
      <section
        aria-labelledby="delete-heading"
        data-testid="danger-zone"
        className="rounded-lg border bg-card p-6 shadow-xs"
      >
        <h2 id="delete-heading" className="text-lg font-medium">
          Delete account
        </h2>

        {/* The good explanation that used to live only on the public /delete-account page — shown
            here too, where a signed-in customer actually deletes. */}
        <p className="mt-2 text-sm text-muted-foreground">
          Deleting removes your account, your saved items, your saved addresses and your personal
          details. We keep completed orders and payment records, because tax and accounting rules
          require it, and fraud and security signals that protect other customers — as set out in our{" "}
          <Link href="/legal/privacy-policy" className="underline">
            privacy policy
          </Link>
          . If you have an order in progress, you&rsquo;ll be asked to wait until it&rsquo;s complete.
        </p>

        <div className="mt-4">
          <DeleteAccountFlow />
        </div>
      </section>
    </div>
  )
}

/**
 * The Legal tab (045) — every legal & informational document in one place, from @effy/legal-content
 * (the single source shared with mobile). Contextual links still live where the decision is made
 * (checkout, sign-up, product, footer); this is the canonical "browse them all" home.
 */
export function LegalSection() {
  const legal = allDocuments().filter((d) => d.category === "legal")
  const info = allDocuments().filter((d) => d.category === "info")

  return (
    <section aria-labelledby="legal-heading" className="space-y-8">
      <div>
        <h1 id="legal-heading" className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Legal
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The documents that govern your use of Effy, and how we handle your information.
        </p>
      </div>

      <LegalGroup title="Policies & agreements" docs={legal} />
      <LegalGroup title="About" docs={info} />
    </section>
  )
}

function LegalGroup({ title, docs }: { title: string; docs: ReturnType<typeof allDocuments> }) {
  return (
    <div>
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      <ul className="mt-2 divide-y">
        {docs.map((doc) => (
          <li key={doc.slug}>
            <Link
              href={`/legal/${doc.slug}`}
              className="flex min-h-[48px] items-center justify-between py-3 text-sm hover:text-foreground/70"
            >
              <span>{doc.title}</span>
              <span className="text-xs text-muted-foreground">Updated {doc.effectiveDate}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
