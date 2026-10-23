import { Card } from "@/components/ui/card"
import { sectionSpacing } from "@/components/storefront/kit"

import { StoreBadges } from "./StoreBadges"

/**
 * "Get the Effy app": the apps are built but unpublished, so the copy says they are coming and the
 * badges link nowhere (no "download now", rating or store URL). Static, so it is in the prerendered
 * shell. One band, copy left, artwork right.
 */
export function AppPromo() {
  return (
    <section className={`container ${sectionSpacing}`}>
      <Card className="flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">The Effy app is on its way</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            We&rsquo;re building Effy for iPhone and Android — the same shop, the same basket, in your
            pocket. It isn&rsquo;t in the stores yet. When it is, it&rsquo;ll be right here.
          </p>
        </div>
        <StoreBadges tone="dark" />
      </Card>
    </section>
  )
}
