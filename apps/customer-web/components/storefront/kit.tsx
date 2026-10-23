import Link from "next/link"

import { CircleAlert } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { clsx } from "clsx"
import { ActionLink } from "./actions"
import { CatalogImage } from "./CatalogImage"

/**
 * The storefront's shared visual vocabulary: a dense, information-first retail layout (shoppers scan a
 * grocery store rather than browse it). Every colour is a design-system token. It lives in components/
 * so account and checkout, in other route groups, can use it.
 */

/**
 * The page surface is white
 *
 * Both references put the page on white and tint the panels; Effy's default mapping is the inverse
 * `--background` is `#EFEFF1` (a soft grey ground) with white `--card` raised on top.
 *
 * So the storefront inverts the mapping rather than inventing a colour: the page surface is the
 * `card` token (white in light, near-black in dark) and tinted tiles use `muted`. No hex is hardcoded,
 * no token changes value, `tokens:check` is untouched, and dark mode keeps working — a plain
 * `bg-white` would have broken it.
 *
 * If the whole platform should move to a white ground, that is a one-line change to `--background`
 * in tokens.css and a brand decision affecting the two consoles too — not something to smuggle in
 * through the storefront.
 */
export const pageSurface = "bg-card text-foreground"

/* Type */

/**
 * A page or section title.
 *
 * The reference sets these compact and semi-bold — not the oversized display type of a fashion site.
 * Density is the point: a catalog header sits beside a result count and a sort control, and an
 * oversized heading would push the actual controls below the fold.
 */
export function Display({
  as: Tag = "h2",
  size = "section",
  className,
  children,
}: {
  as?: "h1" | "h2" | "h3"
  size?: "hero" | "page" | "section" | "sub"
  className?: string
  children: React.ReactNode
}) {
  return (
    <Tag
      className={clsx(
        "tracking-tight",
        size === "hero" && "text-3xl font-bold leading-tight sm:text-4xl",
        size === "page" && "text-2xl font-semibold sm:text-3xl",
        size === "section" && "text-xl font-semibold",
        size === "sub" && "text-base font-semibold",
        className,
      )}
    >
      {children}
    </Tag>
  )
}

/** The section heading every merchandising title resolves to: centred on small screens, left-aligned from `sm`. `SectionHeader` composes it. */
export function SectionHeading({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    // `normal-case` overrides `Display`'s `uppercase` for section titles only (the hero and `PageHeader`
    // keep capitals), and `leading-tight` gives mixed case room for descenders.
    <Display size="section" className={className}>
      {children}
    </Display>
  )
}

/** The vertical rhythm every storefront section shares: 64px between sections on a phone, 80px on a desktop. */
export const sectionSpacing = "py-6 sm:py-8"

/**
 * A merchandising section header: title on the left, a "see all" link on the right.
 *
 * The reference uses this exact pattern for every product row ("New Products … See All New
 * Products"), which is what lets it stack many rows without them blurring together.
 */
export function SectionHeader({
  title,
  href,
  linkLabel = "See all",
  className,
}: {
  title: string
  href?: string
  linkLabel?: string
  className?: string
}) {
  return (
    // No rule under the title; `mb-6` keeps the separation. Below `sm` the header stacks and centres, the
    // "see all" link on its own row.
    <div
      className={clsx(
        "mb-4 flex items-center justify-between gap-4",
        className,
      )}
    >
      <SectionHeading>{title}</SectionHeading>
      {href && (
        // `min-h-11` = 44px, the platform's web touch-target minimum. It was a 20px-tall inline link
        // — the text's own line box — which is comfortably missable on a phone and was caught by the
        // A11y sweep, not by eye. The extra height is invisible: `items-end` on the parent keeps
        // it optically aligned with the heading's baseline.
        <Link
          href={href}
          className="inline-flex min-h-9 shrink-0 items-center text-sm font-medium text-primary underline underline-offset-4"
        >
          {linkLabel}
        </Link>
      )}
    </div>
  )
}

/** A page header: title, optional count, optional supporting line and trailing controls. */
export function PageHeader({
  title,
  count,
  description,
  children,
}: {
  title: string
  /** Rendered as "(20)" beside the title — the reference puts the result count in the heading. */
  count?: number
  description?: string
  children?: React.ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <Display as="h1" size="page">
          {title}
          {typeof count === "number" && (
            <span className="ml-2 text-base font-normal tracking-normal text-muted-foreground">· {count}</span>
          )}
        </Display>
        {description && <p className="mt-1 max-w-xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  )
}

/* Surfaces */

export function Rule({ className }: { className?: string }) {
  return <hr className={clsx("border-border", className)} />
}

/* Actions */

/**
 * The storefront button system lives in `./actions` (a `next/image`-free module) and is re-exported
 * here so existing `from ".../kit"` imports keep working. Guest routes must import from `./actions`
 * directly, not from here — importing a button through `kit` drags `MediaFrame` and its picture code into
 * the chunk, which is exactly what pushed `/search` over the 174 KB gate. See the note in `actions.tsx`.
 */
export { btnClass, iconBtnClass, ActionLink, ActionButton } from "./actions"
export type { BtnVariant, BtnSize } from "./actions"

/* Form controls */

// The strings live in `./fields` (next/image-free) — client components import them from there.
export { input, select } from "./fields"

export function Field({
  label,
  htmlFor,
  error,
  hint,
  labelAction,
  children,
}: {
  label: string
  htmlFor?: string
  error?: string | null
  hint?: string
  /** A link that belongs to this field and sits at the end of its label row ("Forgot your password?"). */
  labelAction?: React.ReactNode
  children: React.ReactNode
}) {
  const labelEl = (
    <label htmlFor={htmlFor} className="text-sm font-medium leading-none">
      {label}
    </label>
  )
  return (
    <div className="flex flex-col gap-2">
      {labelAction ? (
        <div className="flex items-center justify-between gap-3">
          {labelEl}
          {labelAction}
        </div>
      ) : (
        labelEl
      )}
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p role="alert" className="flex items-start gap-1.5 text-xs font-medium text-destructive">
          <CircleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}

/* States */

/**
 * Every empty state explains itself in plain language and offers at least one recovery
 * path. A dead end is never acceptable — least of all on a page a shopper reached by accident.
 */
export function EmptyState({
  title,
  description,
  action,
  icon: Icon,
  className,
}: {
  title: string
  description?: string
  action?: { label: string; href: string }
  /** The reference's empty states lead with a glyph in a muted tile. */
  icon?: LucideIcon
  className?: string
}) {
  return (
    <div
      className={clsx(
        "sf-empty-state",
        className,
      )}
    >
      {Icon && (
        <span className="mb-2 grid size-12 place-items-center rounded-lg bg-muted">
          <Icon aria-hidden="true" className="size-6" />
        </span>
      )}
      <h2 className="text-xl font-semibold">{title}</h2>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && (
        <ActionLink href={action.href} variant="primary" size="md" className="mt-2">
          {action.label}
        </ActionLink>
      )}
    </div>
  )
}

/**
 * A fixed-ratio image box that cannot render a broken frame: the ratio is on the container, so the
 * placeholder and the photograph take the same space and nothing shifts. A null `src` is a supported
 * state (no artwork yet, no category photo), drawn as a `muted` placeholder.
 */
export function MediaFrame({
  src,
  alt,
  ratio = "square",
  /** Shown centred in the placeholder when there is no image — typically a category's initial. */
  fallbackLabel,
  sizes,
  widths,
  priority = false,
  rounded = "rounded-lg",
  className,
  children,
}: {
  src: string | null | undefined
  /** Empty string when the image is decorative and the surrounding text already names it. */
  alt: string
  ratio?: "square" | "video" | "wide" | "portrait" | "banner"
  fallbackLabel?: string
  sizes?: string
  /** The picture's smaller copies (`imageWidths` from its DTO). */
  widths?: readonly number[]
  priority?: boolean
  rounded?: string
  className?: string
  /** Overlaid content — a Scrim and its text. Rendered above the image in both states. */
  children?: React.ReactNode
}) {
  return (
    <div
      className={clsx(
        "sf-media-frame",
        ratio === "square" && "aspect-square",
        ratio === "video" && "aspect-video",
        ratio === "wide" && "aspect-3/2",
        ratio === "portrait" && "aspect-4/5",
        ratio === "banner" && "aspect-2/1",
        rounded,
        className,
      )}
    >
      {src ? (
        <CatalogImage src={src} widths={widths} alt={alt} fill sizes={sizes ?? "100vw"} priority={priority} className="object-cover" />
      ) : (
        <div
          aria-hidden="true"
          className="flex h-full w-full items-center justify-center bg-muted text-2xl font-semibold text-muted-foreground/60"
        >
          {fallbackLabel}
        </div>
      )}
      {children}
    </div>
  )
}

/**
 * The overlay that makes text legible over artwork. The one storefront colour that must not invert: the
 * artwork is the same picture in both appearances, so a fixed dark veil with fixed light type is right in
 * both. Vertical, strongest where the bottom-anchored title sits.
 */
export function Scrim({
  strength = "standard",
  className,
}: {
  /** `strong` for small text over busy artwork; `standard` matches the existing carousel. */
  strength?: "standard" | "strong"
  className?: string
}) {
  return (
    <div
      aria-hidden="true"
      className={clsx(
        "absolute inset-0 bg-linear-to-t",
        strength === "standard" && "from-black/70 to-black/10",
        strength === "strong" && "from-black/85 via-black/50 to-black/20",
        className,
      )}
    />
  )
}

/**
 * Type colours on artwork, fixed in both appearances (see `Scrim`): `onScrim` (white) pairs with a
 * `Scrim`; `onLightScrim` (black) is for artwork whose text zone is already pale.
 */
export const onScrim = "text-white"
export const onLightScrim = "text-black"

/**
 * A page section: the standard container, rhythm, heading level and optional "view all".
 *
 * It renders nothing when it has nothing. Self-hiding is the single rule every section
 * on this page shares, and repeating `if (!items.length) return null` in eight components is how one of
 * them eventually forgets and ships an empty frame. Putting it in the shell makes the rule structural.
 *
 * The heading is an `h2`, always. The page has exactly one `h1` (the sr-only page title), and a
 * section that picked its own level would break the outline.
 */
export function SectionShell({
  title,
  href,
  linkLabel = "View all",
  /** Set when the section's own content already carries a heading, or it is purely decorative. */
  headless = false,
  className,
  children,
}: {
  title?: string
  href?: string
  linkLabel?: string
  headless?: boolean
  className?: string
  children?: React.ReactNode
}) {
  if (isEmptyContent(children)) return null

  return (
    <section className={clsx("container", sectionSpacing, className)}>
      {!headless && title && <SectionHeader title={title} href={href} linkLabel={linkLabel} />}
      {children}
    </section>
  )
}

/** Whether `children` renders nothing: `[]` and `[false, null]` are truthy, so `!children` would draw an empty section. */
function isEmptyContent(children: React.ReactNode): boolean {
  if (children === null || children === undefined || children === false || children === "") return true
  if (Array.isArray(children)) return children.every((c) => isEmptyContent(c as React.ReactNode))
  return false
}
