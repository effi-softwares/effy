import Link from "next/link"

import { cn } from "@/lib/utils"

/**
 * The Effy wordmark: "effy" in Geist Bold with a green full stop (feature 084).
 *
 * ⚠ It is TYPE, not an image, so it costs no request and scales with the text around it. The same
 * wordmark as a file — outlined from this typeface at this weight and tracking, in a light and a
 * dark appearance — is `packages/brand/svg/`, and the app icons are its first letter and full stop.
 * The full stop is the one place the brand green appears in the header.
 *
 * `href={null}` renders it as plain text (the checkout and auth frames, where leaving mid-flow by
 * accident is the thing to avoid, pass an explicit destination instead).
 */
export function BrandMark({
  href = "/",
  className,
  size = 26,
}: {
  href?: string | null
  className?: string
  /** The cap height in px. 26 in the header and footer; 22 on phones. */
  size?: number
}) {
  const classes = cn(
    "inline-flex shrink-0 items-baseline font-bold leading-none tracking-[-0.05em] whitespace-nowrap text-foreground",
    className,
  )
  const content = (
    <>
      effy<span className="text-brand">.</span>
    </>
  )

  if (href === null) {
    return (
      <span className={classes} style={{ fontSize: size }} aria-label="Effy">
        {content}
      </span>
    )
  }

  return (
    <Link href={href} className={classes} style={{ fontSize: size }} aria-label="Effy home">
      {content}
    </Link>
  )
}
