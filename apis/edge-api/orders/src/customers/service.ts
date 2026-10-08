// Back-office customers and their points (074). No HTTP, no SQL beyond the repository.
//
// ⚠ EVERY POINTS RULE IS @effy/edge-shared/points. This file decides only what is back-office's to
// decide: who is asking (the CSA limit, from the staff RECORD — Principle IV), and when to meter and
// announce (after the commit, never inside it).
import {
  emitMetric, formatCents, hasStaffRole, metricNamespace, OUTWARD_ACTION_ROLES, pooled, withTransaction,
  type Queryable, type Transactor,
} from "@effy/edge-shared";
import {
  announcePointsFor, balanceSummary, credit, debit, history, loadSettings, OverAgentLimitError, settingsHistory, updateSettings,
  type PointsSettingsPatch,
} from "@effy/edge-shared/points";
import type {
  CustomerDetailDTO, CustomerSearchResultDTO, PointsChangeResultDTO, PointsCreditRequest, PointsDebitRequest,
  PointsSettingsDTO, StaffPointsHistoryPageDTO,
} from "@effy/shared-types";

import * as repo from "./repository";

/** Raised for a customer id that does not exist (or is not a uuid). */
export class CustomerNotFoundError extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CustomerServiceDeps {
  db?: Queryable;
  transact?: Transactor;
  /** Admin or manager — the roles with no credit limit, and the only ones that may debit. */
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
    async search(q: string): Promise<CustomerSearchResultDTO[]> {
      return (await repo.search(q)).map((r) => ({ id: r.id, name: r.name, email: r.email, points: r.points, orderCount: r.order_count }));
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

    async history(id: string, cursor: string | undefined, limit: number): Promise<StaffPointsHistoryPageDTO> {
      const c = await requireCustomer(id);
      const page = await history(db, c.id, { cursor, limit }, { staff: true });
      return {
        entries: page.lines.map((l) => ({ ...l, at: l.at.toISOString() })),
        ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      };
    },

    /**
     * Credit points. A customer-service agent may credit up to the business's per-credit limit; admins
     * and managers have none (FR-007). The limit is read inside the same transaction as the credit, so
     * a settings change cannot slip between the check and the write.
     */
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

    /** Debit points (admin, manager — the handler's gate). Refused when more than is usable. */
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
      const [s, changes] = await Promise.all([loadSettings(db), settingsHistory(db)]);
      return {
        centsPerPoint: s.centsPerPoint, expiryMonths: s.expiryMonths, csaCreditLimitPoints: s.csaCreditLimitPoints,
        warningDays: s.warningDays, holdMinutes: s.holdMinutes,
        history: changes.map((h) => ({ ...h, changedAt: h.changedAt.toISOString() })),
      };
    },

    async updateSettings(actorSub: string, patch: PointsSettingsPatch): Promise<PointsSettingsDTO> {
      await transact((tx) => updateSettings(tx, patch, actorSub));
      return this.settings();
    },
  };
}

export type CustomerService = ReturnType<typeof createCustomerService>;

/** Module-scope singleton (ARCHITECTURE.md): built once per container. */
export const customerService = createCustomerService();
