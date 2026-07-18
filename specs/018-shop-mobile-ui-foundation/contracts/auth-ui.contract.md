# Contract: Shop Authentication UI

## Public boundary

The signed-out shop app exposes one credential journey only:

```text
work email → request EMAIL_OTP → one logical code field → explicit Sign in
```

There is no password, registration, recovery, guest route, or alternate pool.

## Screen contract

### Email state

- Effy identity, concise work-email instruction, one email field, one primary action.
- Field and action remain reachable with keyboard open and at large text sizes.
- Invalid local input is inline; unknown/unprovisioned identity remains enumeration-safe.
- Submission disables duplicate actions and shows progress without replacing the button geometry.

### Code state

- Masked destination, one logical code editor, explicit Sign in, Resend code, and Use different email.
- Paste/replacement of the entire code works in one operation.
- Wrong/expired/network failures preserve useful input and announce one polite error.
- Resend has Disabled/Loading/Available states and a non-announced cooldown.
- iOS may offer native one-time-code QuickType; Android must not mislabel email OTP as SMS OTP.
- Autofill is convenience only; manual entry/paste always completes the flow.

## Security invariants

- SDK exception text, raw OTP, access/id token, subject, and full credential never appear in UI logs.
- User-not-found and not-authorized map to the same message.
- Successful code confirmation is not sufficient for shell access; SessionManager must load the
  authoritative operator record.
- Refused state exposes no detail about the failed authorization term.

## Interaction and semantics

- Email→Code uses forward transition; Use different email uses reverse; reduced motion removes translation.
- Each field has label, error association, keyboard action, and one focus node.
- Error insertion does not unexpectedly clear input or shift focus.
- Ordinary back from Code returns Email; successful sign-in removes auth from the reachable back stack.

## Test obligations

- Every AuthUiState transition in data-model.md.
- Rapid repeated submit/resend invokes each use case at most once while busy.
- Paste, whitespace normalization, invalid input, error preservation, back, resend cooldown, and successful
  SessionManager handoff.
- TalkBack/VoiceOver label, focus order, and error announcement.
