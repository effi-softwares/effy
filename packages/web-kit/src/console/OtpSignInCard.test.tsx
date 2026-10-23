import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const { signIn, confirmSignIn, signOut } = vi.hoisted(() => ({
  signIn: vi.fn(),
  confirmSignIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("aws-amplify/auth", () => ({
  signIn,
  confirmSignIn,
  signOut,
  fetchAuthSession: vi.fn(),
}));

import { OtpSignInCard } from "./OtpSignInCard";

function renderCard(onAuthenticated = vi.fn()) {
  render(<OtpSignInCard title="Effy Test" onAuthenticated={onAuthenticated} />);
  return onAuthenticated;
}

describe("OtpSignInCard", () => {
  it("advances from the email step to the OTP step after a code is sent", async () => {
    signIn.mockResolvedValue({ nextStep: { signInStep: "CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE" } });
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
    signIn.mockResolvedValue({ nextStep: { signInStep: "CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE" } });
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

  // Unprovisioned and provisioned addresses look identical: no existence oracle.
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
    signIn.mockResolvedValue({ nextStep: { signInStep: "CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE" } });
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

  it("⚠ recovers from a leftover session instead of needing 'clear site data'", async () => {
    signIn.mockReset();
    signOut.mockReset().mockResolvedValue(undefined);
    signIn
      .mockRejectedValueOnce(
        Object.assign(new Error("x"), { name: "UserAlreadyAuthenticatedException" }),
      )
      .mockResolvedValueOnce({ nextStep: { signInStep: "CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE" } });
    const user = userEvent.setup();
    renderCard();

    await user.type(screen.getByLabelText(/work email/i), "op@effy.test");
    await user.click(screen.getByRole("button", { name: /send code/i }));

    expect(await screen.findByLabelText(/one-time code/i)).toBeInTheDocument();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(signIn).toHaveBeenCalledTimes(2);
  });

  it("does not sign out for any other email-step failure", async () => {
    signIn.mockReset();
    signOut.mockReset();
    signIn.mockRejectedValue(Object.assign(new Error("x"), { name: "LimitExceededException" }));
    const user = userEvent.setup();
    renderCard();

    await user.type(screen.getByLabelText(/work email/i), "op@effy.test");
    await user.click(screen.getByRole("button", { name: /send code/i }));

    await screen.findByText(/couldn't send a code/i);
    expect(signOut).not.toHaveBeenCalled();
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it("returns to the email step when the local challenge state has expired", async () => {
    signIn.mockReset();
    signIn.mockResolvedValue({ nextStep: { signInStep: "CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE" } });
    confirmSignIn.mockRejectedValue(Object.assign(new Error("x"), { name: "SignInException" }));
    const user = userEvent.setup();
    renderCard();

    await user.type(screen.getByLabelText(/work email/i), "op@effy.test");
    await user.click(screen.getByRole("button", { name: /send code/i }));
    await user.type(await screen.findByLabelText(/one-time code/i), "123456");
    await user.click(screen.getByRole("button", { name: /verify & sign in/i }));

    expect(await screen.findByText(/timed out/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/work email/i)).toHaveValue("op@effy.test");
  });

  it("never renders a password field — no Effy pool has passwords", () => {
    renderCard();
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });
});

/** The shared code field's contract on the console surfaces. The `One-time code` label is matched by several test files. */
describe("the one-time-code field (035)", () => {
  async function reachCodeStep() {
    signIn.mockResolvedValue({ nextStep: { signInStep: "CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE" } });
    const user = userEvent.setup();
    renderCard();
    await user.type(screen.getByLabelText(/work email/i), "op@effy.test");
    await user.click(screen.getByRole("button", { name: /send code/i }));
    return screen.findByLabelText(/one-time code/i);
  }

  it("⚠ accepts the CUSTOM CHALLENGE step, which is what the platform now sends", async () => {
    // `otp.ts`'s switch throws on an unhandled step, which would take down both consoles.
    const field = await reachCodeStep();
    expect(field).toBeInTheDocument();
  });

  it("renders ONE labelled input, not a grid of per-digit boxes", async () => {
    await reachCodeStep();
    // Exactly one logical field: segmented widgets lose screen-reader users.
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
