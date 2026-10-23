import { Check, Minus } from "lucide-react";

import type { BackOfficeRole } from "@effy/shared-types";
import { Tabs, TabsContent, TabsCount, TabsList, TabsTrigger } from "@effy/design-system/ui";

import { PageHeader } from "@/components/patterns/Page";
import { Panel } from "@/components/patterns/Panel";
import { canManageCatalog } from "@/features/catalog-schema/access";
import { canDebitPoints, canEditPointsSettings } from "@/features/customers/access";
import { canRepairDelivery } from "@/features/deliverability/access";
import { canManageDelivery } from "@/features/delivery/access";
import { canDispatch } from "@/features/dispatch/access";
import { canManageDrivers } from "@/features/drivers/access";
import { canResolveExceptions } from "@/features/exceptions/access";
import { canReplyFeedback } from "@/features/feedback/access";
import { canRecordOrderProgress } from "@/features/orders/access";
import { canDecideReview } from "@/features/product-review/access";
import { canManagePromotions } from "@/features/promotions/access";
import { canManageShops } from "@/features/shops/access";
import { canManageVehicles } from "@/features/vehicles/access";

import { AdminOnlyScreen } from "./AdminOnlyScreen";
import { ProvingScreen } from "./ProvingScreen";

type Rule = (roles: readonly BackOfficeRole[]) => boolean;

/**
 * What each role can do, read from the same functions the screens use to show a control — so the
 * table cannot drift from the console. It is still only the interface's courtesy: the backend
 * decides every request.
 */
const PERMISSIONS: readonly { what: string; rule: Rule }[] = [
  { what: "Read every page", rule: () => true },
  { what: "Record order progress and refunds", rule: canRecordOrderProgress },
  { what: "Assign and plan driver work", rule: canDispatch },
  { what: "Deal with exceptions", rule: canResolveExceptions },
  { what: "Credit customer points", rule: () => true },
  { what: "Remove customer points", rule: canDebitPoints },
  { what: "Reply to feedback", rule: canReplyFeedback },
  { what: "Manage drivers and clearances", rule: canManageDrivers },
  { what: "Manage vehicles", rule: canManageVehicles },
  { what: "Manage shops and their operators", rule: canManageShops },
  { what: "Approve products and set margins", rule: canDecideReview },
  { what: "Edit the catalogue schema", rule: canManageCatalog },
  { what: "Manage promotion codes and order rules", rule: canManagePromotions },
  { what: "Change delivery settings", rule: canManageDelivery },
  { what: "Re-enable email to an address", rule: canRepairDelivery },
  { what: "Change points settings", rule: canEditPointsSettings },
];

const ROLES: readonly { role: BackOfficeRole; label: string }[] = [
  { role: "admin", label: "Administrator" },
  { role: "manager", label: "Manager" },
  { role: "csa", label: "Customer support" },
];

/** Admin and access (005/006; redesign, board "Admin and access"): who you are, and what each role can do. */
export function AdminAccessScreen() {
  return (
    <>
      <PageHeader
        title="Admin and access"
        description="Who you are to the platform, and what each back-office role can do. Access is decided by the backend, not the interface — a hidden button is a courtesy, never the gate."
      />
      <Tabs defaultValue="you">
        <div className="bo-tabsbar">
          <div className="bo-tabsbar__list">
            <TabsList aria-label="Access sections">
              <TabsTrigger value="you">Your access</TabsTrigger>
              <TabsTrigger value="roles">
                Roles and permissions
                <TabsCount>{PERMISSIONS.length}</TabsCount>
              </TabsTrigger>
            </TabsList>
          </div>
        </div>
        <TabsContent value="you" className="bo-tabpanel">
          <div className="grid max-w-3xl gap-6">
            <ProvingScreen />
            <AdminOnlyScreen />
          </div>
        </TabsContent>
        <TabsContent value="roles" className="bo-tabpanel">
          <Panel title="Roles and permissions" description="Roles are granted in the admin sign-in pool; the platform's staff record decides." flush>
            <div className="bo-table-scroll">
              <table className="bo-table">
                <thead>
                  <tr>
                    <th>Permission</th>
                    {ROLES.map((r) => (
                      <th key={r.role} className="text-center">
                        {r.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERMISSIONS.map((p) => (
                    <tr key={p.what}>
                      <td>{p.what}</td>
                      {ROLES.map((r) => (
                        <td key={r.role} className="text-center">
                          {p.rule([r.role]) ? (
                            <Check aria-label="Allowed" className="mx-auto size-4 text-success" />
                          ) : (
                            <Minus aria-label="Not allowed" className="mx-auto size-4 text-muted-foreground" />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </TabsContent>
      </Tabs>
    </>
  );
}
