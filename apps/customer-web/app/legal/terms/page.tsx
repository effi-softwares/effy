import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Terms of service",
  description: "The terms on which Effy provides its shopping and delivery service.",
}

/**
 * ⚠ THE ROUTE AND THE SHELL ONLY. THE CONTENT IS OPERATOR-OWNED (034 FR-052a) — see the sibling
 * privacy page for the full argument. Terms are a contract; generated prose would be a liability,
 * not a placeholder.
 */
export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Terms of service</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        This document is being prepared. It will set out the terms on which Effy provides its
        shopping and delivery service.
      </p>
    </main>
  )
}
