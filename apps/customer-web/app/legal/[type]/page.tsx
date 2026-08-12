import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { allDocuments, getDocument, hasDocument } from "@effy/legal-content"

import { LegalDocumentView } from "@/components/legal/LegalDocumentView"

/**
 * The canonical renderer for every legal document, driven by @effy/legal-content (the single source of
 * truth shared with mobile). Statically generated per slug — public, indexable, non-geofenced, zero
 * client JS (the store + guest-bundle requirements). The words are authored in the shared package, not
 * here (Principle II); this file is the route and the shell only. Unknown slugs are rejected by the
 * `hasDocument` guard below (notFound), so no `dynamicParams` config is needed (nor allowed under
 * Cache Components).
 */
export function generateStaticParams() {
  return allDocuments().map((doc) => ({ type: doc.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ type: string }> }): Promise<Metadata> {
  const { type } = await params
  if (!hasDocument(type)) return {}
  const doc = getDocument(type)
  return { title: doc.title }
}

export default async function LegalDocumentPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params
  if (!hasDocument(type)) notFound()
  return <LegalDocumentView slug={type} />
}
