// Effy's tax identity is entered, never inferred, and the ABN checksum is verified. Invoices turn on
// only when name, ABN and fee treatment are set and no live product is unclassified.
import { query, withTransaction } from "@effy/edge-shared";
import { isGstStatus, isValidAbn } from "@effy/edge-shared/documents";
import type { TaxSettingsDTO } from "@effy/shared-types";

export class TaxSettingsRefusal extends Error {
  constructor(readonly status: 409 | 422, readonly code: "abn_invalid" | "tax_setup_incomplete" | "invalid", message: string, readonly missing: string[] = []) {
    super(message);
  }
}

async function unclassified(db: { query: (t: string, v?: unknown[]) => Promise<any> }): Promise<number> {
  const r = await db.query(
    `SELECT count(*)::int AS n FROM public.product WHERE gst_status IS NULL AND approved_at IS NOT NULL AND status <> 'archived'`,
  );
  return Number(r.rows[0]?.n ?? 0);
}

export async function getTaxSettings(): Promise<TaxSettingsDTO> {
  const [row, n] = await Promise.all([
    query<{ legal_name: string | null; abn: string | null; fee_treatment: "taxable" | "gst_free" | null; invoices_enabled: boolean }>(
      `SELECT legal_name, abn, fee_treatment, invoices_enabled FROM public.business_tax LIMIT 1`,
    ).then((r) => r.rows[0]),
    unclassified({ query: (t, v) => query(t, v as unknown[]) }),
  ]);
  return {
    legalName: row?.legal_name ?? null,
    abn: row?.abn ?? null,
    feeTreatment: row?.fee_treatment ?? null,
    invoicesEnabled: row?.invoices_enabled === true,
    unclassifiedProducts: n,
  };
}

export async function putTaxSettings(sub: string, body: Record<string, unknown>): Promise<TaxSettingsDTO> {
  const legalName = typeof body.legalName === "string" && body.legalName.trim() !== "" ? body.legalName.trim() : null;
  if (legalName !== null && (legalName.length < 2 || legalName.length > 200)) {
    throw new TaxSettingsRefusal(422, "invalid", "the legal name must be 2–200 characters");
  }
  const abn = typeof body.abn === "string" && body.abn.trim() !== "" ? body.abn.replace(/\s+/g, "") : null;
  if (abn !== null && !isValidAbn(abn)) throw new TaxSettingsRefusal(422, "abn_invalid", "that is not a valid ABN - check the 11 digits");
  const feeTreatment = body.feeTreatment === null || body.feeTreatment === undefined ? null : body.feeTreatment;
  if (feeTreatment !== null && !isGstStatus(feeTreatment)) throw new TaxSettingsRefusal(422, "invalid", "fee treatment must be taxable or GST-free");
  const enable = body.invoicesEnabled === true;

  return withTransaction(async (tx) => {
    if (enable) {
      const missing = [
        ...(legalName ? [] : ["legal name"]),
        ...(abn ? [] : ["ABN"]),
        ...(feeTreatment ? [] : ["fee treatment"]),
        ...((await unclassified(tx)) > 0 ? ["a GST status on every live product"] : []),
      ];
      if (missing.length > 0) {
        throw new TaxSettingsRefusal(409, "tax_setup_incomplete", `Tax invoices need: ${missing.join(", ")}.`, missing);
      }
    }
    await tx.query(
      `INSERT INTO public.business_tax (id, legal_name, abn, fee_treatment, invoices_enabled, updated_by_sub, updated_at)
       VALUES (true, $1, $2, $3, $4, $5, now())
       ON CONFLICT (id) DO UPDATE
          SET legal_name = EXCLUDED.legal_name, abn = EXCLUDED.abn, fee_treatment = EXCLUDED.fee_treatment,
              invoices_enabled = EXCLUDED.invoices_enabled, updated_by_sub = EXCLUDED.updated_by_sub, updated_at = now()`,
      [legalName, abn, feeTreatment, enable, sub],
    );
    await tx.query(
      `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail) VALUES ($1, 'tax_settings.updated', 'business_tax', NULL, $2::jsonb)`,
      [sub, JSON.stringify({ changed: ["legalName", "abn", "feeTreatment", "invoicesEnabled"], values: { feeTreatment, invoicesEnabled: enable } })],
    );
    return getTaxSettingsIn(tx);
  });
}

async function getTaxSettingsIn(tx: { query: (t: string, v?: unknown[]) => Promise<any> }): Promise<TaxSettingsDTO> {
  const row = (await tx.query(`SELECT legal_name, abn, fee_treatment, invoices_enabled FROM public.business_tax LIMIT 1`)).rows[0];
  return {
    legalName: row?.legal_name ?? null,
    abn: row?.abn ?? null,
    feeTreatment: row?.fee_treatment ?? null,
    invoicesEnabled: row?.invoices_enabled === true,
    unclassifiedProducts: await unclassified(tx),
  };
}
