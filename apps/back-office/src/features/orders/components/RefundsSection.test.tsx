import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dismissProposal = vi.hoisted(() => vi.fn());
const issueRefund = vi.hoisted(() => vi.fn());
const declineRefundRequest = vi.hoisted(() => vi.fn());
vi.mock("../refundRepo", () => ({ dismissProposal, issueRefund, declineRefundRequest }));

const { RefundsSection } = await import("./RefundsSection");

const BASE = {
  id: "o1",
  refunds: [],
  refundedAmount: "0.00",
  refundableAmount: "30.00",
  refundableLines: [
    { orderItemId: "oi1", productName: "Milk", quantity: 3, unitPriceAmount: "10.00" },
  ],
  proposedRefunds: [],
  refundRequest: null,
} as unknown as Parameters<typeof RefundsSection>[0]["order"];

function renderSection(over: Partial<typeof BASE> = {}, canIssue = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return render(<RefundsSection order={{ ...BASE, ...over }} canIssue={canIssue} />, { wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  dismissProposal.mockResolvedValue({ dismissed: true });
  declineRefundRequest.mockResolvedValue({ status: "declined" });
});

const PROPOSAL = {
  orderItemId: "oi1",
  productName: "Milk",
  quantity: 2,
  amount: "20.00",
  reason: "item_not_supplied" as const,
};

describe("a refund the platform's own records say is owed", () => {
  it("is shown with what is short and what it is worth", async () => {
    renderSection({ proposedRefunds: [PROPOSAL] });

    // ⚠ Scoped to the proposals section: "Milk" is also a selectable line in the refund control
    // below, and an unscoped query would pass whichever one it found first.
    const heading = await screen.findByText(/owed but not refunded/i);
    const section = within(heading.closest("section")!);
    expect(section.getByText("Milk")).toBeInTheDocument();
    expect(section.getByText(/2 short/)).toBeInTheDocument();
    expect(section.getByText("20.00")).toBeInTheDocument();
  });

  // ⚠ Deciding a customer is NOT owed money they paid for is as consequential as deciding they are,
  // and it is the decision nobody comes back to check.
  it("cannot be dismissed without a reason", async () => {
    renderSection({ proposedRefunds: [PROPOSAL] });
    await userEvent.click(await screen.findByRole("button", { name: /not owed/i }));

    const confirm = await screen.findByRole("button", { name: /^dismiss$/i });
    expect(confirm).toBeDisabled();
    expect(dismissProposal).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(/why is this not owed/i), "shop substituted");
    await waitFor(() => expect(confirm).toBeEnabled());
    await userEvent.click(confirm);

    await waitFor(() => expect(dismissProposal).toHaveBeenCalledWith("o1", "oi1", "shop substituted"));
  });

  it("offers no dismissal at all to someone who cannot issue refunds", async () => {
    renderSection({ proposedRefunds: [PROPOSAL] }, false);

    // Still VISIBLE — a csa taking the call must be able to see that money is owed.
    expect(await screen.findByText(/owed but not refunded/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /not owed/i })).not.toBeInTheDocument();
  });
});

describe("the write controls follow the backend's own gate", () => {
  it("hides the refund control from a reader", async () => {
    renderSection({}, false);
    expect(await screen.findByText(/refunds/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^refund…$/i })).not.toBeInTheDocument();
  });

  it("shows it to a writer", async () => {
    renderSection({}, true);
    expect(await screen.findByRole("button", { name: /^refund…$/i })).toBeInTheDocument();
  });
});

describe("refund history", () => {
  const REFUND = {
    id: "r1",
    kind: "item" as const,
    amount: "10.00",
    reason: "item_not_supplied" as const,
    status: "failed" as const,
    failureReason: "card_declined",
    note: null,
    lines: [{ orderItemId: "oi1", productName: "Milk", quantity: 1, amount: "10.00" }],
    actorKind: "back_office" as const,
    actorLabel: "Sam Okafor",
    createdAt: "2026-08-29T04:00:00.000Z",
    settledAt: null,
  };

  // ⚠ The five states exist because each pair answers a different question. Collapsing them leaves
  // staff unable to tell a stuck attempt from a dead one.
  it("distinguishes a failure that can be retried from a refusal that cannot", async () => {
    renderSection({
      refunds: [REFUND, { ...REFUND, id: "r2", status: "refused", failureReason: "not_permitted" }],
      refundedAmount: "10.00",
    });

    expect(await screen.findByText(/failed — needs attention/i)).toBeInTheDocument();
    expect(screen.getByText(/refused — cannot be retried/i)).toBeInTheDocument();
  });

  it("shows staff the provider's reason", async () => {
    renderSection({ refunds: [REFUND], refundedAmount: "10.00" });
    expect(await screen.findByText("card_declined")).toBeInTheDocument();
  });

  it("says nothing has been refunded rather than rendering an empty table", async () => {
    renderSection();
    expect(await screen.findByText(/nothing has been refunded on this order/i)).toBeInTheDocument();
  });

  it("names the lines a refund covered, and the note behind a goodwill one", async () => {
    renderSection({
      refunds: [
        REFUND,
        {
          ...REFUND,
          id: "r3",
          kind: "goodwill",
          reason: "goodwill",
          status: "succeeded",
          failureReason: null,
          note: "delivered two hours late",
          lines: [],
        },
      ],
      refundedAmount: "20.00",
    });

    expect(await screen.findByText(/1 × Milk/)).toBeInTheDocument();
    expect(screen.getByText(/goodwill — delivered two hours late/i)).toBeInTheDocument();
  });
});

describe("a customer's own request", () => {
  it("is shown in their words, with the items they named", async () => {
    renderSection({
      refundRequest: {
        id: "rq1",
        message: "Two cartons were missing",
        status: "open",
        items: [{ orderItemId: "oi1", productName: "Milk", quantity: 2 }],
        outcomeNote: null,
        createdAt: "2026-08-29T04:00:00.000Z",
        decidedAt: null,
      },
    });

    expect(await screen.findByText("Two cartons were missing")).toBeInTheDocument();
    expect(screen.getByText(/2 × Milk/)).toBeInTheDocument();
  });

  it("is not shown once it has been decided", async () => {
    renderSection({
      refundRequest: {
        id: "rq1",
        message: "Two cartons were missing",
        status: "refunded",
        items: [],
        outcomeNote: "refunded in full",
        createdAt: "2026-08-29T04:00:00.000Z",
        decidedAt: "2026-08-29T05:00:00.000Z",
      },
    });

    expect(screen.queryByText(/the customer has asked for a refund/i)).not.toBeInTheDocument();
  });
});

// ⚠ FR-005f / T038 — THE ONLY QUESTION ANYONE ASKS ABOUT A REFUND IS "DID THE MONEY GO?", and a
// staff member must be able to answer it from this screen alone.
describe("did the money go?", () => {
  const R = {
    id: "r1",
    kind: "item" as const,
    amount: "10.00",
    reason: "item_not_supplied" as const,
    note: null,
    lines: [],
    actorKind: "back_office" as const,
    actorLabel: "Sam Okafor",
    createdAt: "2026-08-29T04:00:00.000Z",
    settledAt: null,
    failureReason: null,
  };

  it.each([
    ["submitting", /no answer from the bank/i],
    ["submitted", /on its way/i],
    ["succeeded", /^refunded$/i],
    ["failed", /failed — needs attention/i],
    ["refused", /refused — cannot be retried/i],
  ])("says plainly what %s means", async (status, expected) => {
    renderSection({
      refunds: [{ ...R, status, failureReason: status === "failed" ? "card_declined" : null }],
      refundedAmount: "10.00",
    } as never);
    expect(await screen.findByText(expected)).toBeInTheDocument();
  });

  // ⚠ `submitting` is the ABSENCE of an answer, not progress. An operator told "sending to the bank"
  // waits for something that may never come; one told nobody answered escalates, which is the only
  // useful thing to do with it.
  it("never describes an unanswered submission as being in progress", async () => {
    renderSection({ refunds: [{ ...R, status: "submitting" }], refundedAmount: "0.00" } as never);
    const row = (await screen.findByText(/no answer from the bank/i)).closest("tr")!;
    expect(row.textContent ?? "").not.toMatch(/sending|on its way|refunded/i);
  });

  // ⚠ FR-010. Somebody returned money by hand in the provider's dashboard. The order must show it, or
  // staff read a total that does not match the bank.
  it("shows a refund issued outside Effy, and says so", async () => {
    renderSection({
      refunds: [
        {
          ...R,
          kind: "external",
          reason: "external",
          status: "succeeded",
          // ⚠ An `external` refund is `system`, not `back_office`. The migration is explicit: it "has
          // no lines and no Effy actor, because the platform genuinely does not know either", and
          // `refund_actor_sub_ck` makes `system` the ONLY kind permitted a null subject.
          actorKind: "system" as const,
          actorLabel: null,
          note: "Issued outside Effy, in the payment provider.",
        },
      ],
      refundedAmount: "10.00",
    } as never);

    expect(await screen.findByText(/issued outside effy/i)).toBeInTheDocument();
    // ⚠ 057 changed this cell, and improved it. It used to render a bare "—" for any refund whose
    // label did not resolve — which conflated "nobody did this, it came from the provider" with "we
    // could not work out who did this". Naming the pool makes the first case say so, and is what
    // stops a shop-issued refund (US5) from silently reading as unattributable.
    expect(screen.getByText("Automatic")).toBeInTheDocument();
  });
});


const OPEN_REQUEST = {
  id: "rq1",
  message: "Two cartons were missing",
  status: "open" as const,
  items: [{ orderItemId: "oi1", productName: "Milk", quantity: 2 }],
  outcomeNote: null,
  createdAt: "2026-08-30T04:00:00.000Z",
  decidedAt: null,
};

describe("answering a customer's request", () => {
  // ⚠ Telling a customer they are not owed money they believe they are owed is as consequential as
  // paying them, and it is the decision nobody comes back to check.
  it("cannot be declined without a reason", async () => {
    renderSection({ refundRequest: OPEN_REQUEST });
    await userEvent.click(await screen.findByRole("button", { name: /decline this request/i }));

    const confirm = await screen.findByRole("button", { name: /^decline$/i });
    expect(confirm).toBeDisabled();
    expect(declineRefundRequest).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(/why are you declining/i), "photo shows all six");
    await waitFor(() => expect(confirm).toBeEnabled());
    await userEvent.click(confirm);

    await waitFor(() =>
      expect(declineRefundRequest).toHaveBeenCalledWith("rq1", "photo shows all six"),
    );
  });

  // ⚠ A csa reads every order — triage is their work — and decides nothing.
  it("offers no decline control to someone who cannot issue refunds", async () => {
    renderSection({ refundRequest: OPEN_REQUEST }, false);
    expect(await screen.findByText("Two cartons were missing")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /decline this request/i })).not.toBeInTheDocument();
  });

  // ⚠ There is no "mark as refunded" button: issuing the refund closes the request. A request marked
  // answered without money moving would be a lie in the record.
  it("offers no way to close a request without either paying or declining", async () => {
    renderSection({ refundRequest: OPEN_REQUEST });
    expect(screen.queryByRole("button", { name: /mark as refunded|resolve|close/i })).toBeNull();
  });

  // ⚠ One statement, one outcome. A reply box would be half a support product — replies arriving
  // with nobody assigned to answer them.
  it("offers no reply box", async () => {
    renderSection({ refundRequest: OPEN_REQUEST });
    expect(screen.queryByLabelText(/reply|respond|message the customer/i)).toBeNull();
  });
});
