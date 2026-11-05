import type { ReactNode } from "react"

import { cn } from "@effy/design-system"

/** A heading and a hairline rule, never a card. `actions` sit at the right of the heading. */
export function BoardSection({
  id,
  title,
  description,
  actions,
  tour,
  order,
  className,
  children,
}: {
  id: string
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  tour?: string
  /** Where it goes when the two columns fold into one (what needs you first). */
  order?: number
  className?: string
  children: ReactNode
}) {
  return (
    <section aria-labelledby={id} data-tour={tour} data-order={order} className={cn("min-w-0", className)}>
      <div className="mb-2.5 flex min-h-9 flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <h2 id={id} className="text-[15px] leading-6 font-semibold">
          {title}
        </h2>
        {actions ? <div className="ml-auto flex items-center gap-1.5">{actions}</div> : null}
        {description ? <p className="order-3 -mt-1 basis-full text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  )
}

/** A read that did not answer: said plainly, never shown as good news. */
export function CouldNotLoad({ what }: { what: string }) {
  return <p className="border-t py-3.5 text-sm text-muted-foreground">Couldn’t load {what}. It comes back on its own when it can be read.</p>
}
