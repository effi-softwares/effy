import { useEffect } from "react";

import { isDomainError } from "@effy/api-client";
import { useQuery } from "@tanstack/react-query";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { track } from "@/lib/telemetry";

import { managerPingQuery } from "./queries";

/**
 * US3 — the manager-only area.
 *
 * Reaching this screen is not authorization. The backend decides, from the platform record
 * (role AND status AND store scope), and refuses with a uniform 403 that says nothing about WHICH
 * term failed. A store_staff operator who types /manager into the address bar lands here and is
 * refused by the backend, exactly as if they had found a hidden button.
 */
export function ManagerOnlyScreen() {
  const { data, error, isPending, isError, refetch } = useQuery(managerPingQuery);

  const denied = isError && isDomainError(error) && error.kind === "forbidden";
  useEffect(() => {
    if (denied) track({ name: "shop_manager_area_access_denied" });
  }, [denied]);

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Store management</CardTitle>
        <CardDescription>
          Reserved for store managers. Access is decided by the backend, not by this page.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <p className="text-sm text-muted-foreground">Checking your access…</p>
        ) : isError ? (
          <ErrorState
            error={error}
            onRetry={() => void refetch()}
            forbiddenMessage="Your account can't reach store management. This needs an active store-manager role at an active store."
          />
        ) : (
          <div className="space-y-2 text-sm">
            <p>The backend served this manager-only read for you.</p>
            <p className="text-muted-foreground">
              Subject <span className="font-mono">{data.subject}</span>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
