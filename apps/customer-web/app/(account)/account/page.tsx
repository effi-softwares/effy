import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"

import { Avatar } from "@/components/Avatar"
import { requireCustomer } from "@/lib/dal"
import { EmailDeliveryNotice } from "./EmailDeliveryNotice"
import { PersonalInfo } from "./PersonalInfo"

export const metadata: Metadata = {
  title: "Your account",
  // FR-036 — never indexed. An account page in a search index is a data leak with a URL.
  robots: { index: false, follow: false },
}

/**
 * The account page (012).
 *
 * ⚠ Everything shown here comes from the PLATFORM'S OWN RECORD, not the token's claims. That
 * distinction is the whole reason `public.customer` exists: the claim is the ORIGIN of identity, the
 * record is the AUTHORITY on access. A barred customer never reaches this page, however impeccable
 * their credential — `requireCustomer` asks the backend, and the backend asks the database.
 *
 * ⚠ The <Suspense> boundary is MANDATORY under `cacheComponents`: request-time data read outside one
 * is a BUILD ERROR, because it would block the whole page on a network round trip. The shell
 * prerenders; the customer's details stream in.
 *
 * The layout is three sectioned cards under an identity strip — the shape every well-built account
 * page converges on (Amazon's "Login & Security", GitHub's settings, Stripe's). Not tabs: there are
 * only three things here, and tabs would hide two of them behind a click for no reason at all.
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
    <div className="mt-8 space-y-6">
      {/*
        ⚠ FIRST, ABOVE EVERYTHING (037 FR-030). If the platform cannot email this person, that is the
        most important thing on the page — it means their sign-in codes, receipts and security
        notices are silently going nowhere. Renders nothing at all in the common case.
      */}
      <EmailDeliveryNotice state={customer.emailDelivery} email={customer.email} />

      <IdentityStrip
        givenName={customer.givenName}
        familyName={customer.familyName}
        email={customer.email}
        createdAt={customer.createdAt}
      />

      <PersonalInfo
        givenName={customer.givenName}
        familyName={customer.familyName}
        phone={customer.phone}
        email={customer.email}
      />

      {/* ⚠ 034 FR-007 — NO SIGN-OUT CONTROL ON THIS PAGE, and no password card either. Both moved to
          /account/security, with the other credential actions. Sign out used to sit one careless
          click away from ordinary navigation. */}
      <AccountLinks />
    </div>
  )
}

/** The account's remaining sections (034 FR-006) — grouped, not a flat list. */
function AccountLinks() {
  return (
    <nav aria-label="Account settings">
      <ul className="divide-y border-y">
        {[
          { href: "/addresses", label: "Address book" },
          { href: "/account/security", label: "Security" },
          { href: "/account/privacy", label: "Privacy & data" },
        ].map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="flex min-h-[48px] items-center justify-between py-3 text-sm hover:text-foreground/70"
            >
              {l.label}
              <span aria-hidden className="text-muted-foreground">
                &rsaquo;
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/**
 * Who Effy thinks you are (FR-001) — answerable at a glance, with no interaction.
 *
 * The avatar sits beside the visible name, so it is DECORATIVE and hidden from assistive technology.
 * Labelling it as well would make a screen reader announce the name twice.
 */
function IdentityStrip({
  givenName,
  familyName,
  email,
  createdAt,
}: {
  givenName: string | null
  familyName: string | null
  email: string
  createdAt: string
}) {
  const name = [givenName, familyName].filter(Boolean).join(" ")

  return (
    <section aria-labelledby="identity-heading" className="flex items-center gap-4">
      <h2 id="identity-heading" className="sr-only">
        Your details
      </h2>

      <Avatar givenName={givenName} familyName={familyName} labelledByAdjacentName />

      <div className="min-w-0">
        {name ? (
          <p className="truncate text-lg font-medium" data-testid="account-name">
            {name}
          </p>
        ) : (
          // FR-003 / FR-015 — having no name is a normal state, not an error. Invite; do not scold.
          <p className="text-lg font-medium text-muted-foreground" data-testid="account-name-empty">
            Add your name below
          </p>
        )}

        <p className="truncate text-sm text-muted-foreground" data-testid="account-email">
          {email}
        </p>

        <p className="text-sm text-muted-foreground">
          Member since{" "}
          {new Date(createdAt).toLocaleDateString("en-AU", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>
    </section>
  )
}

function AccountSkeleton() {
  return (
    <div className="mt-8 space-y-6" aria-hidden="true">
      <div className="h-12 w-full animate-pulse rounded-lg bg-muted" />
      <div className="h-40 w-full animate-pulse rounded-lg bg-muted" />
      <div className="h-32 w-full animate-pulse rounded-lg bg-muted" />
      <div className="h-32 w-full animate-pulse rounded-lg bg-muted" />
    </div>
  )
}
