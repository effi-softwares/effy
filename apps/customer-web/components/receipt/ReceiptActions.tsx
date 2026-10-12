"use client"

import { Printer } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DEFAULT_PACKAGE_KEY } from "@/lib/cart-store"
import { addItem } from "@/lib/cart-actions"

/** Print the page — the browser's own dialog also saves it as a PDF. */
export function PrintReceipt() {
  return (
    <Button type="button" variant="ghost" size="icon" aria-label="Print" onClick={() => window.print()} className="print:hidden">
      <Printer aria-hidden="true" />
    </Button>
  )
}

/**
 * Put one line of a past order back in the cart.
 *
 * ⚠ It goes in at TODAY'S price and only if it can still be bought — the cart decides both, exactly
 * as it does for any other add. The receipt's own figures are a record and are not reused.
 */
export function BuyLineAgain({
  productId,
  name,
  imageUrl,
  unitPriceAmount,
  currency,
}: {
  productId: string
  name: string
  imageUrl: string | null
  unitPriceAmount: string
  currency: string
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="print:hidden"
      onClick={() =>
        addItem({ productId, name, imageUrl, unitPriceAmount, currency, quantity: 1, packageKey: DEFAULT_PACKAGE_KEY })
      }
    >
      Buy again<span className="sr-only"> {name}</span>
    </Button>
  )
}
