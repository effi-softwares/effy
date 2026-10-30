import { cn } from "@/lib/utils"

/**
 * The reference Card: white, a hairline border, `rounded-lg`, and shadcn's `shadow-xs`.
 *
 * Never grey-filled. A card is the white surface a discrete, choosable thing sits on - a product,
 * an address, a checkout section (constitution v3.3.0, the storefront identity).
 *
 * `padded={false}` is the reference's `padding:0;gap:0` card: rows that run edge to edge and draw
 * their own dividers (order lists, receipts, tables).
 */
export function Card({
  className,
  padded = true,
  ...props
}: React.ComponentProps<"div"> & { padded?: boolean }) {
  return (
    <div
      data-slot="card"
      className={cn(
        "flex flex-col rounded-lg border bg-card text-card-foreground shadow-xs",
        padded && "gap-6 py-6",
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-header" className={cn("flex flex-col gap-2 px-6", className)} {...props} />
}

export function CardTitle({
  as: Tag = "h2",
  className,
  ...props
}: React.ComponentProps<"h2"> & { as?: "h2" | "h3" | "h4" }) {
  return <Tag data-slot="card-title" className={cn("leading-none font-semibold", className)} {...props} />
}

export function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="card-description" className={cn("text-sm text-muted-foreground", className)} {...props} />
}

export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("px-6", className)} {...props} />
}

export function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-footer" className={cn("flex items-center px-6", className)} {...props} />
}
