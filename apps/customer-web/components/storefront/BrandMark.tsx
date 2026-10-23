import Link from "next/link"

import { cn } from "@/lib/utils"

/**
 * The Effy wordmark: "effy" in Geist Bold with a green full stop, as type (no request; scales with the
 * text). The file versions are in `packages/brand/svg/`. `href={null}` renders it as plain text.
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
