import { useEffect, useState } from "react";

import { ArrowLeft, CircleAlert } from "lucide-react";

import { useForm } from "@tanstack/react-form";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardHeading,
  CardTitle,
  Input,
  OtpInput,
  Label,
} from "@effy/design-system/ui";

import {
  isStaleSignInSession,
  otpErrorMessage,
  START_SIGN_IN_ERROR,
  startSignIn,
  submitOtp,
} from "../auth/otp";

/**
 * ⚠ The on-screen copy is deliberately uniform (no existence oracle), which also made every failure
 * UNDIAGNOSABLE — the email step discarded the exception outright. The exception NAME (never the
 * message, never the address) goes to the console so the next report carries the actual cause.
 */
function logSignInFailure(stage: "start" | "otp", err: unknown): void {
  const name = (err as { name?: string } | null)?.name ?? "UnknownError";
  console.warn(`[auth] sign-in ${stage} failed: ${name}`);
}

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
  /**
   * ⚠ 057 — `"bare"` drops the card frame and the title/description header, leaving only the form.
   * The shop console's sign-in is a column on the page ground rather than a card floating on it, and
   * its heading lives in the page. Omitted (the default) renders exactly as it always has, which is
   * what keeps back-office untouched.
   */
  /**
   * `"page"` (back-office redesign, board "Sign in") — the form as the page's own column: its heading
   * ("Sign in to …" / "Check your email") is the form's, controls are the large size, the code is six
   * cells that submit on the sixth digit, and a new code can be asked for after a minute.
   */
  chrome?: "card" | "bare" | "page";
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
  chrome = "card",
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
      } catch (err) {
        logSignInFailure("start", err);
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
        logSignInFailure("otp", err);
        setFormError(otpErrorMessage(err));
        // The challenge state expired locally — the code box can no longer be checked by anyone, so
        // return to the email step (address kept) where one tap sends a fresh code.
        if (isStaleSignInSession(err)) {
          otpForm.reset();
          setStep("email");
        }
        onSignInFailed?.("otp");
      }
    },
  });

  // `page` — a new code can be asked for once a minute; the code box submits on the sixth digit.
  const [resendIn, setResendIn] = useState(0);
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);
  useEffect(() => {
    if (step === "otp") setResendIn(60);
  }, [step]);

  if (chrome === "page") {
    const error = formError ? (
      <p className="flex items-center gap-1.5 text-[13px] font-medium text-destructive" role="alert">
        <CircleAlert aria-hidden="true" className="size-3.5 shrink-0" />
        {formError}
      </p>
    ) : null;

    return step === "email" ? (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void emailForm.handleSubmit();
        }}
        className="w-full max-w-[360px] space-y-6"
        noValidate
      >
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in to {title}</h1>
          <p className="text-sm text-muted-foreground">Sign in with your work email — we'll send a one-time code.</p>
        </div>
        <emailForm.Field name="email">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="email">Work email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                autoFocus
                required
                aria-invalid={formError ? true : undefined}
                className="h-11! text-[15px]"
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
              />
            </div>
          )}
        </emailForm.Field>
        {error}
        <emailForm.Subscribe selector={(st) => st.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" size="xl" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Sending…" : "Send code"}
            </Button>
          )}
        </emailForm.Subscribe>
        <p className="text-xs text-muted-foreground">
          There are no passwords for staff. Access is set up by an administrator — ask yours if you can't get in.
        </p>
      </form>
    ) : (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void otpForm.handleSubmit();
        }}
        className="w-full max-w-[360px] space-y-6"
        noValidate
      >
        <button
          type="button"
          className="inline-flex w-fit items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
          onClick={() => {
            setFormError(null);
            otpForm.reset();
            setStep("email");
          }}
        >
          <ArrowLeft aria-hidden="true" className="size-3.5" />
          Use a different email
        </button>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
          <p className="text-sm text-muted-foreground">
            Enter the code we sent to <span className="font-medium text-foreground">{email}</span>.
          </p>
        </div>
        <otpForm.Field name="code">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor="code">One-time code</Label>
              <OtpInput
                id="code"
                variant="cells"
                autoFocus
                required
                aria-invalid={formError ? true : undefined}
                value={field.state.value}
                onChange={(e) => {
                  field.handleChange(e.target.value);
                  if (/^\d{6}$/.test(e.target.value.trim())) void otpForm.handleSubmit();
                }}
                onBlur={field.handleBlur}
              />
              {error}
              <p className="text-[13px] text-muted-foreground">Pasting the code works. It signs you in as soon as the sixth digit is in.</p>
            </div>
          )}
        </otpForm.Field>
        <otpForm.Subscribe selector={(st) => st.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" size="xl" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Verifying…" : "Verify & sign in"}
            </Button>
          )}
        </otpForm.Subscribe>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground" aria-live="polite">
            {resendIn > 0 ? `Send a new code in ${Math.floor(resendIn / 60)}:${String(resendIn % 60).padStart(2, "0")}` : "Didn't get it?"}
          </span>
          <Button
            type="button"
            variant="link"
            disabled={resendIn > 0}
            onClick={async () => {
              setFormError(null);
              try {
                await startSignIn(email);
                otpForm.reset();
                setResendIn(60);
              } catch (err) {
                logSignInFailure("start", err);
                setFormError(START_SIGN_IN_ERROR);
              }
            }}
          >
            Resend code
          </Button>
        </div>
        {/* ⚠ THE UNIFORM ESCAPE HATCH (037 FR-030a) — shown to everyone, always; see below. */}
        <p className="text-xs text-muted-foreground" data-testid="stuck-note">
          Still not arriving? Check your spam folder, or write to{" "}
          <a className="underline underline-offset-2" href="mailto:hello@effyshopping.com">
            hello@effyshopping.com
          </a>
        </p>
      </form>
    );
  }

  const body = (
    <>
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
                  {/* ⚠ The label text is matched by four test files across three packages —
                      changing it breaks shop-web, back-office and web-kit's own suites at once. */}
                  <Label htmlFor="code">One-time code</Label>
                  {/* 035 — the SHARED code field. Behaviour (autofill token, numeric keyboard, one
                      logical a11y node, no reshaping of a wrong-length paste) lives in one place
                      rather than being re-declared per surface (FR-035). */}
                  <OtpInput
                    id="code"
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

            {/*
              ⚠ THE UNIFORM ESCAPE HATCH (037 FR-030a). Shown to EVERYONE, always — never
              conditioned on whether the platform can actually reach this address.

              It matters most HERE. Shop, driver and back-office are strictly passwordless: an
              emailed code is their ONLY credential, so an address that has silently stopped
              accepting mail is a total lockout with no self-service way back. This line is the way
              back.

              ⚠ It must not become conditional. Delivery state is only knowable for an address the
              platform has emailed, so varying this copy would answer "does this address have an Effy
              account?" to anyone who types one — the enumeration oracle 035 exists to close. The
              honest, specific statement lives on authenticated surfaces instead (FR-030).
            */}
            <p className="text-center text-xs text-muted-foreground" data-testid="stuck-note">
              Still not arriving?{" "}
              <a className="underline underline-offset-2" href="mailto:hello@effyshopping.com">
                hello@effyshopping.com
              </a>
            </p>
          </form>
        )}
    </>
  );

  // ⚠ The step description is the ONE piece of the header that carries state ("Enter the code we sent
  // to …"), so `bare` keeps it and drops only the frame and the title. Losing it would leave an
  // operator staring at six empty boxes with no idea which inbox to check.
  const description =
    step === "email"
      ? "Sign in with your work email — we'll send a one-time code."
      : `Enter the code we sent to ${email}.`;

  if (chrome === "bare") {
    return (
      <div className="w-full max-w-sm space-y-4">
        <p className="text-muted-foreground text-sm">{description}</p>
        {body}
      </div>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardHeading>
          <CardTitle className="text-primary">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeading>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
