import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const { signIn, confirmSignIn } = vi.hoisted(() => ({
  signIn: vi.fn(),
  confirmSignIn: vi.fn(),
}));

vi.mock("aws-amplify/auth", () => ({
  signIn,
  confirmSignIn,
  signOut: vi.fn(),
  fetchAuthSession: vi.fn(),
}));

import { OtpSignInCard } from "./OtpSignInCard";

function renderCard(onAuthenticated = vi.fn()) {
  render(<OtpSignInCard title="Effy Test" onAuthenticated={onAuthenticated} />);
  return onAuthenticated;
}

describe("OtpSignInCard", () => {
  it("advances from the email step to the OTP step after a code is sent", async () => {
    signIn.mockResolvedValue({ nextStep: { signInStep: "CONFIRM_SIGN_IN_WITH_EMAIL_CODE" } });
    const user = userEvent.setup();
    renderCard();

    await user.type(screen.getByLabelText(/work email/i), "  op@effy.test  ");
    await user.click(screen.getByRole("button", { name: /send code/i }));

    // The email is trimmed before it reaches Cognito.
    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith(expect.objectContaining({ username: "op@effy.test" })),
    );
    expect(await screen.findByLabelText(/one-time code/i)).toBeInTheDocument();
  });

  it("completes when the code is accepted", async () => {
    signIn.mockResolvedValue({ nextStep: { signInStep: "CONFIRM_SIGN_IN_WITH_EMAIL_CODE" } });
    confirmSignIn.mockResolvedValue({ nextStep: { signInStep: "DONE" } });
    const onAuthenticated = vi.fn();
    const user = userEvent.setup();
    renderCard(onAuthenticated);

    await user.type(screen.getByLabelText(/work email/i), "op@effy.test");
    await user.click(screen.getByRole("button", { name: /send code/i }));
    await user.type(await screen.findByLabelText(/one-time code/i), "123456");
    await user.click(screen.getByRole("button", { name: /verify & sign in/i }));

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledOnce());
  });

  // An unprovisioned email and a provisioned one must look identical — no existence oracle.
  it("shows uniform copy when the email step fails, revealing nothing", async () => {
    signIn.mockRejectedValue(Object.assign(new Error("x"), { name: "UserNotFoundException" }));
    const user = userEvent.setup();
    renderCard();

    await user.type(screen.getByLabelText(/work email/i), "ghost@effy.test");
    await user.click(screen.getByRole("button", { name: /send code/i }));

    const error = await screen.findByText(/couldn't send a code/i);
    expect(error.textContent).not.toMatch(/not found|exist|unknown/i);
  });

  it("maps a wrong code to actionable copy without leaking the exception", async () => {
    signIn.mockResolvedValue({ nextStep: { signInStep: "CONFIRM_SIGN_IN_WITH_EMAIL_CODE" } });
    confirmSignIn.mockRejectedValue(
      Object.assign(new Error("x"), { name: "CodeMismatchException" }),
    );
    const user = userEvent.setup();
    renderCard();

    await user.type(screen.getByLabelText(/work email/i), "op@effy.test");
    await user.click(screen.getByRole("button", { name: /send code/i }));
    await user.type(await screen.findByLabelText(/one-time code/i), "000000");
    await user.click(screen.getByRole("button", { name: /verify & sign in/i }));

    expect(await screen.findByText(/isn't right/i)).toBeInTheDocument();
    expect(screen.queryByText(/CodeMismatchException/)).not.toBeInTheDocument();
  });

  it("never renders a password field — no Effy pool has passwords", () => {
    renderCard();
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });
});

/**
 * 035 — the shared code field's contract on the console surfaces (T112).
 *
 * ⚠ The `One-time code` label is matched by FOUR test files across three packages. It is asserted
 * here too so that a rename fails in the package that OWNS the component, rather than only in the
 * two apps that consume it.
 */
describe("the one-time-code field (035)", () => {
  async function reachCodeStep() {
    // ⚠ Note the step name: the console still accepts the MANAGED factor's step during rollout, so
    // this fixture keeps working whichever flow the pool is serving (FR-033, FR-034).
    signIn.mockResolvedValue({ nextStep: { signInStep: "CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE" } });
    const user = userEvent.setup();
    renderCard();
    await user.type(screen.getByLabelText(/work email/i), "op@effy.test");
    await user.click(screen.getByRole("button", { name: /send code/i }));
    return screen.findByLabelText(/one-time code/i);
  }

  it("⚠ accepts the CUSTOM CHALLENGE step, which is what the platform now sends", async () => {
    // This is the branch that did not exist before 035. `otp.ts`'s switch has a THROWING default,
    // so an unhandled step would take down shop-web and back-office simultaneously.
    const field = await reachCodeStep();
    expect(field).toBeInTheDocument();
  });

  it("renders ONE labelled input, not a grid of per-digit boxes", async () => {
    await reachCodeStep();
    // FR-025: exactly one logical field. Segmented widgets are how screen-reader users lose their
    // place; mobile-kit's OtpInput carries the same invariant.
    expect(screen.getAllByLabelText(/one-time code/i)).toHaveLength(1);
  });

  it("⚠ asks for a numeric keyboard and offers OS autofill (FR-026)", async () => {
    const field = await reachCodeStep();
    expect(field).toHaveAttribute("inputmode", "numeric");
    expect(field).toHaveAttribute("autocomplete", "one-time-code");
  });

  it("caps the field at six characters", async () => {
    const field = await reachCodeStep();
    expect(field).toHaveAttribute("maxlength", "6");
  });
});
