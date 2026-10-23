import type { Metadata } from "next"
import Link from "next/link"
import { FileText } from "lucide-react"
import { allDocuments, type DocumentSlug } from "@effy/legal-content"

import { Breadcrumb } from "@/components/ui/misc"

export const metadata: Metadata = {
  title: "Legal",
  description: "Effy's legal and informational documents — privacy, terms, refunds and more.",
}

/**
 * One line on what each document is for, so the index can be chosen from rather than guessed at.
 *
 * A description of the document's subject, never a summary of its terms: the terms are the
 * document's own words, and a paraphrase here would be a second, unversioned set of them.
 */
const ABOUT: Partial<Record<DocumentSlug, string>> = {
  "privacy-policy": "What personal information we collect, why, and how we look after it.",
  "terms-of-service": "The agreement between you and Effy when you use our website and place orders.",
  "refunds-returns": "How refunds work for missing, damaged or unavailable items.",
  "delivery-policy": "Delivery windows, courier delivery, fees and what happens if we miss you.",
  "promotions-terms": "The rules that apply to offers, promo codes and Effy points.",
  "food-safety-allergens": "How we handle food, and what to know about allergens.",
  "cookies-tracking": "The cookies and analytics we use, and how to control them.",
  "acceptable-use": "What is and isn't allowed when using Effy.",
  eula: "The licence for the Effy mobile apps.",
}

const UPDATED = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })

/** The legal index (reference: Help & info · Legal index). */
export default function LegalIndexPage() {
  const docs = allDocuments().filter((d) => d.category === "legal")
  return (
    <div className="container py-10">
      <Breadcrumb className="mb-6" items={[{ label: "Home", href: "/" }, { label: "Legal" }]} />
      <div className="mb-8 space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Legal</h1>
        <p className="text-base text-muted-foreground">Our policies, in plain English where we can.</p>
      </div>
      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {docs.map((doc) => (
          <li key={doc.slug}>
            <Link
              href={`/legal/${doc.slug}`}
              className="flex h-full flex-col gap-6 rounded-lg border bg-card py-6 shadow-xs hover:bg-accent/40"
            >
              <span className="flex flex-col gap-1.5 px-6">
                <FileText aria-hidden="true" className="size-5" />
                <span className="leading-tight font-semibold">{doc.title}</span>
                {ABOUT[doc.slug] && <span className="text-sm text-muted-foreground">{ABOUT[doc.slug]}</span>}
              </span>
              <span className="mt-auto px-6 text-xs text-muted-foreground">
                Version {doc.currentVersion.replace(/^v/, "")} · Updated {UPDATED.format(new Date(doc.effectiveDate))}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-sm text-muted-foreground">
        Every document keeps its earlier versions — open one and choose Version history.{" "}
        <Link href="/about" className="underline underline-offset-2">
          About Effy
        </Link>{" "}
        ·{" "}
        <Link href="/delete-account" className="underline underline-offset-2">
          Deleting your account
        </Link>
      </p>
    </div>
  )
}
