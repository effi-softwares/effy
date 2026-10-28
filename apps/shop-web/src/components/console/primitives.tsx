import type { ReactNode } from "react"

import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@effy/design-system/ui"

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
    <section className={cn("min-w-0", className)}>
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="border-b py-4 [.border-b]:pb-4">
          <CardTitle className="leading-6">
            <h2>{title}</h2>
          </CardTitle>
          <CardDescription>{subtitle}</CardDescription>
          {action ? <CardAction>{action}</CardAction> : null}
        </CardHeader>
        {flush ? children : <CardContent className="py-4">{children}</CardContent>}
      </Card>
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
    <Button type="button" variant="ghost" size="sm" onClick={onClick} disabled={disabled}>
      {children}
    </Button>
  )
}

export function MicroLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("text-sm font-medium whitespace-nowrap text-muted-foreground", className)}>{children}</div>
}

export function TableFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card", className)}>
      <Table>{children}</Table>
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
    <TableHead numeric={align === "right"} style={width ? { width } : undefined}>
      {children}
    </TableHead>
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
  return (
    <TableCell numeric={align === "right"} className={className}>
      {children}
    </TableCell>
  )
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
    <TableRow onClick={onClick} className={cn(interactive && "cursor-pointer")}>
      {children}
    </TableRow>
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
    <Tabs value={value} onValueChange={(v) => onChange(v as T)}>
      <TabsList aria-label={ariaLabel}>
        {options.map((o) => (
          <TabsTrigger key={o.value} value={o.value}>
            {o.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
