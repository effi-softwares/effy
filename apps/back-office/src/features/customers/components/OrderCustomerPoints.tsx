import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { Button } from "@effy/design-system/ui";

import { sessionQuery } from "@/features/auth/queries";

import { creditIsLimited } from "../access";
import { pointsSettingsQuery } from "../queries";
import { CreditPointsSheet } from "./CreditPointsSheet";

/**
 * "Credit points" from an order (074 T034): the commonest moment to make things right is while looking
 * at the order that went wrong, so the credit is pre-tied to it. Also the way from an order to its
 * customer's page.
 */
export function OrderCustomerPoints({
  customerId,
  customerName,
  orderId,
  orderNumber,
}: {
  customerId: string;
  customerName: string;
  orderId: string;
  orderNumber: string;
}) {
  const { data: session } = useQuery(sessionQuery);
  const roles = session?.status === "signed-in" ? session.identity.roles : [];
  const settings = useQuery(pointsSettingsQuery);
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Credit points…
      </Button>
      <Link to="/customers/$customerId" params={{ customerId }} className="text-sm text-primary hover:underline">
        View customer
      </Link>
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
