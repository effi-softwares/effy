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

/* The account area's sections, each rendered by its own page; `/account?tab=x` is redirected by the Overview. */

/** The address book: fetched server-side, handed to the client `AddressList`, which owns add, edit, delete and set-default. Per-customer, so uncached. */
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
    <AddressList initial={addresses} />
  )
}

/** Payment methods (served by commerce, since listing a card calls the provider). A failed read is not an empty list. */
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

/** Security: built from the credentials the account holds (`PasswordCard` branches on `hasPassword`), plus sign-out, away from the account root. */
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

/** Privacy and data, with account deletion as the last thing in the tab. */
export function PrivacySection() {
  return (
    <div className="space-y-8">
      <section aria-labelledby="privacy-heading">
        <h1 id="privacy-heading" className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Privacy &amp; data
        </h1>
        <ul className="mt-4 divide-y">
          {/* An in-app privacy policy link, required by both app stores; the full list is in the Legal tab. */}
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
        The one bordered container in the account area: a danger zone quarantining the irreversible action
        from the policy links above. `--destructive` as a border and faint ground only; the heading stays neutral.
      */}
      <section
        aria-labelledby="delete-heading"
        data-testid="danger-zone"
        className="rounded-lg border bg-card p-6 shadow-xs"
      >
        <h2 id="delete-heading" className="text-lg font-medium">
          Delete account
        </h2>

        {/* The explanation from the public /delete-account page, shown where a signed-in customer deletes. */}
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

/** The Legal tab: every document from @effy/legal-content in one place (contextual links stay where decisions are made). */
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
