import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react"

import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useStore } from "@tanstack/react-store"
import {
  ClipboardList,
  Download,
  Moon,
  Package,
  Plus,
  Printer,
  ScanBarcode,
  Search,
  Sun,
  ToggleRight,
  type LucideIcon,
} from "lucide-react"

import type { ShopRole } from "@effy/shared-types"
import { cn } from "@effy/design-system"
import { useIsMobile } from "@effy/design-system/hooks/use-mobile"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@effy/design-system/ui"
import { visibleNav } from "@effy/web-kit/console"
import { Kbd } from "@effy/web-kit/patterns"

import { NAV } from "@/components/layout/nav"
import { productListQuery } from "@/features/catalog/queries"
import { formatMoney } from "@/features/fulfillment/orderConsole"
import { orderListQuery } from "@/features/fulfillment/queries"
import { exportOrders, printLists } from "@/features/today/QuickActionsSheet"
import { setTheme, uiStore } from "@/lib/ui-store"

/**
 * Search and commands (Foundations — "Search and commands"): ⌘K on a laptop, the header's search
 * button on a tablet or phone. Find an order by number or customer, a product by name, SKU or barcode,
 * or run an action — one list, keyboard first, 48px rows. A dialog from 768px; below it the same content
 * rises as a drawer. It reads only through the Orders and Catalog lists' own queries.
 */
interface Item {
  id: string
  icon: LucideIcon
  label: string
  mono?: boolean
  meta?: string
  hint?: string
  run: () => void
}

interface Section {
  label: string
  items: Item[]
}

function useDebounced(value: string, ms: number): string {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export function CommandPalette({
  open,
  onOpenChange,
  roles,
  onScan,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  roles: readonly ShopRole[]
  /** Opens the header's scan dialog. */
  onScan: () => void
}) {
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const theme = useStore(uiStore, (s) => s.theme)
  const [query, setQuery] = useState("")
  const [focus, setFocus] = useState(0)
  const q = useDebounced(query.trim(), 200)
  const searching = q.length >= 2
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      setQuery("")
      setFocus(0)
    }
  }, [open])

  const orders = useQuery({ ...orderListQuery({ q }), enabled: open && searching, placeholderData: keepPreviousData })
  const products = useQuery({
    ...productListQuery({ page: 1, pageSize: 5, q }),
    enabled: open && searching,
    placeholderData: keepPreviousData,
  })

  const close = () => onOpenChange(false)

  const sections = useMemo<Section[]>(() => {
    const text = query.trim().toLowerCase()
    const matches = (s: string) => !text || s.toLowerCase().includes(text)
    const out: Section[] = []

    if (searching) {
      const productItems = (products.data?.items ?? []).slice(0, 5).map<Item>((p) => ({
        id: `product:${p.id}`,
        icon: Package,
        label: p.name,
        meta: p.brand ?? undefined,
        hint: p.variantCount === 1 ? "One size" : `${p.variantCount} sizes`,
        run: () => {
          close()
          void navigate({ to: "/catalog/$productId", params: { productId: p.id } })
        },
      }))
      if (productItems.length) out.push({ label: "Products", items: productItems })

      const orderItems = (orders.data?.items ?? []).slice(0, 5).map<Item>((o) => ({
        id: `order:${o.id}`,
        icon: ClipboardList,
        label: o.orderNumber,
        mono: true,
        meta: `· ${o.customerName}`,
        hint: formatMoney(o.total, o.currency),
        run: () => {
          close()
          void navigate({ to: "/orders/$fulfillmentId", params: { fulfillmentId: o.id } })
        },
      }))
      if (orderItems.length) out.push({ label: "Orders", items: orderItems })
    }

    const dark = theme === "dark" || (theme === "system" && document.documentElement.classList.contains("dark"))
    const actions: Item[] = [
      { id: "new-product", icon: Plus, label: "New product", run: () => (close(), void navigate({ to: "/catalog/new" })) },
      { id: "scan", icon: ScanBarcode, label: "Scan a bag label", run: () => (close(), onScan()) },
      {
        id: "availability",
        icon: ToggleRight,
        label: "Take a size off sale",
        hint: "Availability",
        run: () => (close(), void navigate({ to: "/catalog/availability" })),
      },
      { id: "print", icon: Printer, label: "Print pick lists", run: () => (close(), void printLists()) },
      { id: "export", icon: Download, label: "Export orders", hint: "CSV", run: () => (close(), void exportOrders()) },
      {
        id: "appearance",
        icon: dark ? Sun : Moon,
        label: dark ? "Switch to light appearance" : "Switch to dark appearance",
        run: () => (close(), setTheme(dark ? "light" : "dark")),
      },
    ].filter((a) => matches(a.label))
    if (actions.length) out.push({ label: "Actions", items: actions })

    const pages = visibleNav(NAV, roles)
      .filter((n) => matches(n.label))
      .map<Item>((n) => ({
        id: `page:${n.to}:${n.label}`,
        icon: n.icon,
        label: n.label,
        run: () => (close(), void navigate({ to: n.to, search: n.search } as never)),
      }))
    if (pages.length) out.push({ label: "Go to", items: pages })

    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close/navigate are stable for the palette's life
  }, [query, searching, orders.data, products.data, roles, theme])

  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections])

  useEffect(() => setFocus(0), [query])
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${focus}"]`)?.scrollIntoView({ block: "nearest" })
  }, [focus])

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setFocus((i) => Math.min(i + 1, flat.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setFocus((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter") {
      const item = flat[focus]
      if (!item) return
      e.preventDefault()
      item.run()
    }
  }

  const loading = searching && (orders.isFetching || products.isFetching)
  let index = -1

  const body: ReactNode = (
    <>
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        <Search aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded="true"
          aria-controls="sh-palette-list"
          aria-activedescendant={flat[focus] ? `sh-palette-${focus}` : undefined}
          aria-label="Search"
          placeholder="Search orders and products, or type a command"
          className="min-w-0 flex-1 border-0 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
        />
        <Kbd className="max-[1279px]:hidden">esc</Kbd>
      </div>
      <div
        ref={listRef}
        id="sh-palette-list"
        role="listbox"
        aria-label="Results"
        className="max-h-[480px] overflow-y-auto px-2 pt-1 pb-2 max-md:max-h-none max-md:flex-1"
      >
        {sections.length === 0 ? (
          <p className="px-2 py-8 text-center text-muted-foreground">
            {loading ? "Searching…" : "Nothing matches that."}
          </p>
        ) : (
          sections.map((section) => (
            <div key={section.label} role="group" aria-label={section.label} className="pt-1">
              <div className="bo-eyebrow px-2 py-1.5">{section.label}</div>
              {section.items.map((item) => {
                index += 1
                const i = index
                return (
                  <button
                    key={item.id}
                    id={`sh-palette-${i}`}
                    type="button"
                    role="option"
                    aria-selected={i === focus}
                    data-index={i}
                    onMouseMove={() => setFocus(i)}
                    onClick={item.run}
                    className={cn("bo-cmd-item", i === focus && "is-focus")}
                  >
                    <item.icon aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">
                      <span className={cn(item.mono && "font-mono tracking-[-0.01em]")}>{item.label}</span>
                      {item.meta ? <span className="text-muted-foreground"> {item.meta}</span> : null}
                    </span>
                    {item.hint ? <span className="text-sm text-muted-foreground tabular-nums">{item.hint}</span> : null}
                  </button>
                )
              })}
            </div>
          ))
        )}
        {!searching && query.trim().length === 1 ? (
          <p className="px-2 pt-2 text-sm text-muted-foreground">Type two characters to search orders and products.</p>
        ) : null}
      </div>
      <div className="flex h-10 shrink-0 items-center gap-4 border-t border-border px-4 text-sm whitespace-nowrap text-muted-foreground max-[1279px]:hidden">
        <span className="flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> move
        </span>
        <span className="flex items-center gap-1">
          <Kbd>↵</Kbd> open
        </span>
        <span className="ml-auto flex items-center gap-1">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd> from anywhere
        </span>
      </div>
    </>
  )

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="h-[92vh] max-h-[92vh] overflow-hidden">
          <DrawerTitle className="sr-only">Search and commands</DrawerTitle>
          <DrawerDescription className="sr-only">Search orders and products, or go to a page.</DrawerDescription>
          <div className="flex min-h-0 flex-1 flex-col">{body}</div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[12%] flex max-w-[640px] translate-y-0 flex-col gap-0! overflow-hidden p-0! sm:max-w-[640px]"
      >
        <DialogTitle className="sr-only">Search and commands</DialogTitle>
        <DialogDescription className="sr-only">Search orders and products, or go to a page.</DialogDescription>
        {body}
      </DialogContent>
    </Dialog>
  )
}
