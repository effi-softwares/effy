import type { Metadata } from "next"
import Link from "next/link"

import { allDocuments } from "@effy/legal-content"

export const metadata: Metadata = {
  title: "Legal",
  description: "Effy's legal and informational documents — privacy, terms, refunds and more.",
}

/** The /legal index — one place that lists every customer-facing legal & informational document. */
export default function LegalIndexPage() {
  const legal = allDocuments().filter((d) => d.category === "legal")
  const info = allDocuments().filter((d) => d.category === "info")

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Legal</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        The documents that govern your use of Effy, and how we handle your information.
      </p>

      <Section title="Policies & agreements" docs={legal} />
      <Section title="About" docs={info} />

      <section className="mt-10 border-t pt-6">
        <Link href="/delete-account" className="text-sm underline">
          Delete your Effy account
        </Link>
      </section>
    </main>
  )
}

function Section({ title, docs }: { title: string; docs: ReturnType<typeof allDocuments> }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-medium">{title}</h2>
      <ul className="mt-3 divide-y">
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
    </section>
  )
}
