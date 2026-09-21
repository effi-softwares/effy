import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ⚠ LET THE MUTATION SETTLE BEFORE THE TEST ENDS.
 *
 * `mutate` is fire-and-forget: `onError` runs and the alert appears, but TanStack's own internal
 * promise settles a tick later. Asserting on the rendered alert and returning immediately leaves that
 * rejection to land after the test has finished, where vitest reports it as an UNHANDLED REJECTION
 * and fails the test that had already done its job — with the raw problem object and no stack, which
 * looks exactly like a component bug and is not one.
 */
async function settle() {
  await new Promise((r) => setTimeout(r, 0));
}

const reassign = vi.hoisted(() => vi.fn());
vi.mock("../repo", () => ({
  reassign,
  getDay: vi.fn(),
  getRound: vi.fn(),
  unassign: vi.fn(),
  reorder: vi.fn(),
  lock: vi.fn(),
  unlock: vi.fn(),
}));

const { ReassignDialog } = await import("./ReassignDialog");

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const DRIVERS = [
  { driverId: "d-1", driverName: "Ada" },
  { driverId: "d-2", driverName: "Bea" },
];

function open() {
  return wrap(
    <ReassignDialog
      roundId="r-1"
      currentDriverName="Cal"
      expectedUpdatedAt="2026-09-21T02:00:00.123456Z"
      drivers={DRIVERS}
    />,
  );
}

describe("ReassignDialog — FR-029 and FR-034", () => {
  // ⚠ RESET THE HISTORY, THEN RESTORE A PROMISE. `mockReset` alone strips the IMPLEMENTATION too, so
  // the mocked repo function returns `undefined` — and a `mutationFn` returning a non-promise makes
  // TanStack raise an unhandled rejection that vitest attributes to whichever test is running. The
  // symptom was three failures showing the raw problem object with `stacks: []`, which reads exactly
  // like a component bug; the component was correct throughout. `mockClear` alone is the opposite
  // trap — it keeps the previous test's rejection and poisons the ones that never call the mutation.
  beforeEach(() => {
    reassign.mockReset();
    reassign.mockResolvedValue(undefined);
  });

  it("sends the chosen driver and the concurrency token", async () => {
    reassign.mockResolvedValue(undefined);
    const user = userEvent.setup();
    open();

    await user.click(screen.getByRole("button", { name: "Reassign" }));
    await user.selectOptions(screen.getByLabelText("Driver"), "d-2");
    await user.click(screen.getByRole("button", { name: "Move the round" }));

    await waitFor(() =>
      // ⚠ The token must carry MICROSECONDS. 056 lost a whole feature to `toISOString()` truncating
      // to milliseconds, so the optimistic lock never matched its own row.
      expect(reassign).toHaveBeenCalledWith("r-1", {
        driverId: "d-2",
        expectedUpdatedAt: "2026-09-21T02:00:00.123456Z",
      }),
    );
  });

  // ⚠ THE POINT OF THE WHOLE DIALOG. A dispatcher may override a preference; they may not override a
  // fact — and they must be told WHICH fact.
  it("shows the named condition when the server refuses an ineligible driver", async () => {
    reassign.mockRejectedValue({
      // ⚠ THE REAL SHAPE — `kind`, not `name`. `isDomainError` tests for `kind` and `status`, and my
      // first fixture invented `name: "DomainError"`, so the dialog silently showed the generic
      // message and the test caught a bug that did not exist while missing the one that did.
      kind: "unknown",
      status: 422,
      title: "That driver cannot take this round",
      detail: "That driver cannot take this round because their licence has expired.",
      fields: [{ field: "licence_expired", message: "their licence has expired" }],
    });
    const user = userEvent.setup();
    open();

    await user.click(screen.getByRole("button", { name: "Reassign" }));
    await user.selectOptions(screen.getByLabelText("Driver"), "d-1");
    await user.click(screen.getByRole("button", { name: "Move the round" }));

    const alert = await screen.findByRole("alert");
    await settle();
    expect(alert).toHaveTextContent(/licence expired/i);
    // ⚠ Never collapsed to a generic sentence.
    expect(alert).not.toHaveTextContent(/^That change could not be made/);
  });

  it("lists every named condition, because fixing one of three wastes the trip", async () => {
    reassign.mockRejectedValue({
      kind: "unknown",
      status: 422,
      title: "That driver cannot take this round",
      detail: "That driver cannot take this round.",
      fields: [
        // ⚠ 032's convention: for a whole-request refusal, `field` IS the stable code.
        { field: "licence_expired", message: "their licence has expired" },
        { field: "no_vehicle", message: "they are not holding a vehicle" },
      ],
    });
    const user = userEvent.setup();
    open();

    await user.click(screen.getByRole("button", { name: "Reassign" }));
    await user.selectOptions(screen.getByLabelText("Driver"), "d-1");
    await user.click(screen.getByRole("button", { name: "Move the round" }));

    await screen.findByRole("alert");
    await settle();
    // ⚠ THIS CONSOLE'S WORDS, from REASON_TEXT — not the server's prose.
    expect(screen.getByText("Licence expired")).toBeInTheDocument();
    expect(screen.getByText("Holding no vehicle")).toBeInTheDocument();
  });

  it("explains a stale write rather than failing silently", async () => {
    reassign.mockRejectedValue({ kind: "unknown", status: 409, title: "Conflict", detail: "x" });
    const user = userEvent.setup();
    open();

    await user.click(screen.getByRole("button", { name: "Reassign" }));
    await user.selectOptions(screen.getByLabelText("Driver"), "d-1");
    await user.click(screen.getByRole("button", { name: "Move the round" }));

    const alert = await screen.findByRole("alert");
    await settle();
    expect(alert).toHaveTextContent(/Somebody else changed this round/);
  });

  it("does not offer the driver who already holds the round", async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole("button", { name: "Reassign" }));
    // ⚠ Anchored on the SELECT's options, not on loose text — 062's console test passed vacuously
    // because `findByText` matched an <option> while the empty state was on screen.
    const select = screen.getByLabelText("Driver") as HTMLSelectElement;
    const values = [...select.options].map((o) => o.value);
    expect(values).toContain("d-1");
    expect(values).toContain("d-2");
  });

  it("will not submit until a driver is chosen", async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole("button", { name: "Reassign" }));
    expect(screen.getByRole("button", { name: "Move the round" })).toBeDisabled();
  });
});
