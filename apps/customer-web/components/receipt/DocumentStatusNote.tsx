import { sellerIdentity } from "@effy/legal-content"

/**
 * What this document IS — and, just as importantly, what it is not (052 FR-032, US5).
 *
 * ── Why this note exists ────────────────────────────────────────────────────────────────────────
 *
 * Effy sells in Australia and prices GST-inclusive, so a shopper may reasonably want this for their
 * own tax records. It is NOT a tax invoice, and saying so plainly is the whole point: a document that
 * looks like one but is not is worse than one that admits it.
 *
 * Two prerequisites stand in the way, and NEITHER is engineering work in this slice — both are
 * recorded in specs/052-order-confirmation-invoice/research.md § R13:
 *
 *   1. ⚠ The ABN is unsupplied. `packages/legal-content/src/identifiers.json` still holds the
 *      fail-loud placeholder `[ABN]`, and the constitution's Real-World Identifiers section forbids
 *      inferring one. Operator input.
 *   2. ⚠ Per-item GST treatment is unmodelled. Basic food is GST-free in Australia, so a grocery
 *      basket is a MIXED SUPPLY — the "total price includes GST" shorthand is FALSE for most Effy
 *      orders, and the "extent to which each sale is taxable" requirement cannot be met from data
 *      that does not exist.
 *
 * ⚠ THE TAX FIELDS ARE ABSENT, NOT BLANK AND NOT PLACEHOLDER (FR-031). This component renders no ABN,
 * no GST amount and no per-line tax indicator. When both prerequisites land, the block slots in here
 * (FR-033) and the wording below changes — the document's structure does not.
 */
export function DocumentStatusNote() {
  const seller = sellerIdentity()
  return (
    <section className="flex items-start gap-3 rounded-xl border bg-muted/40 p-5">
      <svg
        width="17"
        height="17"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
        className="mt-0.5 shrink-0"
      >
        <circle cx="10" cy="10" r="8.2" className="stroke-muted-foreground" strokeWidth="1.5" />
        <path d="M10 9v5" className="stroke-muted-foreground" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="10" cy="6.2" r="1" className="fill-muted-foreground" />
      </svg>
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        This is a record of payment. Prices include GST where it applies. If you need a{" "}
        <span className="font-medium text-foreground">tax invoice</span> for this order, request one at{" "}
        <a
          href={`mailto:${seller.supportEmail}`}
          className="font-medium text-primary hover:underline"
        >
          {seller.supportEmail}
        </a>
        .
      </p>
    </section>
  )
}
