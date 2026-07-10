import { useState } from "react";

import { useForm } from "@tanstack/react-form";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@effy/design-system/ui";

import { otpErrorMessage, START_SIGN_IN_ERROR, startSignIn, submitOtp } from "../auth/otp";

/**
 * The passwordless sign-in card: email → one-time code → done.
 *
 * There is no password field, because no Effy pool has passwords. The email step's failure copy is
 * uniform whether or not the account exists — the form must never become an account-existence
 * oracle, so a "user not found" and a "network blip" read identically.
 *
 * Navigation and telemetry belong to the surface, so they arrive as callbacks.
 */
export interface OtpSignInCardProps {
  title: string;
  /** Fired when the flow completes and a session exists. The surface navigates. */
  onAuthenticated: () => Promise<void> | void;
  /** Optional analytics hooks — the surface owns its event taxonomy. */
  onSignInStarted?: () => void;
  onOtpSubmitted?: () => void;
  onSignInFailed?: (reason: "start" | "otp") => void;
}

type Step = "email" | "otp";

export function OtpSignInCard({
  title,
  onAuthenticated,
  onSignInStarted,
  onOtpSubmitted,
  onSignInFailed,
}: OtpSignInCardProps) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const emailForm = useForm({
    defaultValues: { email: "" },
    onSubmit: async ({ value }) => {
      setFormError(null);
      onSignInStarted?.();
      try {
        const trimmed = value.email.trim();
        const outcome = await startSignIn(trimmed);
        setEmail(trimmed);
        if (outcome === "otp-required") setStep("otp");
        else await onAuthenticated();
      } catch {
        setFormError(START_SIGN_IN_ERROR);
        onSignInFailed?.("start");
      }
    },
  });

  const otpForm = useForm({
    defaultValues: { code: "" },
    onSubmit: async ({ value }) => {
      setFormError(null);
      onOtpSubmitted?.();
      try {
        await submitOtp(value.code.trim());
        await onAuthenticated();
      } catch (err) {
        setFormError(otpErrorMessage(err));
        onSignInFailed?.("otp");
      }
    },
  });

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-primary">{title}</CardTitle>
        <CardDescription>
          {step === "email"
            ? "Sign in with your work email — we'll send a one-time code."
            : `Enter the code we sent to ${email}.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {step === "email" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void emailForm.handleSubmit();
            }}
            className="space-y-4"
            noValidate
          >
            <emailForm.Field name="email">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="email">Work email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    required
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                </div>
              )}
            </emailForm.Field>
            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
            <emailForm.Subscribe selector={(s) => s.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Sending…" : "Send code"}
                </Button>
              )}
            </emailForm.Subscribe>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void otpForm.handleSubmit();
            }}
            className="space-y-4"
            noValidate
          >
            <otpForm.Field name="code">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor="code">One-time code</Label>
                  <Input
                    id="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    required
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                  />
                </div>
              )}
            </otpForm.Field>
            {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
            <otpForm.Subscribe selector={(s) => s.isSubmitting}>
              {(isSubmitting) => (
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Verifying…" : "Verify & sign in"}
                </Button>
              )}
            </otpForm.Subscribe>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setFormError(null);
                setStep("email");
              }}
            >
              Use a different email
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
