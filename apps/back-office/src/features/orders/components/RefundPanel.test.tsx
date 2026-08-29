import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const issueRefund = vi.hoisted(() => vi.fn());
vi.mock("../refundRepo", () => ({ issueRefund }));

const { RefundPanel } = await import("./RefundPanel");

const LINES = [
  { orderItemId: "oi1", productName: "Milk", quantity: 3, unitPriceAmount: "10.00" },
  { orderItemId: "oi2", productName: "Bread", quantity: 1, unitPriceAmount: "4.50" },
];

function renderPanel(lines = LINES) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return render(<RefundPanel orderId="o1" lines={lines} refundableAmount="34.50" />, { wrapper });
}

async function confirm() {
  await userEvent.click(await screen.findByRole("button", { name: /^refund…$/i }));
  await userEvent.click(await screen.findByRole("button", { name: /^refund \d/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  issueRefund.mockResolvedValue({
    refundId: "r1", amount: "10.00", status: "submitted", remainingAmount: "24.50",
  });
});

describe("the amount is computed, never typed (FR-003 / A7a)", () => {
  it("derives it from the selected lines and sends NO amount", async () => {
    renderPanel();
    await userEvent.click(await screen.findByLabelText(/milk/i));
    await confirm();

    await waitFor(() => expect(issueRefund).toHaveBeenCalled());
    const body = issueRefund.mock.calls[0]![1];
    expect(body.lines).toEqual([{ orderItemId: "oi1", quantity: 1 }]);
    // ⚠ If an amount travelled beside the lines the two could disagree, and the record would claim a
    // refund covered items it did not. The server rejects one; the client must not send one.
    expect(body).not.toHaveProperty("amount");
  });

  it("shows the computed figure and offers no way to edit it", async () => {
    renderPanel();
    await userEvent.click(await screen.findByLabelText(/milk/i));
    expect(await screen.findByText("10.00")).toBeInTheDocument();
    // The only editable number for a line is its QUANTITY — never the money.
    expect(screen.queryByLabelText(/^amount$/i)).not.toBeInTheDocument();
  });

  it("cannot submit with nothing selected", async () => {
    renderPanel();
    expect(await screen.findByRole("button", { name: /^refund…$/i })).toBeDisabled();
  });
});

// ⚠ T031. This is the only control in the console that moves money, and refunding is irreversible.
describe("confirmation", () => {
  it("does NOT issue on the first click — it asks, naming the amount", async () => {
    renderPanel();
    await userEvent.click(await screen.findByLabelText(/milk/i));
    await userEvent.click(screen.getByRole("button", { name: /^refund…$/i }));

    expect(issueRefund).not.toHaveBeenCalled();
    expect(await screen.findByText(/refund 10\.00 to the customer\?/i)).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
  });

  it("issues nothing when the operator cancels", async () => {
    renderPanel();
    await userEvent.click(await screen.findByLabelText(/milk/i));
    await userEvent.click(screen.getByRole("button", { name: /^refund…$/i }));
    await userEvent.click(await screen.findByRole("button", { name: /^cancel$/i }));

    expect(issueRefund).not.toHaveBeenCalled();
  });
});

describe("goodwill", () => {
  it("requires both an amount and a note before it can be submitted", async () => {
    renderPanel();
    await userEvent.click(screen.getByLabelText(/kind/i));
    await userEvent.click(await screen.findByRole("option", { name: /goodwill/i }));

    const submit = await screen.findByRole("button", { name: /^refund…$/i });
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/^amount$/i), "5.00");
    expect(submit).toBeDisabled(); // ⚠ still — an amount with no explanation is unaccountable
    await userEvent.type(screen.getByLabelText(/^why$/i), "delivered late");
    await waitFor(() => expect(submit).toBeEnabled());
  });
});

describe("what the operator is told", () => {
  // ⚠ FR-007. "Refunded" would make staff stop watching a refund the bank can still reject.
  it("says the money is ON ITS WAY, never that it has been refunded", async () => {
    renderPanel();
    await userEvent.click(await screen.findByLabelText(/milk/i));
    await confirm();

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(/on its way/i);
    expect(status.textContent ?? "").not.toMatch(/\brefunded\b/i);
  });

  it("states what remains refundable, so the next step is obvious", async () => {
    renderPanel();
    await userEvent.click(await screen.findByLabelText(/milk/i));
    await confirm();
    expect(await screen.findByRole("status")).toHaveTextContent(/24\.50 remains refundable/i);
  });

  // ⚠ 053's defect, checked on the screen it happened on: every refusal collapsed to one sentence
  // because the code tested `e instanceof Error` while the api client throws a PLAIN OBJECT.
  it("reads a refusal off the plain object the api client actually throws", async () => {
    issueRefund.mockRejectedValue({
      kind: "validation", status: 400, title: "Request validation failed",
      detail: "only 4.50 remains refundable",
    });
    renderPanel();
    await userEvent.click(await screen.findByLabelText(/milk/i));
    await confirm();

    expect(await screen.findByRole("alert")).toHaveTextContent(/only 4\.50 remains refundable/i);
  });

  // ⚠ THE MOST IMPORTANT PIECE OF COPY IN THIS COMPONENT. On an ambiguous failure the refund may
  // already have reached the provider; telling an operator to "try again" is how a customer gets
  // refunded twice.
  it("on an unreachable service, tells the operator to CHECK — not to retry", async () => {
    issueRefund.mockRejectedValue({ kind: "unavailable", status: 503, title: "Service unavailable" });
    renderPanel();
    await userEvent.click(await screen.findByLabelText(/milk/i));
    await confirm();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/check the order/i);
    expect(alert).toHaveTextContent(/may already have been submitted/i);
  });

  it("does not render the server's raw internals", async () => {
    issueRefund.mockRejectedValue({
      kind: "validation", status: 400,
      detail: "pq: insert or update on table \"refund\" violates constraint refund_order_id_fkey",
    });
    renderPanel();
    await userEvent.click(await screen.findByLabelText(/milk/i));
    await confirm();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent ?? "").not.toMatch(/pq:|violates|fkey/);
  });
});

describe("a fully refunded order", () => {
  it("says so rather than showing an empty list of lines", async () => {
    renderPanel([]);
    expect(await screen.findByText(/every line on this order is fully refunded/i)).toBeInTheDocument();
  });
});
