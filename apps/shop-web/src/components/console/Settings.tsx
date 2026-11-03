import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * The settings pages' one layout: each section is a ruled band, its title and a sentence on the left, its controls on
 * the right (stacked below 1024px). Rows inside a `SettingsList` share one border, so a page reads as a few lists, not
 * a stack of boxes.
 */
export function SettingsPage({ children }: { children: ReactNode }) {
  return <div className="grid max-w-5xl gap-0">{children}</div>
}

export function SettingsSection({
  title,
  description,
  children,
}: {
  title: ReactNode
  description: ReactNode
  children: ReactNode
}) {
  return (
    <section className="grid gap-x-10 gap-y-4 border-t py-8 first:border-t-0 first:pt-2 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
      <div className="grid content-start gap-1">
        <h2 className="text-base leading-6 font-semibold">{title}</h2>
        <p className="text-sm text-pretty text-muted-foreground">{description}</p>
      </div>
      <div className="grid min-w-0 content-start gap-3">{children}</div>
    </section>
  )
}

export function SettingsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("divide-y overflow-hidden rounded-lg border bg-card text-card-foreground", className)}>
      {children}
    </div>
  )
}

/** A row: what it is (and a line of help), the control on the right; below 640px the control drops under. */
export function SettingsRow({
  label,
  hint,
  htmlFor,
  leading,
  children,
  className,
}: {
  label: ReactNode
  hint?: ReactNode
  htmlFor?: string
  leading?: ReactNode
  children?: ReactNode
  className?: string
}) {
  const Title = htmlFor ? "label" : "div"
  return (
    <div className={cn("flex min-h-16 flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3", className)}>
      {leading}
      <div className="grid min-w-0 flex-[1_1_16rem] gap-0.5">
        <Title htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </Title>
        {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  )
}

/** A small heading inside a list, naming the rows under it. */
export function SettingsListHeading({ children }: { children: ReactNode }) {
  return (
    <div className="bg-muted/50 px-4 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
      {children}
    </div>
  )
}

/** The square icon tile a row leads with. */
export function SettingsIcon({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "on" | "off" }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-lg [&_svg]:size-5",
        tone === "on" && "bg-success-soft text-success",
        tone === "off" && "bg-destructive-soft text-destructive",
        tone === "muted" && "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  )
}
