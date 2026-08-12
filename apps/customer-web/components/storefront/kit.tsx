import Image from "next/image"
import Link from "next/link"

import { cn } from "@/lib/utils"
import { ActionLink } from "./actions"

/**
 * The storefront's shared visual vocabulary (025 UI refresh).
 *
 * ── Reference ───────────────────────────────────────────────────────────────────────────────────
 *
 * Structure comes from the tech-store reference template: a dense, information-first retail layout —
 * utility bar, category nav, faceted catalog with counts, compact product rows, value-prop strip,
 * dark footer. That density is the right register for Effy: a grocery store is high-SKU and
 * price-sensitive, and shoppers SCAN it rather than browse it. The constitution's own reference pair
 * is "Uber Eats + eBay"; this is the eBay half, which the storefront previously had none of.
 *
 * ── Colour ──────────────────────────────────────────────────────────────────────────────────────
 *
 * The reference is blue-accented. Effy is MONOCHROME — a neutral ramp with no brand hue, whose accent
 * inverts between appearances (constitution v1.11.0, Principle V) — and `check-tokens` fails the build
 * on a stray value, so every colour here resolves to a design-system token. The template supplies
 * STRUCTURE; the palette stays Effy's.
 *
 * ── Why this lives in components/ rather than app/(shop)/_components/ ───────────────────────────
 *
 * Account and checkout sit in different route groups and cannot import from the storefront's private
 * folder. Putting the vocabulary here is what stops "half the site is redesigned" from becoming the
 * permanent state.
 */

/**
 * ── THE PAGE SURFACE IS WHITE ───────────────────────────────────────────────────────────────────
 *
 * Both references put the page on WHITE and tint the panels; Effy's default mapping is the inverse —
 * `--background` is `#EFEFF1` (a soft grey ground) with white `--card` raised on top.
 *
 * So the storefront INVERTS the mapping rather than inventing a colour: the page surface is the
 * `card` token (white in light, `#262626` in dark) and tinted tiles use `muted`. No hex is hardcoded,
 * no token changes value, `tokens:check` is untouched, and dark mode keeps working — a plain
 * `bg-white` would have broken it.
 *
 * ⚠ If the whole PLATFORM should move to a white ground, that is a one-line change to `--background`
 * in tokens.css and a brand decision affecting the two consoles too — not something to smuggle in
 * through the storefront.
 */
export const pageSurface = "bg-card text-foreground"

/* ── Type ────────────────────────────────────────────────────────────────────────────────────── */

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
      className={cn(
        "font-extrabold uppercase leading-[0.95] tracking-[-0.02em]",
        size === "hero" && "text-[2.5rem] sm:text-[3.25rem] lg:text-[4rem]",
        size === "page" && "text-[2rem] sm:text-[2.5rem]",
        size === "section" && "text-[1.75rem] sm:text-[2.25rem]",
        size === "sub" && "text-xl sm:text-2xl",
        className,
      )}
    >
      {children}
    </Tag>
  )
}

/**
 * THE section heading — every merchandising section title on the storefront resolves to this.
 *
 * ⚠ CENTRED ON SMALL SCREENS, LEFT-ALIGNED FROM `sm` UP (operator direction, 2026-08-09). It replaces
 * `CenteredHeading`, which centred at every width — the rename is deliberate rather than a behaviour
 * change hidden behind an unchanged name, since a component called `CenteredHeading` that is not
 * always centred is a trap for the next caller.
 *
 * ⚠ ONE DEFINITION, so the alignment cannot drift between section types. `SectionHeader` (title plus
 * a "see all" link) composes this rather than restating `text-center sm:text-left`; a second copy is
 * how the rails and the panels end up disagreeing at one breakpoint and nobody notices.
 */
export function SectionHeading({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    // ⚠ `normal-case` OVERRIDES `Display`'s base `uppercase` (operator direction, 2026-08-09), and it
    // is scoped to section titles ON PURPOSE — the hero and the page-level `PageHeader` keep their
    // uppercase display treatment, where the all-caps poster look is the point. Removing it from
    // `Display` itself would have changed all three at once.
    //
    // ⚠ `leading-tight` comes with it. `Display`'s 0.95 leading is tuned for capitals, which have no
    // descenders; in mixed case the g/p/y of "Shop by category" hang below a line box that is shorter
    // than the type itself.
    <Display size="section" className={cn("normal-case leading-tight text-center sm:text-left", className)}>
      {children}
    </Display>
  )
}

/**
 * The vertical rhythm every storefront section shares.
 *
 * ⚠ A CONSTANT BECAUSE IT HAD ALREADY DRIFTED. `SectionShell` used `py-10 sm:py-14` while
 * `ProductRail`, `AppPromo` and `NewsletterForm` each wrote `py-12 sm:py-16` — so the gap between the
 * category strip and the first rail was visibly smaller than the gap between two rails, and no single
 * file was obviously wrong. Same reasoning as `productGrid`: one decision, one definition.
 *
 * Halved from the largest of those (operator direction) — 64px between sections on a phone and 80px
 * on a desktop, down from 96/128.
 */
export const sectionSpacing = "py-8 sm:py-10"

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
    // ⚠ NO BOTTOM BORDER (operator direction, 2026-08-09). It was `border-b pb-3`, a rule under every
    // section title. `mb-6` replaces the separation the border and its padding provided, so removing
    // it does not close the gap between a heading and its content.
    //
    // ⚠ STACKED AND CENTRED BELOW `sm`, a row above it. Centring the title while leaving the "see all"
    // link pinned right would read as a mistake, so the whole header switches axis together — which is
    // also why the link is a full row of its own on a phone rather than a corner target.
    <div
      className={cn(
        "mb-6 flex flex-col items-center gap-2",
        "sm:flex-row sm:items-end sm:justify-between sm:gap-4",
        className,
      )}
    >
      <SectionHeading>{title}</SectionHeading>
      {href && (
        // ⚠ `min-h-11` = 44px, the platform's web touch-target minimum. It was a 20px-tall inline link
        // — the text's own line box — which is comfortably missable on a phone and was caught by the
        // 039 a11y sweep, not by eye. The extra height is invisible: `items-end` on the parent keeps
        // it optically aligned with the heading's baseline.
        <Link
          href={href}
          className="inline-flex min-h-11 shrink-0 items-center text-sm text-primary hover:underline"
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
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <Display as="h1" size="page">
          {title}
          {typeof count === "number" && (
            <span className="ml-2 font-normal text-muted-foreground">({count})</span>
          )}
        </Display>
        {description && <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  )
}

/* ── Surfaces ────────────────────────────────────────────────────────────────────────────────── */

export function Rule({ className }: { className?: string }) {
  return <hr className={cn("border-border", className)} />
}

/* ── Actions ─────────────────────────────────────────────────────────────────────────────────── */

/**
 * The storefront button system lives in `./actions` (a `next/image`-free module) and is re-exported
 * here so existing `from ".../kit"` imports keep working. ⚠ GUEST ROUTES MUST IMPORT FROM `./actions`
 * DIRECTLY, not from here — importing a button through `kit` drags `MediaFrame`'s `next/image` into
 * the chunk, which is exactly what pushed `/search` over the 174 KB gate. See the note in `actions.tsx`.
 */
export { btnClass, ActionLink, ActionButton } from "./actions"
export type { BtnVariant, BtnSize } from "./actions"

/* ── Form controls ───────────────────────────────────────────────────────────────────────────── */

// ⚠ Focus is the BORDER changing to `--ring`, matching `@effy/design-system/ui` Input — NOT the old
// `outline-primary` halo these carried, which was a third focus treatment on a platform whose shared
// fields dropped the halo (operator direction). `bg-card` (not the shared Input's transparent) is
// deliberate: the storefront page surface is white `--card`, so a field reads as inset on it.
export const input =
  "h-11 w-full rounded-full border border-input bg-card px-4 text-sm placeholder:text-muted-foreground outline-none transition-[color,box-shadow] focus-visible:border-ring aria-invalid:border-destructive"

export const select =
  "h-11 rounded-full border border-input bg-card px-4 text-sm outline-none transition-[color,box-shadow] focus-visible:border-ring aria-invalid:border-destructive"

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string
  htmlFor?: string
  error?: string | null
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

/* ── States ──────────────────────────────────────────────────────────────────────────────────── */

/**
 * FR-021/FR-044: every empty state explains itself in plain language and offers at least one recovery
 * path. A dead end is never acceptable — least of all on a page a shopper reached by accident.
 */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string
  description?: string
  action?: { label: string; href: string }
  className?: string
}) {
  return (
    <div className={cn("rounded-2xl border border-dashed px-6 py-14 text-center", className)}>
      <h2 className="text-base font-semibold">{title}</h2>
      {description && (
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && (
        <ActionLink href={action.href} variant="outline" size="md" className="mt-6">
          {action.label}
        </ActionLink>
      )}
    </div>
  )
}

/* ── Merchandised-landing primitives (039) ───────────────────────────────────────────────────── */

/**
 * A fixed-ratio image box that CANNOT render a broken frame (039 FR-011/FR-014/FR-018).
 *
 * ⚠ THE BOX IS RESERVED BEFORE THE PIXELS ARRIVE. The aspect ratio is set on the container, not
 * inferred from the image, so the placeholder and the photograph occupy exactly the same space. That
 * is the whole of SC-001's "no layout shift when the hero art loads" — there is no shift because
 * nothing ever resizes.
 *
 * ⚠ A null `src` is a SUPPORTED STATE, not an error path. Three different callers need it for three
 * different reasons — the hero before the operator supplies artwork, a category the catalogue has no
 * photograph for, a promotion authored without one — and every one of them previously would have had
 * to remember to write its own fallback. 028 shipped a placeholder that only ran when the URL was
 * null and did nothing while the image loaded; the fix is to make absence the container's business
 * rather than each caller's.
 *
 * The placeholder is `muted` on `muted-foreground` — both ramp tokens, so it is correct in both
 * appearances by construction and adds nothing for `check-tokens` to find.
 */
export function MediaFrame({
  src,
  alt,
  ratio = "square",
  /** Shown centred in the placeholder when there is no image — typically a category's initial. */
  fallbackLabel,
  sizes,
  priority = false,
  rounded = "rounded-2xl",
  className,
  children,
}: {
  src: string | null | undefined
  /** Empty string when the image is decorative and the surrounding text already names it. */
  alt: string
  ratio?: "square" | "video" | "wide" | "portrait" | "banner"
  fallbackLabel?: string
  sizes?: string
  priority?: boolean
  rounded?: string
  className?: string
  /** Overlaid content — a Scrim and its text. Rendered above the image in both states. */
  children?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden bg-muted",
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
        <Image
          src={src}
          alt={alt}
          fill
          unoptimized
          sizes={sizes}
          priority={priority}
          className="object-cover"
        />
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
 * The overlay that makes text legible over ARBITRARY artwork (039 FR-007).
 *
 * ⚠ THIS IS THE ONE PLACE ON THE STOREFRONT WHERE A COLOUR MUST NOT INVERT, and that is not an
 * oversight — it is 029's post-mortem written down as code. The scrim there was `colorScheme.surface`,
 * so light mode bleached the photograph and put dark type on a white film over a busy image. The real
 * error was deeper than the token choice: **the artwork is the same picture in both appearances**, so
 * the thing guaranteeing contrast over it cannot be the thing that flips. A fixed dark veil with fixed
 * light type is correct in both modes precisely because it ignores both.
 *
 * ⚠ Vertical, not diagonal. 029's gradient ran bottom-left→top-right, leaving it weakest exactly where
 * the bottom-anchored title sat.
 *
 * Black and white are the ends of the monochrome ramp (`#1A1A1A`…`#FFFFFF`), so this introduces no hue
 * and nothing for the colour guards to catch — the same technique `PromoCarousel` already uses.
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
      className={cn(
        "absolute inset-0 bg-linear-to-t",
        strength === "standard" && "from-black/70 to-black/10",
        strength === "strong" && "from-black/85 via-black/50 to-black/20",
        className,
      )}
    />
  )
}

/**
 * Type colours that sit on ARTWORK — fixed in both appearances, for the reason `Scrim` documents at
 * length: the photograph underneath does not invert, so the type over it must not either.
 *
 * `onScrim` (white) pairs with a `Scrim`. `onLightScrim` (black) is for artwork whose text zone is
 * already pale — a **controlled zone** rather than a veil, which is FR-007's other limb.
 *
 * ⚠ A `tone="light"` gradient briefly existed here for the hero and was removed with it (operator
 * decision — the veil faded the artwork). It is not kept "in case": an unused variant of a
 * legibility primitive is worse than no variant, because the next person assumes it is the tested path.
 * Both are ends of the monochrome ramp, so neither introduces a hue.
 */
export const onScrim = "text-white"
export const onLightScrim = "text-black"

/**
 * A page section: the standard container, rhythm, heading level and optional "view all".
 *
 * ⚠ IT RENDERS NOTHING WHEN IT HAS NOTHING (039 FR-004). Self-hiding is the single rule every section
 * on this page shares, and repeating `if (!items.length) return null` in eight components is how one of
 * them eventually forgets and ships an empty frame. Putting it in the shell makes the rule structural.
 *
 * ⚠ The heading is an `h2`, always. The page has exactly one `h1` (the sr-only page title), and a
 * section that picked its own level would break the outline (SC-009).
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
    <section className={cn("container", sectionSpacing, className)}>
      {!headless && title && <SectionHeader title={title} href={href} linkLabel={linkLabel} />}
      {children}
    </section>
  )
}

/**
 * Whether `children` amounts to nothing renderable.
 *
 * ⚠ `!children` alone is wrong, and wrong in the direction that matters: `[]` and `[false, null]` are
 * both truthy, so a section handed an empty mapped array would render its heading and a blank space —
 * the exact empty frame FR-004 forbids, and the one a caller is most likely to produce (`items.map(...)`
 * over an empty list).
 */
function isEmptyContent(children: React.ReactNode): boolean {
  if (children === null || children === undefined || children === false || children === "") return true
  if (Array.isArray(children)) return children.every((c) => isEmptyContent(c as React.ReactNode))
  return false
}
