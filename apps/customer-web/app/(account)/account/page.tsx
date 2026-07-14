import type { Metadata } from "next"
import { Suspense } from "react"

import { requireCustomer } from "@/lib/dal"
import { ProfileForm } from "./ProfileForm"

export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
}

/**
 * The account page (FR-026).
 *
 * ⚠ What is displayed comes from the PLATFORM'S OWN RECORD, not the token's claims. That
 * distinction is the whole reason `public.customer` exists: the claim is the ORIGIN of identity,
 * the record is the AUTHORITY on access. A barred customer never reaches this page, however
 * impeccable their credential — `requireCustomer` asks the backend, and the backend asks the
 * database.
 *
 * ⚠ The <Suspense> boundary is mandatory under `cacheComponents`: request-time data read outside
 * one is a build error, because it would block the whole page on a network round trip. The shell
 * prerenders; the customer's details stream in.
 */
export default function AccountPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Your account</h1>

      <Suspense fallback={<AccountSkeleton />}>
        <AccountDetails />
      </Suspense>
    </div>
  )
}

async function AccountDetails() {
  const customer = await requireCustomer("/account")

  return (
    <>
      <dl className="mt-8 divide-y rounded-lg border">
        <div className="flex items-center justify-between p-4">
          <dt className="text-sm text-muted-foreground">Email</dt>
          <dd className="text-sm font-medium" data-testid="account-email">
            {customer.email}
          </dd>
        </div>
        <div className="flex items-center justify-between p-4">
          <dt className="text-sm text-muted-foreground">Member since</dt>
          <dd className="text-sm">
            {new Date(customer.createdAt).toLocaleDateString("en-AU", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </dd>
        </div>
      </dl>

      {/* The email is deliberately NOT editable. Changing it is an identity operation, not a
          profile edit — a customer who can rewrite their own email can point it at someone else's.
          The Cognito app client refuses the write too; this is defence in depth, not either/or. */}
      <ProfileForm givenName={customer.givenName} familyName={customer.familyName} />
    </>
  )
}

function AccountSkeleton() {
  return (
    <div className="mt-8 space-y-4" aria-hidden="true">
      <div className="h-28 w-full animate-pulse rounded-lg bg-muted" />
      <div className="h-11 w-full animate-pulse rounded-md bg-muted" />
    </div>
  )
}
