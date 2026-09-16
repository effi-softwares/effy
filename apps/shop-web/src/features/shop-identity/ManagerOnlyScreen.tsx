import { useEffect } from "react";

import { isDomainError } from "@effy/api-client";
import { useQuery } from "@tanstack/react-query";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardHeading,
  CardTitle,
  Spinner,
} from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import { track } from "@/lib/telemetry";

import { TeamRoster } from "@/features/team/TeamRoster";

import { managerPingQuery } from "./queries";

/**
 * US3 — the manager-only area.
 *
 * Reaching this screen is not authorization. The backend decides, from the platform record
 * (role AND status AND shop scope), and refuses with a uniform 403 that says nothing about WHICH
 * term failed. A shop_staff operator who types /manager into the address bar lands here and is
 * refused by the backend, exactly as if they had found a hidden button.
 */
export function ManagerOnlyScreen() {
  const { data, error, isPending, isError, refetch } = useQuery(managerPingQuery);

  const denied = isError && isDomainError(error) && error.kind === "forbidden";
  useEffect(() => {
    if (denied) track({ name: "shop_manager_area_access_denied" });
  }, [denied]);

  return (
    <div className="flex flex-col gap-[var(--pad)]">
      {/* ⚠ 057 US7 — the management area is no longer a bare access proof. The roster is the first
          real thing a manager can DO here; the access card below stays because it is the one screen
          that demonstrates the backend gate, and 007's SC-005b still leans on it. */}
      <TeamRoster />

      <Card className="max-w-md">
      <CardHeader>
        <CardHeading>
          <CardTitle>Shop management</CardTitle>
          <CardDescription>
          Reserved for shop managers. Access is decided by the backend, not by this page.
        </CardDescription>
        </CardHeading>
      </CardHeader>
      <CardContent>
        {isPending ? (
          // ⚠ A SPINNER, NOT A BARE STRING (adoption prompt, per-screen checklist). "Checking your
          // access…" is indistinguishable from a request that has stalled — a sentence does not read
          // as motion, so a hung gate and a working one looked identical.
          <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-busy="true">
            <Spinner />
            Checking your access…
          </p>
        ) : isError ? (
          <ErrorState
            error={error}
            onRetry={() => void refetch()}
            forbiddenMessage="Your account can't reach shop management. This needs an active shop-manager role at an active shop."
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
    </div>
  );
}
