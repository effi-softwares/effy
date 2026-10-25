import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex min-w-0 flex-col gap-6 max-md:gap-4", className)}>{children}</div>
}

export function DetailSection({
  title,
  subtitle,
  action,
  children,
  className,
  flush = false,
}: {
  title: ReactNode
  subtitle: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  flush?: boolean
}) {
  return (
    <section className={cn("bo-panel min-w-0", className)}>
      <div className="bo-panel__head">
        <div className="min-w-0 flex-1">
          <h2 className="bo-panel__title">{title}</h2>
          <p className="bo-panel__desc">{subtitle}</p>
        </div>
        {action}
      </div>
      {flush ? children : <div className="bo-panel__body">{children}</div>}
    </section>
  )
}

export function SectionAction({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-slot="button"
      data-variant="ghost"
      data-size="sm"
      className="inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  )
}

export function MicroLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("text-[13px] font-medium whitespace-nowrap text-muted-foreground", className)}>{children}</div>
  )
}

export function TableFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("bo-table-wrap", className)}>
      <div className="bo-table-scroll">
        <table className="bo-table">{children}</table>
      </div>
    </div>
  )
}

export function Th({
  children,
  align = "left",
  width,
}: {
  children?: ReactNode
  align?: "left" | "right"
  width?: string
}) {
  return (
    <th style={width ? { width } : undefined} className={cn(align === "right" && "is-num")}>
      {children}
    </th>
  )
}

export function Td({
  children,
  align = "left",
  className,
}: {
  children?: ReactNode
  align?: "left" | "right"
  className?: string
}) {
  return <td className={cn(align === "right" && "is-num", className)}>{children}</td>
}

export function Tr({
  children,
  interactive,
  onClick,
}: {
  children: ReactNode
  interactive?: boolean
  onClick?: () => void
}) {
  return (
    <tr onClick={onClick} className={cn(interactive && "cursor-pointer")}>
      {children}
    </tr>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T
  onChange: (next: T) => void
  options: readonly { value: T; label: ReactNode }[]
  ariaLabel: string
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="bo-seg">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(active && "is-active")}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
