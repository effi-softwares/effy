import { useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { CircleCheck } from "lucide-react"

import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"
import { EmptyState, PageHeader } from "@effy/web-kit/patterns"

import { pathText } from "@/features/taxonomy/model"

import { missingDetailsQuery } from "./queries"

/**
 * Products already on sale that lack a detail their category now requires (101). They stay on sale; the
 * shop is asked to fill it in from its own catalogue, and the next change it submits must include it.
 */
export function MissingDetailsScreen() {
  const [cursors, setCursors] = useState<string[]>([])
  const list = useQuery(missingDetailsQuery(cursors[cursors.length - 1] ?? null))

  return (
    <>
      <PageHeader
        title="Products missing details"
        description="On sale before their category required these details. They stay on sale; shops see the same list in their catalogue."
      />
      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : list.data.items.length === 0 && cursors.length === 0 ? (
        <EmptyState
          icon={CircleCheck}
          title="Nothing is missing"
          description="Every product on sale has the details its category requires."
        />
      ) : (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="min-w-0">
              <Table className="ef-rtable">
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Shop</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Missing</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.data.items.map((p) => (
                    <TableRow key={p.productId}>
                      <TableCell data-m="title">
                        <Link
                          to="/product-review/$productId"
                          params={{ productId: p.productId }}
                          className="font-medium hover:underline"
                        >
                          {p.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{p.shopName}</TableCell>
                      <TableCell className="text-muted-foreground">{pathText(p.categoryPath)}</TableCell>
                      <TableCell>{p.missing.join(", ")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
          {cursors.length > 0 || list.data.nextCursor ? (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={cursors.length === 0} onClick={() => setCursors([])}>
                First page
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!list.data.nextCursor}
                onClick={() => list.data.nextCursor && setCursors([...cursors, list.data.nextCursor])}
              >
                Next page
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </>
  )
}
