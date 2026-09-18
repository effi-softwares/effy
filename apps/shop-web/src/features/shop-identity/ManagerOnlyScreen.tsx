import { TeamRoster } from "@/features/team/TeamRoster";

/**
 * US3 — the manager-only area.
 *
 * Reaching this screen is not authorization. Every read and write the roster makes is refused by the
 * backend (role AND status AND shop scope) with a uniform 403 unless the operator is an active
 * shop_manager at an active shop. The standalone manager-ping access card was removed (2026-09-18);
 * the roster's own requests are the gate, and `/shop/v1/manager-ping` remains for shop-mobile and
 * `make shop-verify-gate`.
 */
export function ManagerOnlyScreen() {
  return (
    <div className="flex flex-col gap-(--pad)">
      <TeamRoster />
    </div>
  );
}
