"use client"

import { ShoppingCart } from "lucide-react"
import Link from "next/link"

import { CatalogImage } from "@/components/storefront/CatalogImage"
import { ActionLink, btnClass } from "@/components/storefront/actions"
import { removeItem, setItemQuantity } from "@/lib/cart-actions"
import { useCart } from "@/lib/cart-store"
import { computeCartTotals } from "@/lib/cart-totals"
import { formatMoney } from "@/lib/money"

export function MiniCartBody({
  close,
  goToCart,
}: {
  close: () => void
  goToCart: (e: React.MouseEvent<HTMLAnchorElement>) => void
}) {
  const lines = useCart()
  const totals = computeCartTotals(lines)
  const currency = lines[0]?.currency ?? "AUD"

  return lines.length === 0 ? (
    // `flex-1` + centring: an empty drawer is full-height, so the message belongs in the
    // middle of the panel rather than stranded against the header.
    <div className="flex flex-1 flex-col items-center justify-center px-5 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-lg bg-muted">
        <ShoppingCart className="size-6" aria-hidden="true" />
      </span>
      <p className="mt-4 text-base font-semibold">Your cart is empty</p>
      <p className="mt-1 text-sm text-muted-foreground">Add something and it will show up here.</p>
      {/* A route back into the catalogue, never a dead end. */}
      <Link
        href="/search"
        onClick={close}
        className={btnClass("primary", "lg", "mt-5")}
      >
        Start shopping
      </Link>
    </div>
  ) : (
    <>
      {/* The only scrolling region. The header and the footer are pinned by the flex column,
          so the subtotal and the primary action never scroll out of reach — which on a long
          cart is the difference between a usable drawer and one you have to hunt through. */}
      <ul className="flex-1 divide-y overflow-y-auto border-t px-4">
        {lines.map((line) => (
          <li key={line.variantId} className="flex gap-3 py-4">
            <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-muted">
              {line.imageUrl && (
                <CatalogImage
                  src={line.imageUrl}
                  widths={line.imageWidths}
                  alt=""
                  fill
                  sizes="4rem"
                  className="object-cover"
                />
              )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col">
              <span className="line-clamp-2 text-sm font-medium">
                {line.name}
                {/* The size chosen. */}
                {line.variantLabel ? <span className="font-normal text-muted-foreground"> · {line.variantLabel}</span> : null}
              </span>
              <span className="mt-1 text-xs text-muted-foreground">
                {formatMoney(line.unitPriceAmount, line.currency)} each
              </span>

              <div className="mt-2 flex items-center justify-between gap-2">
                {/* One bordered group rather than two loose buttons: it reads as a single
                    control operating on the number between them.
                    `leading-none` on the glyphs — `−` and `+` sit on different baselines
                    to the box, and without it the row looks a pixel out of true. */}
                <div className="inline-flex items-center overflow-hidden rounded-md border border-input shadow-xs">
                  <button
                    type="button"
                    onClick={() => setItemQuantity(line.variantId, line.quantity - 1)}
                    aria-label={`Decrease quantity of ${line.name}`}
                    className="inline-flex size-8 items-center justify-center text-base leading-none hover:bg-accent"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm font-medium tabular-nums">
                    {line.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setItemQuantity(line.variantId, line.quantity + 1)}
                    aria-label={`Increase quantity of ${line.name}`}
                    className="inline-flex size-8 items-center justify-center text-base leading-none hover:bg-accent"
                  >
                    +
                  </button>
                </div>

                <span className="text-sm font-semibold tabular-nums">
                  {formatMoney(computeCartTotals([line]).itemSubtotal, line.currency)}
                </span>
              </div>

              <button
                type="button"
                onClick={() => removeItem(line.variantId)}
                // The accessible name carries the product; "Remove" alone, repeated down a
                // list, tells a screen-reader user nothing about which thing goes.
                aria-label={`Remove ${line.name}`}
                className="mt-2 self-start text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="border-t p-4">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Items</span>
          <span className="font-medium tabular-nums">
            {formatMoney(totals.itemSubtotal, currency)}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Delivery calculated at checkout.
        </p>
        <ActionLink href="/cart" onClick={goToCart} size="xl" className="mt-4 w-full">
          View cart and check out
        </ActionLink>
        <button
          type="button"
          onClick={close}
          className={btnClass("ghost", "lg", "mt-2 w-full")}
        >
          Continue shopping
        </button>
      </div>
    </>
  )
}
