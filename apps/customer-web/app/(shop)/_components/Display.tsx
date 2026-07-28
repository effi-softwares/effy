/**
 * Re-export of the shared storefront type primitives.
 *
 * The definitions moved to `components/storefront/kit.tsx` so the account and checkout route groups —
 * which cannot import from `app/(shop)/_components/` — share one vocabulary. This file stays so the
 * storefront's existing imports keep working; there is only ever one implementation.
 */
export { Display, SectionHeading } from "@/components/storefront/kit"
