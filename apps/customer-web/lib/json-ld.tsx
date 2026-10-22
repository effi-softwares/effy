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

import type { StorefrontProductDetailDTO } from "@effy/shared-types"

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

const AVAILABILITY = (available: boolean) => (available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock")

/**
 * The product (098, research R18). One size → a `Product` with its `Offer`. Several sizes → a
 * `ProductGroup` whose `hasVariant` lists each size as a `Product`, each with its own price,
 * availability and a link that opens the page on it (`?variant=`) — Google's documented shape for
 * variants. Built from the page's LIVE read, so it says what the page says.
 */
export function productLd(
  siteUrl: string,
  content: Pick<StorefrontProductDetailDTO, "id" | "name" | "brand" | "imageUrl" | "longDescription">,
  live: Pick<StorefrontProductDetailDTO, "currency" | "options" | "variants">,
): Record<string, unknown> {
  const url = `${siteUrl}/product/${content.id}`
  const base = {
    name: content.name,
    ...(content.brand ? { brand: { "@type": "Brand", name: content.brand } } : {}),
    ...(content.longDescription ? { description: content.longDescription } : {}),
  }
  const offer = (v: StorefrontProductDetailDTO["variants"][number], at: string) => ({
    "@type": "Offer",
    url: at,
    price: v.priceAmount,
    priceCurrency: live.currency,
    availability: AVAILABILITY(v.available),
  })
  if (live.variants.length === 1) {
    const only = live.variants[0]!
    return {
      "@context": "https://schema.org",
      "@type": "Product",
      ...base,
      ...(content.imageUrl ? { image: content.imageUrl } : {}),
      offers: offer(only, url),
    }
  }
  return {
    "@context": "https://schema.org",
    "@type": "ProductGroup",
    ...base,
    productGroupID: content.id,
    url,
    ...(live.options.length > 0 ? { variesBy: live.options.map((o) => o.name) } : {}),
    hasVariant: live.variants.map((v) => {
      const at = `${url}?variant=${v.id}`
      return {
        "@type": "Product",
        name: v.label ? `${content.name} — ${v.label}` : content.name,
        ...((v.imageUrl ?? content.imageUrl) ? { image: v.imageUrl ?? content.imageUrl } : {}),
        offers: offer(v, at),
      }
    }),
  }
}
