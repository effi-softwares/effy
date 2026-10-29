// Every points rule is @effy/edge-shared/points; this decides who is asking, and meters and announces after commit.
import {
  emitMetric, formatCents, offsetListPage, hasStaffRole, metricNamespace, OUTWARD_ACTION_ROLES, pooled, withTransaction,
  type Queryable, type Transactor,
} from "@effy/edge-shared";
import {
  announcePointsFor, balanceSummary, credit, debit, loadSettings, OverAgentLimitError, updateSettings,
  type PointsSettingsPatch,
} from "@effy/edge-shared/points";
import type {
  CustomerDetailDTO, CustomerListDTO, PointsChangeResultDTO, PointsCreditRequest, PointsDebitRequest,
  PointsSettingsDTO,
} from "@effy/shared-types";

import type { CustomerListRequest } from "./list";
import * as repo from "./repository";

/** Also raised for a non-uuid id. */
export class CustomerNotFoundError extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CustomerServiceDeps {
  db?: Queryable;
  transact?: Transactor;
  /** No credit limit, and the only roles that may debit. */
  isWriter?: (sub: string) => Promise<boolean>;
  now?: () => Date;
}

export function createCustomerService(deps: CustomerServiceDeps = {}) {
  const db = deps.db ?? pooled;
  const transact = deps.transact ?? withTransaction;
  const isWriter = deps.isWriter ?? ((sub: string) => hasStaffRole(sub, OUTWARD_ACTION_ROLES));
  const now = deps.now ?? (() => new Date());

  async function requireCustomer(id: string): Promise<repo.CustomerRow> {
    if (!UUID.test(id)) throw new CustomerNotFoundError();
    const c = await repo.customer(id);
    if (!c) throw new CustomerNotFoundError();
    return c;
  }

  async function usableNow(customerId: string): Promise<number> {
    return (await balanceSummary(db, customerId, now())).usable;
  }

  return {
    /** Back-office › Customers, a console list (103). */
    async list(req: CustomerListRequest): Promise<CustomerListDTO> {
      const r = await repo.list(req);
      return offsetListPage(
        r.rows.map((x) => ({
          id: x.id,
          name: x.name,
          email: x.email,
          phone: x.phone,
          joinedAt: x.joined_at.toISOString(),
          points: x.points,
          orderCount: x.order_count,
          lastOrderAt: x.last_order_at ? x.last_order_at.toISOString() : null,
        })),
        req,
        r,
      );
    },

    async detail(id: string): Promise<CustomerDetailDTO> {
      const c = await requireCustomer(id);
      const [summary, orders] = await Promise.all([balanceSummary(db, c.id, now()), repo.recentOrders(c.id)]);
      return {
        id: c.id, name: c.name, email: c.email,
        points: { usable: summary.usable, valueAmount: formatCents(summary.valueCents), held: summary.held, nextExpiry: summary.nextExpiry },
        recentOrders: orders.map((o) => ({
          id: o.id, orderNumber: o.order_number, placedAt: o.placed_at ? o.placed_at.toISOString() : null, total: o.grand_total_amount,
        })),
      };
    },

    /** A csa may credit up to the per-credit limit, read inside the same transaction as the credit. */
    async credit(actorSub: string, customerId: string, req: PointsCreditRequest): Promise<PointsChangeResultDTO> {
      const c = await requireCustomer(customerId);
      const unlimited = await isWriter(actorSub);
      const at = now();
      const { entryId } = await transact(async (tx) => {
        if (!unlimited) {
          const { csaCreditLimitPoints } = await loadSettings(tx);
          if (req.points > csaCreditLimitPoints) throw new OverAgentLimitError(csaCreditLimitPoints);
        }
        return credit(tx, {
          customerId: c.id, points: req.points, kind: "staff_credit", reason: req.reason, note: req.note ?? null,
          orderId: req.orderId ?? null, author: { kind: "staff", sub: actorSub }, now: at,
        });
      });
      emitMetric(metricNamespace(), "PointsCredited", 1, { author: "staff" });
      await announcePointsFor([c.id], db);
      return { entryId, usable: await usableNow(c.id) };
    },

    /** Refused when more than is usable. */
    async debit(actorSub: string, customerId: string, req: PointsDebitRequest): Promise<PointsChangeResultDTO> {
      const c = await requireCustomer(customerId);
      const at = now();
      const { entryId } = await transact((tx) =>
        debit(tx, { customerId: c.id, points: req.points, reason: req.reason, note: req.note ?? null, author: { kind: "staff", sub: actorSub }, now: at }),
      );
      emitMetric(metricNamespace(), "PointsDebited", 1, {});
      await announcePointsFor([c.id], db);
      return { entryId, usable: await usableNow(c.id) };
    },

    async settings(): Promise<PointsSettingsDTO> {
      const s = await loadSettings(db);
      return {
        centsPerPoint: s.centsPerPoint, expiryMonths: s.expiryMonths, csaCreditLimitPoints: s.csaCreditLimitPoints,
        warningDays: s.warningDays, holdMinutes: s.holdMinutes,
      };
    },

    async updateSettings(actorSub: string, patch: PointsSettingsPatch): Promise<PointsSettingsDTO> {
      await transact((tx) => updateSettings(tx, patch, actorSub));
      return this.settings();
    },
  };
}

export type CustomerService = ReturnType<typeof createCustomerService>;

export const customerService = createCustomerService();
