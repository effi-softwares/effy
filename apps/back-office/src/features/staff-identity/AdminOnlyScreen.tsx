import { useEffect } from "react";

import { isDomainError } from "@effy/api-client";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { track } from "@/lib/telemetry";

import { adminPingQuery } from "./queries";

// US3 / FR-006a — the authoritative layer. The screen is reachable by URL; the BACKEND decides.
// Admin → served; manager/csa (or, after US4, a disabled admin) → 403, surfaced as access-denied.
// The proof is the backend's 403, not the hidden nav link.
export function AdminOnlyScreen() {
  const { data, error, isPending, isError, refetch, isFetching } = useQuery(adminPingQuery);
  const denied = isError && isDomainError(error) && error.kind === "forbidden";

  useEffect(() => {
    if (denied) track({ name: "admin_area_access_denied" });
  }, [denied]);

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Administrator area</CardTitle>
        <CardDescription>Access is decided by the backend, not the interface.</CardDescription>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <p className="text-sm text-muted-foreground">Checking…</p>
        ) : denied ? (
          <p className="text-sm text-muted-foreground">
            You don't have administrator access. The backend refused this request.
          </p>
        ) : isError ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              The back-office service is unreachable right now.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              {isFetching ? "Retrying…" : "Retry"}
            </Button>
          </div>
        ) : (
          <p className="text-sm">
            Administrator access confirmed for <span className="font-mono">{data.subject}</span>.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
