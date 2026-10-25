import { sellerIdentity } from "@effy/legal-content"

/**
 * What this document is and is not: a receipt, not a tax invoice (a tax invoice is requested separately
 * from the order). No ABN, GST amount or per-line tax indicator appears here.
 */
export function DocumentStatusNote() {
  const seller = sellerIdentity()
  return (
    <section className="flex items-start gap-3 rounded-lg border bg-muted/40 p-5">
      <svg
        width="17"
        height="17"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
        className="mt-1 shrink-0"
      >
        <circle cx="10" cy="10" r="8.2" className="stroke-muted-foreground" strokeWidth="1.5" />
        <path d="M10 9v5" className="stroke-muted-foreground" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="10" cy="6.2" r="1" className="fill-muted-foreground" />
      </svg>
      <p className="text-sm leading-relaxed text-muted-foreground">
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
