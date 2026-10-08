import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FeePlanDTO, PlanGapCode, PlanGapDTO } from "@effy/shared-types";

const repo = vi.hoisted(() => ({
  listPlans: vi.fn(),
  createPlan: vi.fn(),
  replacePlan: vi.fn(),
  activatePlan: vi.fn(),
  simulateFee: vi.fn(),
  listSlots: vi.fn(),
}));
vi.mock("../repo", async () => ({ ...(await vi.importActual<object>("../repo")), ...repo }));

const { PricingPanel } = await import("./PricingPanel");
const { gapText } = await import("./gapText");
const { toInput, emptyDraft } = await import("./planDraft");

const plan = (over: Partial<FeePlanDTO> = {}): FeePlanDTO => ({
  id: "p-active", kind: "effy", name: "Launch", state: "active",
  baseAmount: "0.00",
  distanceBands: [{ upperKm: "10.00", addAmount: "6.00" }, { upperKm: null, addAmount: "15.00" }],
  weightBands: [{ upperGrams: 2000, addAmount: "0.00" }],
  freeOverAmount: null, smallOrderUnderAmount: null, smallOrderFeeAmount: null,
  todayPremiumAmount: "3.00", slotPremiums: [], roundingStepAmount: "0.50", floorAmount: "4.00", capAmount: "60.00",
  gaps: [], createdBy: "m", createdAt: "2026-10-08T00:00:00Z", activatedBy: "m", activatedAt: "2026-10-08T01:00:00Z",
  ...over,
});
const draft = plan({
  id: "p-draft", name: "Spring", state: "draft", activatedAt: null, activatedBy: null,
  distanceBands: [{ upperKm: "30.00", addAmount: "6.00" }],
  gaps: [{ code: "distance_open_band_missing", blocking: true, detail: { lastUpperKm: 30 } }],
});

/** A refusal as `@effy/api-client` throws it: a plain object, NOT an Error. */
const refusal = (status: number, code: string, fields?: { field: string; message: string }[]) => ({ kind: "unknown", status, title: "Refused", code, fields });

function renderPanel(canManage = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return render(<PricingPanel canManage={canManage} />, { wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.listPlans.mockImplementation(async (kind: string) => (kind === "effy" ? [plan(), draft] : []));
  repo.listSlots.mockResolvedValue([]);
});

describe("Pricing — fee plans (077)", () => {
  it("lists plans with their state, and how much a draft still needs", async () => {
    renderPanel();
    const active = (await screen.findByText("Launch")).closest("tr")!;
    expect(within(active).getByText("Active")).toBeInTheDocument();
    expect(within(active).queryByRole("button", { name: "Activate" })).toBeNull();
    const d = screen.getByText("Spring").closest("tr")!;
    expect(within(d).getByText("Draft")).toBeInTheDocument();
    expect(within(d).getByText("1 to fix")).toBeInTheDocument();
  });

  it("activating a draft that has a gap shows what is missing in words, and cannot be pressed", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(within((await screen.findByText("Spring")).closest("tr")!).getByRole("button", { name: "Activate" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/It replaces Launch/)).toBeInTheDocument();
    expect(within(dialog).getByText(/stop at 30 km\. Add a last band with no upper limit/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Activate" })).toBeDisabled();
    expect(repo.activatePlan).not.toHaveBeenCalled();
  });

  it("a $0 minimum must be confirmed before Activate is enabled, and the confirmation is sent", async () => {
    const user = userEvent.setup();
    repo.listPlans.mockResolvedValue([plan(), { ...draft, gaps: [{ code: "floor_is_zero", blocking: false, detail: {} }] }]);
    repo.activatePlan.mockResolvedValue(plan());
    renderPanel();
    await user.click(within((await screen.findByText("Spring")).closest("tr")!).getByRole("button", { name: "Activate" }));
    const dialog = await screen.findByRole("dialog");
    const go = within(dialog).getByRole("button", { name: "Activate" });
    expect(go).toBeDisabled();
    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(go);
    await waitFor(() => expect(repo.activatePlan).toHaveBeenCalledWith("p-draft", true));
  });

  it("an active plan opens read-only; a manager can copy it to a new draft", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(within((await screen.findByText("Launch")).closest("tr")!).getByRole("button", { name: "Open" }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText(/can't be changed — copy it to a new draft/)).toBeInTheDocument();
    expect(within(sheet).getByLabelText("Name")).toBeDisabled();
    expect(within(sheet).queryByRole("button", { name: /draft/ })).toBeNull();
  });

  it("a customer-service agent sees everything and can change nothing", async () => {
    renderPanel(false);
    const row = (await screen.findByText("Spring")).closest("tr")!;
    expect(within(row).queryByRole("button", { name: "Activate" })).toBeNull();
    expect(within(row).queryByRole("button", { name: "Copy to new draft" })).toBeNull();
    expect(screen.queryByRole("button", { name: /New plan/ })).toBeNull();
    // …but may try a plan: that is how a fee is explained to a customer.
    expect(screen.getByRole("button", { name: "Work it out" })).toBeInTheDocument();
  });

  it("a refused save shows the service's word on the field it named", async () => {
    const user = userEvent.setup();
    repo.createPlan.mockRejectedValue(refusal(422, "invalid_plan", [{ field: "capAmount", message: "the maximum fee must be a multiple of the rounding step (0.50)" }]));
    renderPanel();
    await user.click(await screen.findByRole("button", { name: /New plan/ }));
    const sheet = await screen.findByRole("dialog");
    await user.type(within(sheet).getByLabelText("Name"), "Bad");
    await user.click(within(sheet).getByRole("button", { name: "Create draft" }));
    expect(await within(sheet).findByText("the maximum fee must be a multiple of the rounding step (0.50)")).toBeInTheDocument();
    expect(within(sheet).getByText("Check the highlighted values.")).toBeInTheDocument();
  });

  it("the simulator shows the customer's lines and every step", async () => {
    const user = userEvent.setup();
    repo.simulateFee.mockResolvedValue({
      coverage: "effy", plan: { id: "p-active", name: "Launch", kind: "effy", state: "active" },
      fee: { lines: [{ kind: "delivery", amount: "6.00" }, { kind: "free_delivery", amount: "-6.00" }], totalAmount: "0.00" },
      steps: [{ label: "Distance", detail: "3.4 km — the band up to 10 km", amount: "6.00" }, { label: "Total", detail: "what the customer pays for delivery", amount: "0.00" }],
      note: null,
    });
    renderPanel(false);
    await user.type(await screen.findByLabelText("Postcode"), "3121");
    await user.click(screen.getByRole("button", { name: "Work it out" }));
    expect(await screen.findByText("Free delivery")).toBeInTheDocument();
    expect(screen.getByText("−$6.00")).toBeInTheDocument();
    expect(screen.getByText("3.4 km — the band up to 10 km")).toBeInTheDocument();
    expect(repo.simulateFee).toHaveBeenCalledWith(expect.objectContaining({ postcode: "3121", grams: 1000, basketAmount: "50.00", planId: null }));
  });
});

describe("gapText — every gap has a sentence", () => {
  const all: PlanGapDTO[] = (
    [
      ["distance_bands_missing", {}],
      ["distance_open_band_missing", { lastUpperKm: 30 }],
      ["weight_bands_missing", {}],
      ["distance_not_monotonic", { lowerKm: 10, lowerAmount: 3, upperKm: null, upperAmount: 1 }],
      ["weight_not_monotonic", { lowerGrams: 5000, lowerAmount: 2, upperGrams: 9000, upperAmount: 1 }],
      ["floor_is_zero", {}],
      ["premium_on_disabled_slot", { slotId: "s", start: "20:00", end: "21:00" }],
    ] as [PlanGapCode, PlanGapDTO["detail"]][]
  ).map(([code, detail]) => ({ code, blocking: true, detail }));

  it.each(all)("$code", (gap) => {
    const text = gapText(gap);
    expect(text.length).toBeGreaterThan(20);
    expect(text).not.toMatch(/undefined|NaN|\[object/);
  });

  it("names the bands that are out of order", () => {
    expect(gapText(all[3]!)).toBe("The last band ($1.00) costs less than the band up to 10 km ($3.00). A farther delivery cannot cost less.");
  });
});

describe("toInput — what is sent", () => {
  it("sends the open distance band last whatever row it was typed on, and weights in grams", () => {
    const d = emptyDraft("effy");
    d.distanceBands = [{ upperKm: "", addAmount: "5.00" }, { upperKm: "10", addAmount: "0.00" }];
    d.weightBands = [{ upperKg: "2.5", addAmount: "1.00" }];
    const out = toInput("effy", d);
    expect(out.distanceBands).toEqual([{ upperKm: "10", addAmount: "0.00" }, { upperKm: null, addAmount: "5.00" }]);
    expect(out.weightBands).toEqual([{ upperGrams: 2500, addAmount: "1.00" }]);
  });

  it("a courier table sends no distance, window or small-order values", () => {
    const d = emptyDraft("courier");
    d.smallOrderUnderAmount = "20.00";
    d.slotPremiums = { s: "2.00" };
    const out = toInput("courier", d);
    expect(out).toMatchObject({ distanceBands: [], slotPremiums: [], smallOrderUnderAmount: null, todayPremiumAmount: "0.00" });
  });
});
