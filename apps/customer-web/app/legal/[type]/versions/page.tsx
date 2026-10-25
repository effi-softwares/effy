import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { allDocuments, getDocument, hasDocument } from "@effy/legal-content"

import { btnClass } from "@/components/storefront/actions"
import { Badge } from "@/components/ui/badge"
import { Breadcrumb } from "@/components/ui/misc"

export function generateStaticParams() {
  return allDocuments().map((doc) => ({ type: doc.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ type: string }> }): Promise<Metadata> {
  const { type } = await params
  if (!hasDocument(type)) return {}
  return { title: `${getDocument(type).title} — version history` }
}

/** Version history for a document. At first publish only v1 exists, so this states that plainly. */
const EFFECTIVE = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })

/**
 * Every published version of one document, newest first (reference: Help & info · Previous versions).
 *
 * No "what changed" column: a version records its text and its date, and a summary written here
 * would be ours, not the document's.
 */
export default async function LegalVersionsPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params
  if (!hasDocument(type)) notFound()
  const doc = getDocument(type)

  return (
    <div className="container py-10">
      <Breadcrumb
        className="mb-6"
        items={[
          { label: "Home", href: "/" },
          { label: "Legal", href: "/legal" },
          { label: doc.title, href: `/legal/${doc.slug}` },
          { label: "Versions" },
        ]}
      />
      <div className="mb-6 space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{doc.title} — versions</h1>
        <p className="text-base text-muted-foreground">Every version we&apos;ve published, newest first.</p>
      </div>
      <div className="rounded-lg border bg-card px-4 py-2 shadow-xs sm:px-6">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th scope="col" className="h-10 px-2 text-left font-medium">Version</th>
              <th scope="col" className="h-10 px-2 text-left font-medium">Effective</th>
              <th scope="col" className="h-10 px-2"><span className="sr-only">Status</span></th>
              <th scope="col" className="h-10 px-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {doc.versions.map((v) => (
              <tr key={v.version} className="border-b last:border-b-0">
                <td className="px-2 py-3 font-medium">Version {v.version.replace(/^v/, "")}</td>
                <td className="px-2 py-3">{EFFECTIVE.format(new Date(v.effectiveDate))}</td>
                <td className="px-2 py-3">{v.status === "current" && <Badge variant="brand">Current</Badge>}</td>
                <td className="px-2 py-3 text-right">
                  <Link
                    href={v.status === "current" ? `/legal/${doc.slug}` : `/legal/${doc.slug}/versions/${v.version}`}
                    className={btnClass("ghost", "sm")}
                  >
                    View<span className="sr-only"> version {v.version.replace(/^v/, "")}</span>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
