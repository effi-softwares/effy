import { useState } from "react";

import { useQuery } from "@tanstack/react-query";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { Button } from "@effy/design-system/ui";

import { shopHistoryQuery } from "../queries";

const PAGE_SIZE = 10;

// Viewable shop/user history (FR-016 / SC-010), backed by the audit log. Server-paged like the
// register; renders actor, action, target, and time per entry.
export function ShopHistory({ shopId }: { shopId: string }) {
  const [page, setPage] = useState(1);
  const { data, error, isPending, isError, refetch } = useQuery(
    shopHistoryQuery(shopId, page, PAGE_SIZE),
  );

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>History</CardTitle>
        <CardDescription>Audit trail of changes to this shop and its roster.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isError ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Target</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                        No history yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.items.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="text-muted-foreground">
                          {formatTime(entry.createdAt)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{entry.actorSub}</TableCell>
                        <TableCell>{entry.action}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {entry.targetType}
                          {entry.targetId ? ` · ${entry.targetId}` : ""}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {data.total} entr{data.total === 1 ? "y" : "ies"} · page {data.page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}
