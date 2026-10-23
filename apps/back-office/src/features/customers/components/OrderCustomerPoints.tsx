import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { Coins } from "lucide-react";

import { Button } from "@effy/design-system/ui";

import { sessionQuery } from "@/features/auth/queries";

import { creditIsLimited } from "../access";
import { pointsSettingsQuery } from "../queries";
import { CreditPointsSheet } from "./CreditPointsSheet";

/**
 * "Credit points" from an order: the commonest moment to make things right is while looking
 * at the order that went wrong, so the credit is pre-tied to it. Also the way from an order to its
 * customer's page.
 */
export function OrderCustomerPoints({
  customerId,
  customerName,
  orderId,
  orderNumber,
  layout = "row",
}: {
  customerId: string;
  customerName: string;
  orderId: string;
  orderNumber: string;
  /** `block` — the order page's Customer panel: one full-width button; the panel links the customer. */
  layout?: "row" | "block";
}) {
  const { data: session } = useQuery(sessionQuery);
  const roles = session?.status === "signed-in" ? session.identity.roles : [];
  const settings = useQuery(pointsSettingsQuery);
  const [open, setOpen] = useState(false);

  return (
    <div className={layout === "block" ? "grid" : "flex flex-wrap items-center gap-3"}>
      <Button size={layout === "block" ? "default" : "sm"} variant="outline" onClick={() => setOpen(true)}>
        {layout === "block" ? <Coins aria-hidden="true" /> : null}
        Credit points…
      </Button>
      {layout === "row" ? (
        <Link to="/customers/$customerId" params={{ customerId }} className="text-sm text-primary hover:underline">
          View customer
        </Link>
      ) : null}
      <CreditPointsSheet
        open={open}
        onOpenChange={setOpen}
        customerId={customerId}
        customerName={customerName}
        orders={[{ id: orderId, orderNumber }]}
        defaultOrderId={orderId}
        limit={creditIsLimited(roles) ? (settings.data?.csaCreditLimitPoints ?? null) : null}
        centsPerPoint={settings.data?.centsPerPoint ?? 1}
      />
    </div>
  );
}
