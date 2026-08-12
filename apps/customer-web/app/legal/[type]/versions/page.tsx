import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { allDocuments, getDocument, hasDocument } from "@effy/legal-content"

export function generateStaticParams() {
  return allDocuments().map((doc) => ({ type: doc.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ type: string }> }): Promise<Metadata> {
  const { type } = await params
  if (!hasDocument(type)) return {}
  return { title: `${getDocument(type).title} — version history` }
}

/** Version history for a document. At first publish only v1 exists, so this states that plainly. */
export default async function LegalVersionsPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params
  if (!hasDocument(type)) notFound()
  const doc = getDocument(type)

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">{doc.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Version history</p>
      <p className="mt-4 text-sm">
        <Link href={`/legal/${doc.slug}`} className="underline">
          ← Back to the current version
        </Link>
      </p>

      {doc.versions.length === 1 ? (
        <p className="mt-8 text-sm text-muted-foreground">
          This is the first version of this document, effective {doc.effectiveDate}.
        </p>
      ) : (
        <ul className="mt-8 divide-y">
          {doc.versions.map((v) => (
            <li key={v.version} className="flex items-center justify-between py-3 text-sm">
              <span>
                Version {v.version}
                {v.status === "current" && (
                  <span className="ml-2 rounded bg-foreground px-1.5 py-0.5 text-xs text-background">Current</span>
                )}
              </span>
              <span className="text-xs text-muted-foreground">Effective {v.effectiveDate}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
