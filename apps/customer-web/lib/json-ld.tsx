/**
 * Structured data (JSON-LD) — how search engines understand the storefront.
 *
 * Rendered as a NATIVE <script> tag from a Server Component, never via `next/script`. The Next
 * docs are explicit about this: "Since JSON-LD is structured data, not executable code, a
 * native `<script>` tag is the right choice." It costs zero client JavaScript.
 *
 * ⚠ The `.replace(/</g, "\\u003c")` below is not decoration. Any string that ends up in this
 * payload could otherwise close the <script> tag and inject markup — once a catalog exists,
 * product names and descriptions come from the database and are therefore untrusted input on a
 * page served to the entire internet.
 *
 * ⚠ Structured data MUST match what the page visibly says. Claiming `InStock` in JSON-LD while
 * the page shows "out of stock" is a Google policy violation, not a cosmetic mismatch. When the
 * catalog slice adds Product/Offer, emit price and availability from the SAME component that
 * renders them.
 */

export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  )
}

export function organizationLd(siteUrl: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Effy",
    url: siteUrl,
    description:
      "Effy delivers fresh groceries and everyday essentials to your door.",
  }
}

export function breadcrumbLd(
  siteUrl: string,
  trail: ReadonlyArray<{ name: string; path: string }>,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: `${siteUrl}${crumb.path}`,
    })),
  }
}
