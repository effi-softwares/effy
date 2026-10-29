import { clsx } from "clsx"

import { Skeleton } from "./misc"

/**
 * The storefront's loading shapes. A page that is still reading shows its OWN structure: its real title and
 * every word it already knows (a heading, a field's label, a section's name), with a bone where a value will
 * be — never one tall grey slab. Every Suspense fallback is built from these, inside `Loading`
 * (`skeletons.guard.test.ts`). The bone itself is `@effy/design-system/skeleton.css`, the same rule the
 * consoles use: it waits 120ms before it shows, so a quick read never flashes grey.
 */

const WIDTHS = ["w-3/5", "w-2/5", "w-1/2", "w-3/4", "w-1/3", "w-2/3"] as const
export const boneWidth = (i: number): string => WIDTHS[i % WIDTHS.length]!

const BONE = {
  /** A line of body text. */
  text: "h-4",
  /** A line of small print. */
  small: "h-3",
  /** A page title (24/30). */
  title: "h-8",
  /** A section title. */
  heading: "h-6",
  /** A button or an input (44px). */
  control: "h-11 rounded-md",
  /** A badge. */
  chip: "h-6 w-16",
  /** A price. */
  price: "h-5 w-16",
  /** A product picture: square, the caller sets its size. */
  thumb: "aspect-square rounded-lg",
  /** A banner, a chart, a map: the caller sets the height. */
  block: "w-full rounded-lg",
} as const
export type BoneKind = keyof typeof BONE

export function Bone({ kind = "text", className }: { kind?: BoneKind; className?: string }) {
  return <Skeleton className={clsx(BONE[kind], className)} />
}

/** A paragraph: `count` lines, the last one short. */
export function BoneLines({ count = 2, className }: { count?: number; className?: string }) {
  return (
    <span className={clsx("flex flex-col gap-2", className)}>
      {Array.from({ length: count }, (_, i) => (
        <Bone key={i} className={i === count - 1 && count > 1 ? "w-2/5" : "w-full"} />
      ))}
    </span>
  )
}

/** The live region a fallback is drawn in: one "Loading" for assistive tech, no box of its own. */
export function Loading({ label = "Loading", children }: { label?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" className="contents">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  )
}

/** An account-style page title — the real words when the page knows them, else a bone. */
export function PageTitleSkeleton({
  title,
  description,
  className,
}: {
  title?: string
  /** The fixed line under the title, or `true` for a bone. */
  description?: string | true
  className?: string
}) {
  return (
    <div className={clsx("space-y-1", className)}>
      {title ? (
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      ) : (
        <Bone kind="title" className="w-56" />
      )}
      {description === true ? (
        <Bone className="mt-2 w-72 max-w-full" />
      ) : description ? (
        <p className="text-sm text-muted-foreground">{description}</p>
      ) : null}
    </div>
  )
}

/**
 * Rows divided by rules (settings, list rows, an order's lines): a picture, one or two lines, something on
 * the right. `labels` writes the rows' fixed names above their values.
 */
export function RowsSkeleton({
  rows = 3,
  labels,
  media,
  lines = 2,
  trailing,
  className,
}: {
  rows?: number
  labels?: readonly string[]
  media?: "thumb" | "round"
  lines?: 1 | 2
  trailing?: "control" | "price" | "chip"
  className?: string
}) {
  const n = labels?.length ?? rows
  return (
    <ul className={clsx("divide-y", className)}>
      {Array.from({ length: n }, (_, i) => (
        <li key={i} className="flex min-h-12 items-center gap-4 py-4">
          {media === "thumb" ? <Bone kind="thumb" className="size-16" /> : null}
          {media === "round" ? <Bone className="size-10 rounded-full" /> : null}
          <span className="flex min-w-0 flex-1 flex-col gap-2">
            {labels?.[i] ? (
              <span className="text-sm text-muted-foreground">{labels[i]}</span>
            ) : (
              <Bone className={clsx("max-w-64", boneWidth(i))} />
            )}
            {lines === 2 || labels ? <Bone kind={labels ? "text" : "small"} className={clsx("max-w-48", boneWidth(i + 3))} /> : null}
          </span>
          {trailing === "control" ? <Bone kind="control" className="h-9 w-20" /> : null}
          {trailing === "price" ? <Bone kind="price" /> : null}
          {trailing === "chip" ? <Bone kind="chip" /> : null}
        </li>
      ))}
    </ul>
  )
}

/** Label-over-input fields, then the form's button. */
export function FormSkeleton({
  labels,
  fields = 3,
  submit = true,
  className,
}: {
  labels?: readonly string[]
  fields?: number
  submit?: boolean
  className?: string
}) {
  const n = labels?.length ?? fields
  return (
    <div className={clsx("flex flex-col gap-4", className)}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          {labels?.[i] ? <span className="text-sm font-medium">{labels[i]}</span> : <Bone className="w-28" />}
          <Bone kind="control" className="w-full" />
        </div>
      ))}
      {submit ? <Bone kind="control" className="w-full" /> : null}
    </div>
  )
}
