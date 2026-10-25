"use client"

import { ShoppingCart } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback } from "react"

import { loadSideDrawer, useLazyOverlay } from "@/components/overlays/lazy"
import { useCart } from "@/lib/cart-store"
import { computeCartTotals } from "@/lib/cart-totals"
import { formatMoney } from "@/lib/money"
import { useOnDemand } from "@/lib/use-on-demand"

const loadBody = () => import("./MiniCartBody").then((m) => m.MiniCartBody)

/**
 * The cart drawer: review and adjust the cart without navigating away. shadcn's Drawer from the right
 * edge (`SideDrawer`), by the header control that opens it. The drawer and its contents are fetched on
 * demand — vaul and radix are barred from the guest first load by dependency-cruiser. The button sits
 * in the shared chrome chunk, so every icon import here costs every guest route: measure before adding
 * one.
 */
export function MiniCart() {
  const lines = useCart()
  const router = useRouter()
  const totals = computeCartTotals(lines)
  const currency = lines[0]?.currency ?? "AUD"
  const count = lines.reduce((n, l) => n + l.quantity, 0)

  // The drawer and its contents are fetched once the shopper shows they want them — pointer or focus
  // on the button, or the press itself — and stay loaded. See `MiniCartBody`.
  const { Overlay: Drawer, open, setOpen, want, wanted } = useLazyOverlay(loadSideDrawer)
  const Body = useOnDemand(loadBody, wanted)

  const close = useCallback(() => setOpen(false), [setOpen])

  /**
   * "Go to cart" — the one control here that is supposed to navigate, and the drawer must be out of
   * the way when it lands.
   *
   * It drives the router itself rather than leaving `<Link>` to do it after an `onClick` that
   * closes the drawer. Both handlers fire on the same click, and the order in which a top-layer
   * dismissal and a client-side navigation resolve is not something to leave to chance on the
   * storefront's primary conversion path: `close` returns focus to the trigger and runs the
   * exit animation while Next is starting a route change. Ordering it explicitly
   * close, then push — makes "press it and you are on the cart page" true by construction.
   *
   * It stays an `<a>` with a real `href` (hence `<Link>`, not a button): cmd/ctrl-click, middle-click,
   * "open in new tab" and a crawler all need a URL, and those paths return early so the browser keeps
   * its own behaviour.
   */
  const goToCart = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
      e.preventDefault()
      close()
      router.push("/cart")
    },
    [close, router],
  )

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true)
        }}
        onPointerEnter={want}
        onFocus={want}
        className="ml-1 inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-primary-fill pr-1 pl-3 text-sm font-medium whitespace-nowrap text-primary-foreground tabular-nums hover:bg-primary-fill/90"
      >
        {/* The name is built from what is shown, plus hidden words — not an aria-label. A label
            that rewords the visible "$72.70 15" fails WCAG 2.5.3: a voice user saying what they
            see would not match it. */}
        <ShoppingCart className="size-5" aria-hidden="true" />
        <span className="sr-only">Cart,</span>
        <span className="max-md:hidden">{formatMoney(totals.itemSubtotal, currency)}</span>
        {/* An inverted chip, not `bg-white/20`: that tint lifted the blue to 4.44:1 under white
            text, below AA. The inverse pair is the primary/foreground pair the token guard holds. */}
        <span className="grid h-8 min-w-8 place-items-center rounded-sm bg-primary-foreground px-2 font-semibold text-primary">
          {count > 99 ? "99+" : count}
        </span>
        <span className="sr-only">{count === 1 ? "item" : "items"}</span>
      </button>

      {Drawer && (
        <Drawer
          open={open}
          onOpenChange={setOpen}
          side="right"
          width="calc(100% - 1rem)"
          maxWidth="26.25rem"
          headerClassName="pt-4 pb-3"
          title={
            <>
              Your cart
              {count > 0 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {count} {count === 1 ? "item" : "items"}
                </span>
              )}
            </>
          }
        >
          {Body ? <Body close={close} goToCart={goToCart} /> : <div className="flex-1" aria-busy="true" />}
        </Drawer>
      )}
    </>
  )
}
