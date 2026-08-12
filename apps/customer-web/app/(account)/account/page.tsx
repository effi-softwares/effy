import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import {
  ChevronRight,
  FileText,
  Heart,
  MapPin,
  ShieldCheck,
  ShoppingBag,
  Tag,
  User,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import type { AddressDTO } from "@effy/shared-types"

import { AddressList } from "@/app/(account)/addresses/_components/AddressList"
import { Avatar } from "@/components/Avatar"
import { edgeApi } from "@/lib/api/edge"
import { getSession, requireCustomer } from "@/lib/dal"
import { EmailDeliveryNotice } from "./EmailDeliveryNotice"
import { PasswordCard } from "./PasswordCard"
import { PersonalInfo } from "./PersonalInfo"
import { SessionCard } from "./SessionCard"
import { DeleteAccountFlow } from "./privacy/DeleteAccountFlow"

export const metadata: Metadata = {
  title: "Your account",
  // FR-036 — never indexed. An account page in a search index is a data leak with a URL.
  robots: { index: false, follow: false },
}

/** The tabs that live INSIDE the content area (not separate pages). */
type AccountTab = "personal" | "addresses" | "security" | "privacy"

const TABS: readonly AccountTab[] = ["personal", "addresses", "security", "privacy"]

function parseTab(raw: string | undefined): AccountTab {
  return (TABS as readonly string[]).includes(raw ?? "") ? (raw as AccountTab) : "personal"
}

/** The URL for a tab — `personal` is the bare page; the rest carry `?tab=`. */
function tabHref(tab: AccountTab): string {
  return tab === "personal" ? "/account" : `/account?tab=${tab}`
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
    <div className="mt-6 grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* Sidebar — identity above, section navigation below. Sticks in view on desktop so the nav is
          reachable no matter how far the main column scrolls; a normal block on phones. */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <IdentityCard
          name={name}
          givenName={customer.givenName}
          familyName={customer.familyName}
          email={customer.email}
          createdAt={customer.createdAt}
        />
        <SectionNav active={active} />
      </aside>

      <main className="min-w-0 space-y-6">
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
              ⚠ FIRST, ABOVE EVERYTHING (037 FR-030). If the platform cannot email this person, that is
              the most important thing on the page — it means their sign-in codes, receipts and security
              notices are silently going nowhere. Renders nothing at all in the common case.
            */}
            <EmailDeliveryNotice state={customer.emailDelivery} email={customer.email} />

            {/* Shortcut tiles — things a customer opens their account to reach. Navigational only. */}
            <QuickLinks />

            {/* ⚠ 034 FR-007 — NO SIGN-OUT CONTROL ON THE PERSONAL TAB, and no password card either.
                Both live under the Security tab, off the account root where a stray tap could reach
                them while browsing. */}
            <PersonalInfo
              givenName={customer.givenName}
              familyName={customer.familyName}
              phone={customer.phone}
              email={customer.email}
            />
          </>
        )}
      </main>
    </div>
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
      <h2 id="address-book-heading" className="mb-4 text-lg font-medium">
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
    <section aria-labelledby="security-heading" className="space-y-6">
      <h2 id="security-heading" className="text-lg font-medium">
        Security
      </h2>
      <PasswordCard hasPassword={hasPassword} passwordUpdatedAt={passwordUpdatedAt} />
      <SessionCard />
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
    <div className="space-y-16">
      <section aria-labelledby="privacy-heading">
        <h2 id="privacy-heading" className="text-lg font-medium">
          Privacy &amp; data
        </h2>
        <ul className="mt-2 divide-y border-y">
          {/* ⚠ FR-052 — an in-app privacy policy link is required by BOTH stores. FR-052a — the
              documents behind these links are operator-owned and legally reviewed. */}
          <li>
            <Link
              href="/legal/privacy"
              className="flex min-h-[48px] items-center py-3 text-sm hover:text-foreground/70"
            >
              Privacy policy
            </Link>
          </li>
          <li>
            <Link
              href="/legal/terms"
              className="flex min-h-[48px] items-center py-3 text-sm hover:text-foreground/70"
            >
              Terms of service
            </Link>
          </li>
        </ul>
      </section>

      {/* The LAST item in the tab. */}
      <section aria-labelledby="delete-heading">
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
 * The account's sections (034 FR-006) — the primary navigation for this area.
 *
 * All four are TABS on this page: activating one sets `?tab=` and swaps the content area in place,
 * so managing addresses, security and privacy never leaves the account hub. `aria-current="page"`
 * marks whichever is showing.
 */
function SectionNav({ active }: { active: AccountTab }) {
  const items: {
    tab: AccountTab
    label: string
    hint: string
    Icon: LucideIcon
  }[] = [
    { tab: "personal", label: "Personal info", hint: "Name, phone, email", Icon: User },
    { tab: "addresses", label: "Address book", hint: "Where we deliver", Icon: MapPin },
    { tab: "security", label: "Security", hint: "Password, sign-out", Icon: ShieldCheck },
    { tab: "privacy", label: "Privacy & data", hint: "Export, delete", Icon: FileText },
  ]

  return (
    <nav aria-label="Account settings" className="mt-4">
      <ul className="space-y-1">
        {items.map(({ tab, label, hint, Icon }) => {
          const current = active === tab
          return (
            <li key={tab}>
              <Link
                href={tabHref(tab)}
                aria-current={current ? "page" : undefined}
                className={
                  "flex min-h-[56px] items-center gap-3 rounded-lg px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring " +
                  (current ? "bg-muted font-medium" : "hover:bg-muted/60")
                }
              >
                <Icon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{hint}</span>
                </span>
                <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

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
