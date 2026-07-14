import { User } from "lucide-react"

import { cn } from "@/lib/utils"
import { initialsFor } from "@/lib/initials"

/**
 * The initials avatar (012 FR-002 … FR-005).
 *
 * ⚠ ONE COLOUR FOR EVERY CUSTOMER — no hashed palette, and that is a decision, not laziness.
 *
 * The instinct is to hash the customer id into a colour so avatars look varied. But a customer on
 * this surface only ever sees their OWN avatar: there is no roster, no comment thread, no
 * multi-user view anywhere in the storefront. Colour variety therefore distinguishes NOTHING, while
 * forcing every generated hue to be contrast-checked against the foreground in both light and dark
 * (WCAG 1.4.3, 4.5:1 — initials are text). One brand-token pair, checked once, is strictly better.
 *
 * If a colour were ever keyed on anything, it would have to be keyed on the STABLE ID and never on
 * the name — or the avatar would change colour when the customer edited their name (FR-004).
 *
 * ⚠ ACCESSIBILITY — the rule people get wrong:
 *
 *   Beside a visible name  → `aria-hidden`. The name is already in the accessibility tree; labelling
 *                            the avatar too makes a screen reader announce it TWICE.
 *   Standalone (a trigger) → `role="img"` + `aria-label={name}`. And NOT the word "avatar" or
 *                            "image" in the label — the role already says that.
 */
export function Avatar({
  givenName,
  familyName,
  /**
   * Is the customer's name displayed next to this avatar?
   * If yes, the avatar is decorative and MUST be hidden from assistive technology.
   */
  labelledByAdjacentName,
  className,
}: {
  givenName: string | null
  familyName: string | null
  labelledByAdjacentName: boolean
  className?: string
}) {
  const initials = initialsFor(givenName, familyName)
  const fullName = [givenName, familyName].filter(Boolean).join(" ")

  // The neutral glyph is a legitimate, complete answer — for a customer with no name, or one whose
  // name we cannot derive an initial from honestly. It is never a blank circle, and never a letter
  // guessed from the email address.
  const content = initials ?? <User className="size-1/2" aria-hidden="true" />

  const a11y = labelledByAdjacentName
    ? ({ "aria-hidden": true } as const)
    : ({ role: "img", "aria-label": fullName || "Your account" } as const)

  return (
    <span
      {...a11y}
      data-testid="avatar"
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full",
        // Jade brand, with the dark-on-emerald foreground the design system pairs it with for
        // WCAG contrast. Both tokens, so light and dark are handled by the theme, not by us.
        "bg-primary font-medium text-primary-foreground",
        "size-12 text-base",
        className,
      )}
    >
      {content}
    </span>
  )
}
