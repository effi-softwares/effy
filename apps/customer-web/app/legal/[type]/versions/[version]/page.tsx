import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { allDocuments, getDocument, hasDocument } from "@effy/legal-content"

import { LegalDocumentView } from "@/components/legal/LegalDocumentView"

/** One earlier version of a document, as it was published. Never indexed: it is not the text in force. */
export function generateStaticParams() {
  return allDocuments().flatMap((doc) => doc.versions.map((v) => ({ type: doc.slug, version: v.version })))
}

export async function generateMetadata({ params }: { params: Promise<{ type: string; version: string }> }): Promise<Metadata> {
  const { type, version } = await params
  if (!hasDocument(type)) return {}
  return { title: `${getDocument(type).title} - version ${version}`, robots: { index: false, follow: true } }
}

export default async function LegalVersionPage({ params }: { params: Promise<{ type: string; version: string }> }) {
  const { type, version } = await params
  if (!hasDocument(type)) notFound()
  return <LegalDocumentView slug={type} version={version} />
}
