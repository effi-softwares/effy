import type { Metadata } from "next"

import { getDocument } from "@effy/legal-content"

import { LegalDocumentView } from "@/components/legal/LegalDocumentView"

export const metadata: Metadata = {
  title: "About Effy",
  description: "Who operates Effy, and how to contact us.",
}

/** Public business-identity & contact page, rendered from the shared 'about' document. */
export default function AboutPage() {
  // Ensure the slug exists at build time (throws → build fails, which is the honest failure mode).
  getDocument("about")
  return <LegalDocumentView slug="about" />
}
