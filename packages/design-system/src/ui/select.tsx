import * as React from "react"
import { Select as SelectPrimitive } from "radix-ui"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, SearchIcon } from "lucide-react"

import { cn } from "../cn"
import { useIsMobile } from "../hooks/use-mobile"
import { Drawer, DrawerContent, DrawerDescription, DrawerHandle, DrawerTitle } from "./drawer"

/*
 * shadcn's Select. On a phone the same parts open a bottom sheet instead of the dropdown: Radix still
 * holds the value (so `SelectValue` reads as ever) but never opens; the items render a second time as
 * full-width rows in the sheet, one tap to choose. A long list gets a search field. Nothing a caller
 * writes changes.
 */
const SEARCH_FROM = 9

type SheetState = {
  value: string
  choose: (value: string) => void
  open: boolean
  setOpen: (open: boolean) => void
  triggerRef: React.RefObject<HTMLButtonElement | null>
}
const SheetContext = React.createContext<SheetState | null>(null)
/** Set inside the sheet's list: parts render as rows there, as Radix parts everywhere else. */
const RowContext = React.createContext<{ query: string; register: () => () => void } | null>(null)

function Select({
  value: valueProp,
  defaultValue,
  onValueChange,
  open: _open,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  const isMobile = useIsMobile()
  const [own, setOwn] = React.useState(defaultValue ?? "")
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const triggerRef = React.useRef<HTMLButtonElement | null>(null)
  const value = valueProp ?? own
  const choose = React.useCallback(
    (next: string) => {
      if (valueProp === undefined) setOwn(next)
      onValueChange?.(next)
      setSheetOpen(false)
    },
    [valueProp, onValueChange]
  )

  if (!isMobile) {
    return (
      <SelectPrimitive.Root
        data-slot="select"
        value={valueProp}
        defaultValue={defaultValue}
        onValueChange={onValueChange}
        open={_open}
        onOpenChange={onOpenChange}
        {...props}
      />
    )
  }
  return (
    <SheetContext.Provider value={{ value, choose, open: sheetOpen, setOpen: setSheetOpen, triggerRef }}>
      <SelectPrimitive.Root
        data-slot="select"
        value={value}
        onValueChange={choose}
        open={false}
        onOpenChange={(o) => {
          if (o) setSheetOpen(true)
          onOpenChange?.(o)
        }}
        {...props}
      />
    </SheetContext.Provider>
  )
}

function SelectGroup({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
  if (React.useContext(RowContext)) return <div role="group" data-slot="select-group" {...(props as React.ComponentProps<"div">)} />
  return <SelectPrimitive.Group data-slot="select-group" {...props} />
}

function SelectValue({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: "sm" | "default"
}) {
  const sheet = React.useContext(SheetContext)
  return (
    <SelectPrimitive.Trigger
      ref={sheet?.triggerRef}
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        // shadcn's trigger at the input's height (40; `sm` 36), one step taller on a touch screen.
        "border-input data-[placeholder]:text-muted-foreground [&_svg:not([class*='text-'])]:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30 dark:hover:bg-input/50 flex w-fit items-center justify-between gap-2 rounded-lg border bg-transparent px-3 py-2 whitespace-nowrap transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 text-sm shadow-xs data-[size=default]:h-10 data-[size=sm]:h-9 pointer-coarse:data-[size=default]:h-11 pointer-coarse:data-[size=sm]:h-10",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="size-4 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  position = "popper",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  const sheet = React.useContext(SheetContext)
  if (sheet) {
    return (
      <>
        {/* Closed, Radix keeps its items in a fragment, which is how the trigger shows the chosen words. */}
        <SelectPrimitive.Content data-slot="select-content" position={position}>
          <SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
        <SelectSheet sheet={sheet}>{children}</SelectSheet>
      </>
    )
  }
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        className={cn(
          "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 relative z-50 max-h-(--radix-select-content-available-height) min-w-32 origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-lg border shadow-md",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
          className
        )}
        position={position}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            "p-1",
            position === "popper" &&
              "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1"
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  if (React.useContext(RowContext)) {
    return <div className={cn("px-3 pt-3 pb-1 text-xs font-medium text-muted-foreground", className)}>{props.children}</div>
  }
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn("text-muted-foreground px-2 py-1.5 text-xs", className)}
      {...props}
    />
  )
}

/** The phone's sheet: a title from the field's label, a search on a long list, then one row per item. */
function SelectSheet({ sheet, children }: { sheet: SheetState; children: React.ReactNode }) {
  const [query, setQuery] = React.useState("")
  const [count, setCount] = React.useState(0)
  const register = React.useCallback(() => {
    setCount((n) => n + 1)
    return () => setCount((n) => n - 1)
  }, [])
  const trigger = sheet.triggerRef.current
  const title =
    trigger?.getAttribute("aria-label") ??
    (trigger?.id ? document.querySelector(`label[for="${CSS.escape(trigger.id)}"]`)?.textContent : null) ??
    "Choose one"

  return (
    <Drawer
      open={sheet.open}
      onOpenChange={(o) => {
        sheet.setOpen(o)
        if (!o) setQuery("")
      }}
    >
      <DrawerContent className="max-h-[85dvh] pb-[calc(8px+env(safe-area-inset-bottom))]">
        <DrawerHandle />
        <DrawerTitle className="px-4 pt-3 pb-2 text-base font-semibold">{title}</DrawerTitle>
        <DrawerDescription className="sr-only">Tap one to choose it.</DrawerDescription>
        {count >= SEARCH_FROM ? (
          <label className="relative mx-4 mb-2 flex items-center">
            <SearchIcon aria-hidden="true" className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
            <span className="sr-only">Search</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="h-11 w-full rounded-lg border border-input bg-transparent pr-3 pl-9 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
            />
          </label>
        ) : null}
        <div role="listbox" aria-label={title} className="min-h-0 flex-1 overflow-y-auto px-2 pb-1">
          <RowContext.Provider value={{ query: query.trim().toLowerCase(), register }}>{children}</RowContext.Provider>
        </div>
      </DrawerContent>
    </Drawer>
  )
}

function textOf(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(" ")
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return textOf(node.props.children)
  return ""
}

function SelectRow({
  value,
  disabled,
  textValue,
  children,
}: Pick<React.ComponentProps<typeof SelectPrimitive.Item>, "value" | "disabled" | "textValue" | "children">) {
  const sheet = React.useContext(SheetContext)!
  const row = React.useContext(RowContext)!
  React.useEffect(() => row.register(), [row.register])
  if (row.query && !(textValue ?? textOf(children)).toLowerCase().includes(row.query)) return null
  const selected = sheet.value === value
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      disabled={disabled}
      onClick={() => sheet.choose(value)}
      className={cn(
        "flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-base outline-none active:bg-accent disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
        selected && "bg-accent font-medium"
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
      {selected ? <CheckIcon aria-hidden="true" className="size-5 text-primary" /> : null}
    </button>
  )
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  if (React.useContext(RowContext)) {
    return (
      <SelectRow value={props.value} disabled={props.disabled} textValue={props.textValue}>
        {children}
      </SelectRow>
    )
  }
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex w-full cursor-default items-center gap-2 py-2 pr-8 pl-2 outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2 min-h-9 rounded-md text-sm pointer-coarse:min-h-11",
        className
      )}
      {...props}
    >
      <span className="absolute right-2 flex size-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  if (React.useContext(RowContext)) return <div aria-hidden="true" className="mx-1 my-1 h-px bg-border" />
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("bg-border pointer-events-none -mx-1 my-1 h-px", className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={cn(
        "flex cursor-default items-center justify-center py-1",
        className
      )}
      {...props}
    >
      <ChevronUpIcon className="size-4" />
    </SelectPrimitive.ScrollUpButton>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={cn(
        "flex cursor-default items-center justify-center py-1",
        className
      )}
      {...props}
    >
      <ChevronDownIcon className="size-4" />
    </SelectPrimitive.ScrollDownButton>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
