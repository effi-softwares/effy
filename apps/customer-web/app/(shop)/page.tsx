import type { Metadata } from "next"
import Link from "next/link"

import { JsonLd, organizationLd } from "@/lib/json-ld"
import { siteUrl } from "@/lib/config"

export const metadata: Metadata = {
  title: "Effy — groceries, delivered",
  description:
    "Shop fresh groceries and everyday essentials from Effy. Browse without an account; sign in only when you order.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Effy — groceries, delivered",
    description:
      "Shop fresh groceries and everyday essentials from Effy, delivered to your door.",
    url: "/",
  },
}

/**
 * The storefront home page.
 *
 * GUEST-FIRST (FR-001): fully usable with no account, and it never asks for one. There is no
 * sign-in wall and nothing degrades for being signed out.
 *
 * The content below is present in the server-rendered HTML — a crawler that executes no
 * JavaScript sees exactly what a shopper sees (FR-002, FR-008, SC-004). That is asserted by
 * e2e/ssr-seo.spec.ts, which fetches the raw response and greps it.
 */
export default function HomePage() {
  return (
    <>
      <JsonLd data={organizationLd(siteUrl())} />

      <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Groceries, delivered.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted-foreground">
          Fresh food and everyday essentials, brought to your door. Browse freely — you only
          need an account when you order.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/browse"
            className="inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Start browsing
          </Link>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 pb-24 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight">Why Effy</h2>
        <ul className="mt-6 grid gap-6 sm:grid-cols-3">
          {[
            {
              title: "Fast delivery",
              body: "Fulfilled from the location closest to you — you never have to pick one.",
            },
            {
              title: "No account needed to look",
              body: "Browse the whole store as a guest. We ask who you are only at checkout.",
            },
            {
              title: "One brand, one standard",
              body: "Every order comes from Effy. No third-party sellers, no surprises.",
            },
          ].map((f) => (
            <li key={f.title} className="rounded-lg border p-6">
              <h3 className="font-medium">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
