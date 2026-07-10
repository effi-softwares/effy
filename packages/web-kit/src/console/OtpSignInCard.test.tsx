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
