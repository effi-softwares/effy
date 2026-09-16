import * as React from "react"
import { Avatar as AvatarPrimitive } from "radix-ui"

import { cn } from "../cn"

// THE AVATAR (theme-adoption-prompt.md, Phase 2 §8).
//
// ⚠ A ROUNDED SQUARE, NOT A DISC. The design squares every avatar at 8–9px; a circle reads as a
// social-product convention and sits oddly beside squared controls. 057 already made this change for
// the brand mark and the user row; this completes it in the primitive.
//
// ⚠ THE TINT IS DETERMINISTIC, AND THAT IS THE WHOLE POINT. The same person must get the same colour
// in the orders table, the team roster and the activity sheet, or the tint becomes noise that
// actively misleads — two rows the same colour suggest the same person. `tintFor()` hashes a stable
// seed (an id, or failing that the display name) so the mapping survives re-renders, re-sorts and
// re-fetches. Never pass an array index.

/** The five-entry palette, in fixed order. Adding a sixth changes every existing person's colour. */
const TINTS = [
  "bg-brand-soft text-brand",
  "bg-violet-soft text-violet",
  "bg-teal-soft text-teal",
  "bg-accent2-soft text-accent2",
  "bg-success-soft text-success",
] as const

/**
 * Stable tint for a seed. A plain FNV-1a-style fold: cheap, dependency-free, and — unlike
 * `String.prototype.hashCode` shims — defined for every UTF-16 code unit, so a name with an accent or
 * an emoji cannot produce `NaN` and collapse every such person onto tint 0.
 */
export function tintFor(seed: string): string {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return TINTS[Math.abs(h) % TINTS.length] as string
}

/** First letters of the first two words — "Maya Karlsson" → "MK", "hello@effy" → "H". */
export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  const letters = parts.slice(0, 2).map((p) => p[0] ?? "")
  return letters.join("").toUpperCase()
}

function Avatar({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        "relative flex size-7 shrink-0 overflow-hidden rounded-lg",
        className
      )}
      {...props}
    />
  )
}

function AvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full", className)}
      {...props}
    />
  )
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "flex size-full items-center justify-center rounded-lg bg-muted text-[11.5px] font-semibold",
        className
      )}
      {...props}
    />
  )
}

/**
 * The common case: initials on a deterministic tint, no image.
 *
 * `seed` should be the person's stable id where one exists. It falls back to `name`, which is stable
 * enough for display but WILL re-colour someone who is renamed — pass the id when you have it.
 */
function InitialsAvatar({
  name,
  seed,
  className,
  ...props
}: Omit<React.ComponentProps<typeof AvatarPrimitive.Root>, "children"> & {
  name: string
  seed?: string
}) {
  return (
    <Avatar className={className} {...props}>
      <AvatarFallback className={tintFor(seed ?? name)} title={name}>
        {initialsFor(name)}
      </AvatarFallback>
    </Avatar>
  )
}

export { Avatar, AvatarImage, AvatarFallback, InitialsAvatar }
