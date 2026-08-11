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
  User,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

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
 * The account page (012, re-laid-out 2026-08-11).
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
 * LAYOUT — the settings two-column pattern (Amazon "Login & Security", GitHub, Stripe): a sticky
 * sidebar carrying identity + section navigation, and a main column for the section being viewed.
 * The old page was a narrow `max-w-2xl` centred column that left the page mostly empty on anything
 * wider than a phone; this spends the horizontal space the storefront `.container` already gives us.
 */
export default function AccountPage() {
  return (
    <div className="container py-6 sm:py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Your account</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage your details, addresses and how you sign in.
      </p>

      <Suspense fallback={<AccountSkeleton />}>
        <AccountBody />
      </Suspense>
    </div>
  )
}

async function AccountBody() {
  const customer = await requireCustomer("/account")
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
        <SectionNav />
      </aside>

      <main className="min-w-0 space-y-6">
        {/*
          ⚠ FIRST, ABOVE EVERYTHING (037 FR-030). If the platform cannot email this person, that is the
          most important thing on the page — it means their sign-in codes, receipts and security
          notices are silently going nowhere. Renders nothing at all in the common case.
        */}
        <EmailDeliveryNotice state={customer.emailDelivery} email={customer.email} />

        {/* Shortcut tiles — the three things a customer actually opens their account to reach. They
            fill the top of the main column (which was empty) and turn the page into a hub rather than
            a single form. Navigational only; no per-customer data is fetched for them. */}
        <QuickLinks />

        {/* ⚠ 034 FR-007 — NO SIGN-OUT CONTROL ON THIS PAGE, and no password card either. Both live at
            /account/security. Sign out used to sit one careless click away from ordinary navigation. */}
        <PersonalInfo
          givenName={customer.givenName}
          familyName={customer.familyName}
          phone={customer.phone}
          email={customer.email}
        />
      </main>
    </div>
  )
}

/** Navigational shortcut tiles to the customer's most-used destinations. */
function QuickLinks() {
  const tiles: { href: string; label: string; hint: string; Icon: LucideIcon }[] = [
    { href: "/orders", label: "Orders", hint: "Track & reorder", Icon: ShoppingBag },
    { href: "/saved", label: "Saved items", hint: "Your watchlist", Icon: Heart },
    { href: "/addresses", label: "Address book", hint: "Where we deliver", Icon: MapPin },
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

/** The account's sections (034 FR-006) — the primary navigation for this area, grouped as one list. */
function SectionNav() {
  const items = [
    { href: "/account", label: "Personal info", hint: "Name, phone, email", Icon: User, current: true },
    { href: "/addresses", label: "Address book", hint: "Where we deliver", Icon: MapPin },
    { href: "/account/security", label: "Security", hint: "Password, sign-out", Icon: ShieldCheck },
    { href: "/account/privacy", label: "Privacy & data", hint: "Export, delete", Icon: FileText },
  ]

  return (
    <nav aria-label="Account settings" className="mt-4">
      <ul className="space-y-1">
        {items.map(({ href, label, hint, Icon, current }) => (
          <li key={href}>
            <Link
              href={href}
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
        ))}
      </ul>
    </nav>
  )
}

function AccountSkeleton() {
  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)]" aria-hidden="true">
      <div className="space-y-4">
        <div className="h-52 w-full animate-pulse rounded-xl bg-muted" />
        <div className="h-56 w-full animate-pulse rounded-xl bg-muted" />
      </div>
      <div className="h-80 w-full animate-pulse rounded-xl bg-muted" />
    </div>
  )
}
