import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { Heart, ShoppingBag, Tag } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import type { AddressDTO } from "@effy/shared-types"

import { AddressList } from "@/app/(account)/addresses/_components/AddressList"
import { Avatar } from "@/components/Avatar"
import { edgeApi } from "@/lib/api/edge"
import { getSession, requireCustomer } from "@/lib/dal"
import { AccountTabsProvider, SectionNav, TabContent } from "./AccountTabs"
import { EmailDeliveryNotice } from "./EmailDeliveryNotice"
import { PasswordCard } from "./PasswordCard"
import { PersonalInfo } from "./PersonalInfo"
import { SessionCard } from "./SessionCard"
import { parseTab, tabHref } from "./tabs"
import { DeleteAccountFlow } from "./privacy/DeleteAccountFlow"

export const metadata: Metadata = {
  title: "Your account",
  // FR-036 — never indexed. An account page in a search index is a data leak with a URL.
  robots: { index: false, follow: false },
}

/**
 * The account page (012, re-laid-out 2026-08-11, tabbed 2026-08-12).
 *
 * ⚠ Everything shown here comes from the PLATFORM'S OWN RECORD, not the token's claims. That
 * distinction is the whole reason `public.customer` exists: the claim is the ORIGIN of identity, the
 * record is the AUTHORITY on access. A barred customer never reaches this page, however impeccable
 * their credential — `requireCustomer` asks the backend, and the backend asks the database.
 *
 * ⚠ The <Suspense> boundary is MANDATORY under `cacheComponents`: request-time data read outside one
 * is a BUILD ERROR. `searchParams` is dynamic too, so it is read INSIDE the boundary — the shell
 * (title + subtitle) still prerenders; the customer's details and the active tab stream in.
 *
 * LAYOUT — the settings two-column pattern (Amazon "Login & Security", GitHub, Stripe): a sticky
 * sidebar carrying identity + section navigation, and a main column whose content is chosen by the
 * `?tab=` param. Address management lives here as the `addresses` tab rather than a separate page —
 * clicking it in the sidebar swaps the content area in place.
 */
export default function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  return (
    <div className="container py-3 sm:py-6">
      <Suspense fallback={<AccountSkeleton />}>
        <AccountBody searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

async function AccountBody({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams
  const active = parseTab(tab)

  // Return the customer to the SAME tab after a sign-in bounce, not just to the account root.
  const customer = await requireCustomer(tabHref(active))
  const name = [customer.givenName, customer.familyName].filter(Boolean).join(" ")

  return (
    // ⚠ The provider wraps BOTH columns because the two halves of a tab switch live in different
    // ones: the nav is what was pressed, the content is what is loading. Everything inside is
    // server-rendered and passed straight through as `children`.
    <AccountTabsProvider active={active}>
      <div className="mt-6 grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Sidebar — identity above, section navigation below. Sticks in view on desktop so the nav
            is reachable no matter how far the main column scrolls; a normal block on phones.
            ⚠ It does NOT re-render on a tab switch: identity is the same on all four tabs, so
            replacing it with a skeleton would be motion reporting a change that did not happen. */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <IdentityCard
            name={name}
            givenName={customer.givenName}
            familyName={customer.familyName}
            email={customer.email}
            createdAt={customer.createdAt}
          />
          <SectionNav />
        </aside>

        <main className="min-w-0 space-y-6">
          <TabContent>
            {active === "addresses" ? (
              <AddressBook />
            ) : active === "security" ? (
              <SecuritySection
                hasPassword={customer.hasPassword}
                passwordUpdatedAt={customer.passwordUpdatedAt}
              />
            ) : active === "privacy" ? (
              <PrivacySection />
            ) : (
              <>
                {/*
                  ⚠ FIRST, ABOVE EVERYTHING (037 FR-030). If the platform cannot email this person,
                  that is the most important thing on the page — it means their sign-in codes,
                  receipts and security notices are silently going nowhere. Renders nothing at all in
                  the common case.
                */}
                <EmailDeliveryNotice state={customer.emailDelivery} email={customer.email} />

                {/* Shortcut tiles — things a customer opens their account to reach. Navigational
                    only. */}
                <QuickLinks />

                {/* ⚠ 034 FR-007 — NO SIGN-OUT CONTROL ON THE PERSONAL TAB, and no password card
                    either. Both live under the Security tab, off the account root where a stray tap
                    could reach them while browsing. */}
                <PersonalInfo
                  givenName={customer.givenName}
                  familyName={customer.familyName}
                  phone={customer.phone}
                  email={customer.email}
                />
              </>
            )}
          </TabContent>
        </main>
      </div>
    </AccountTabsProvider>
  )
}

/**
 * The address book (022), rendered in the content area rather than on its own page. The list is
 * fetched server-side and handed to the client `AddressList`, which owns add / edit / delete /
 * set-default and reflects each mutation locally (FR-008) — the same component the old `/addresses`
 * page used, now hosted here so managing addresses never leaves the account hub.
 *
 * Cold path — customer profile management (022, routing law 011 FR-028). Per-customer → no cache.
 */
async function AddressBook() {
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
      <h2 id="address-book-heading" className="mb-4 text-xl font-semibold">
        Address book
      </h2>
      <AddressList initial={addresses} />
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
function SecuritySection({
  hasPassword,
  passwordUpdatedAt,
}: {
  hasPassword: boolean
  passwordUpdatedAt: string | null
}) {
  return (
    <section aria-labelledby="security-heading">
      <h2 id="security-heading" className="text-xl font-semibold">
        Security
      </h2>
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
function PrivacySection() {
  return (
    <div className="space-y-8">
      <section aria-labelledby="privacy-heading">
        <h2 id="privacy-heading" className="text-xl font-semibold">
          Privacy &amp; data
        </h2>
        <ul className="mt-4 divide-y">
          {/* ⚠ An in-app privacy policy link is required by BOTH stores (Apple 5.1.1(i), Google User
              Data policy). The documents behind these links come from @effy/legal-content (045). */}
          {[
            { label: "Privacy policy", href: "/legal/privacy-policy" },
            { label: "Terms of service", href: "/legal/terms-of-service" },
            { label: "Refunds & returns", href: "/legal/refunds-returns" },
          ].map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex min-h-[48px] items-center py-3 text-sm hover:text-foreground/70"
              >
                {item.label}
              </Link>
            </li>
          ))}
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
        className="rounded-2xl border border-destructive/40 bg-destructive/3 p-6"
      >
        <h2 id="delete-heading" className="text-lg font-medium">
          Delete account
        </h2>
        <DeleteAccountFlow />
      </section>
    </div>
  )
}

/** Navigational shortcut tiles to the customer's most-used destinations. */
function QuickLinks() {
  const tiles: { href: string; label: string; hint: string; Icon: LucideIcon }[] = [
    { href: "/orders", label: "Orders", hint: "Track & reorder", Icon: ShoppingBag },
    { href: "/saved", label: "Saved items", hint: "Your watchlist", Icon: Heart },
    { href: "/search?saleOnly=true", label: "On sale", hint: "Deals & offers", Icon: Tag },
  ]

  return (
    <nav aria-label="Account shortcuts">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiles.map(({ href, label, hint, Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex h-full min-h-[92px] flex-col justify-between rounded-xl border p-4 outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon aria-hidden className="size-5 text-muted-foreground" />
              <span className="mt-3">
                <span className="block text-sm font-medium">{label}</span>
                <span className="block text-xs text-muted-foreground">{hint}</span>
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
function IdentityCard({
  name,
  givenName,
  familyName,
  email,
  createdAt,
}: {
  name: string
  givenName: string | null
  familyName: string | null
  email: string
  createdAt: string
}) {
  return (
    <section
      aria-labelledby="identity-heading"
      className="rounded-xl border bg-card p-6 text-center"
    >
      <h2 id="identity-heading" className="sr-only">
        Your details
      </h2>

      <Avatar
        givenName={givenName}
        familyName={familyName}
        labelledByAdjacentName
        className="mx-auto size-16 text-xl"
      />

      <div className="mt-4 min-w-0">
        {name ? (
          <p className="truncate text-lg font-semibold" data-testid="account-name">
            {name}
          </p>
        ) : (
          // FR-003 / FR-015 — having no name is a normal state, not an error. Invite; do not scold.
          <p
            className="truncate text-lg font-semibold text-muted-foreground"
            data-testid="account-name-empty"
          >
            Add your name below
          </p>
        )}

        <p className="truncate text-sm text-muted-foreground" data-testid="account-email">
          {email}
        </p>

        <p className="mt-3 text-xs text-muted-foreground">
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

/**
 * The FIRST-LOAD fallback, and only that.
 *
 * ⚠ It no longer stands in for a tab switch. Switching tabs is driven by a client transition that
 * keeps this boundary resolved (see `AccountTabs.tsx`), so the sidebar survives and the spinner is
 * scoped to the column that actually changed. This shape — the whole grid greyed out — is now
 * reserved for arriving at the page cold, when none of it exists yet and all of it is honest.
 */
function AccountSkeleton() {
  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)]" aria-hidden="true">
      <div className="space-y-4">
        <div className="h-52 w-full animate-pulse rounded-xl bg-muted" />
        <div className="h-56 w-full animate-pulse rounded-xl bg-muted" />
      </div>
      <div className="h-80 w-full animate-pulse rounded-xl bg-muted" />
    </div>
  )
}
