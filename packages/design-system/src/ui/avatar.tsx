import * as React from "react"
import { Avatar as AvatarPrimitive } from "radix-ui"

import { cn } from "../cn"

// The avatar: a rounded square, not a disc, to sit with squared controls. The tint is deterministic
// (`tintFor` hashes an id, or the name), so one person has one colour everywhere. Never seed it with
// an array index.

/** The five-entry palette, in fixed order. Adding a sixth changes every existing person's colour. */
const TINTS = [
  "bg-brand-soft text-brand",
  "bg-violet-soft text-violet",
  "bg-teal-soft text-teal",
  "bg-accent2-soft text-accent2",
  "bg-success-soft text-success",
] as const

/** Stable tint for a seed: an FNV-1a-style fold, defined for every UTF-16 code unit. */
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

/** Initials on a deterministic tint. Pass the person's id as `seed` when there is one; a name re-colours on rename. */
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
