import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DeliverySlotDTO } from "@effy/shared-types";

const repo = vi.hoisted(() => ({
  listSlots: vi.fn(),
  createSlot: vi.fn(),
  patchSlot: vi.fn(),
}));
vi.mock("../repo", async () => ({ ...(await vi.importActual<object>("../repo")), ...repo }));

const { SlotsPanel } = await import("./SlotsPanel");

const slot = (over: Partial<DeliverySlotDTO> = {}): DeliverySlotDTO => ({
  id: "s1", startTime: "17:00", endTime: "19:00", cutoffTime: "15:00", capacity: 3,
  status: "active", bookedToday: 1, overCapacityToday: 0, updatedAt: "2026-10-04T00:00:00.000Z",
  ...over,
});

function renderPanel(canManage = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return render(<SlotsPanel canManage={canManage} />, { wrapper });
}

/** A refusal as `@effy/api-client` throws it: a plain object, NOT an Error (053's lesson). */
const refusal = (status: number, fields?: { field: string; message: string }[]) => ({
  kind: "unknown", status, title: "Refused", fields,
});

beforeEach(() => {
  vi.clearAllMocks();
  repo.listSlots.mockResolvedValue([slot(), slot({ id: "s2", startTime: "19:00", endTime: "21:00", cutoffTime: "17:00", bookedToday: 3 })]);
  repo.createSlot.mockResolvedValue(slot({ id: "s3" }));
  repo.patchSlot.mockResolvedValue(slot());
});

describe("SlotsPanel — what an operator reads", () => {
  it("lists each slot's window, its order-by time and how full it is today", async () => {
    renderPanel();
    const row = (await screen.findByText("17:00 – 19:00")).closest("tr")!;
    expect(within(row).getByText("15:00")).toBeInTheDocument();
    const cells = within(row).getAllByRole("cell").map((c) => c.textContent);
    expect(cells.slice(0, 4)).toEqual(["17:00 – 19:00", "15:00", "3", "1"]);

    const full = screen.getByText("19:00 – 21:00").closest("tr")!;
    expect(within(full).getAllByRole("cell")[3]).toHaveTextContent("3Full");
  });

  it("⚠ shows 'No limit' in the limit column for a slot without one — never 'null', never 'Full'", async () => {
    repo.listSlots.mockResolvedValue([slot({ capacity: null, bookedToday: 40 })]);
    renderPanel();
    const row = (await screen.findByText("17:00 – 19:00")).closest("tr")!;
    const cells = within(row).getAllByRole("cell").map((c) => c.textContent);
    expect(cells.slice(2, 4)).toEqual(["No limit", "40"]);
    expect(within(row).queryByText("Full")).not.toBeInTheDocument();
    expect(within(row).queryByText(/null/)).not.toBeInTheDocument();
  });

  it("says in words when a late payer took a slot over capacity", async () => {
    repo.listSlots.mockResolvedValue([slot({ bookedToday: 4, overCapacityToday: 1 })]);
    renderPanel();
    expect(await screen.findByText("1 over capacity")).toBeInTheDocument();
  });

  it("⚠ warns when no slot is active — same-day is then offered to nobody", async () => {
    repo.listSlots.mockResolvedValue([slot({ status: "disabled" })]);
    renderPanel();
    expect(await screen.findByRole("status")).toHaveTextContent(/same-day delivery is not being offered/i);
  });

  it("warns the same way when there are no slots at all", async () => {
    repo.listSlots.mockResolvedValue([]);
    renderPanel();
    expect(await screen.findByRole("status")).toHaveTextContent(/not being offered/i);
  });

  it("shows no warning while a slot is active", async () => {
    renderPanel();
    await screen.findByText("17:00 – 19:00");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("SlotsPanel — who may change a slot (FR-039)", () => {
  it("a role that cannot manage delivery sees the slots and no control to change them", async () => {
    renderPanel(false);
    await screen.findByText("17:00 – 19:00");
    expect(screen.queryByRole("button", { name: /new slot/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /switch off/i })).not.toBeInTheDocument();
  });

  it("there is no way to delete a slot — only to switch it off", async () => {
    renderPanel();
    await screen.findByText("17:00 – 19:00");
    expect(screen.queryByRole("button", { name: /delete|remove/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Switch off" })[0]!);
    await waitFor(() => expect(repo.patchSlot).toHaveBeenCalledWith("s1", { status: "disabled" }));
  });
});

describe("SlotsPanel — creating and editing", () => {
  async function openNew() {
    renderPanel();
    await userEvent.click(await screen.findByRole("button", { name: /new slot/i }));
    return screen.getByRole("dialog");
  }

  it("creates a slot from the four fields", async () => {
    const dialog = await openNew();
    await userEvent.type(within(dialog).getByLabelText(/starts/i), "10:00");
    await userEvent.type(within(dialog).getByLabelText(/ends/i), "12:00");
    await userEvent.type(within(dialog).getByLabelText(/order by/i), "08:00");
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /limit how many deliveries/i }));
    await userEvent.type(within(dialog).getByLabelText(/deliveries it can take/i), "12");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create slot" }));

    await waitFor(() =>
      expect(repo.createSlot).toHaveBeenCalledWith({ startTime: "10:00", endTime: "12:00", cutoffTime: "08:00", capacity: 12 }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("⚠ creates a slot with NO limit by default — the limit is unticked and its field is not shown", async () => {
    const dialog = await openNew();
    expect(within(dialog).getByRole("checkbox", { name: /limit how many deliveries/i })).not.toBeChecked();
    expect(within(dialog).queryByLabelText(/deliveries it can take/i)).not.toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText(/starts/i), "10:00");
    await userEvent.type(within(dialog).getByLabelText(/ends/i), "12:00");
    await userEvent.type(within(dialog).getByLabelText(/order by/i), "08:00");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create slot" }));

    await waitFor(() =>
      expect(repo.createSlot).toHaveBeenCalledWith({ startTime: "10:00", endTime: "12:00", cutoffTime: "08:00", capacity: null }),
    );
  });

  it("⚠ puts a named refusal ON its field, in the console's own words — never the server's", async () => {
    repo.createSlot.mockRejectedValue(
      refusal(400, [
        { field: "endTime", message: "SERVER PROSE end" },
        { field: "capacity", message: "SERVER PROSE capacity" },
      ]),
    );
    const dialog = await openNew();
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /limit how many deliveries/i }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Create slot" }));

    expect(await within(dialog).findByText("The slot must end after it starts.")).toBeInTheDocument();
    expect(within(dialog).getByText("Enter a limit as a whole number of at least 1, or untick the limit.")).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/ends/i)).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText(/SERVER PROSE/)).not.toBeInTheDocument();
    // The dialog stays open with what was typed.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("says a duplicate window is a duplicate", async () => {
    repo.createSlot.mockRejectedValue(refusal(409));
    const dialog = await openNew();
    await userEvent.click(within(dialog).getByRole("button", { name: "Create slot" }));
    expect(await within(dialog).findByText(/already a slot with these start and end times/i)).toBeInTheDocument();
  });

  it("edits a slot, prefilled, and says what lowering capacity below today's bookings means", async () => {
    renderPanel();
    await screen.findByText("19:00 – 21:00");
    await userEvent.click(screen.getAllByRole("button", { name: "Edit" })[1]!);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("checkbox", { name: /limit how many deliveries/i })).toBeChecked();
    const capacity = within(dialog).getByLabelText(/deliveries it can take/i);
    expect(capacity).toHaveValue("3");

    await userEvent.clear(capacity);
    await userEvent.type(capacity, "2");
    expect(within(dialog).getByText(/3 deliveries are already booked today\. They keep their place/i)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Save slot" }));
    await waitFor(() =>
      expect(repo.patchSlot).toHaveBeenCalledWith("s2", { startTime: "19:00", endTime: "21:00", cutoffTime: "17:00", capacity: 2 }),
    );
  });

  it("⚠ removes a limit by unticking it — sent as null, not 0", async () => {
    renderPanel();
    await screen.findByText("19:00 – 21:00");
    await userEvent.click(screen.getAllByRole("button", { name: "Edit" })[1]!);
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /limit how many deliveries/i }));
    expect(within(dialog).queryByLabelText(/deliveries it can take/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/already booked today/i)).not.toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("button", { name: "Save slot" }));
    await waitFor(() =>
      expect(repo.patchSlot).toHaveBeenCalledWith("s2", { startTime: "19:00", endTime: "21:00", cutoffTime: "17:00", capacity: null }),
    );
  });
});
