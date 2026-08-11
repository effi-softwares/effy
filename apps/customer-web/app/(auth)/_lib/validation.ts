"use client"

import * as React from "react"

import { EMAIL_MAX_LENGTH, isEmailShape } from "@effy/shared-types"

/**
 * Field validation for the authentication screens (044 US2).
 *
 * ⚠ WHY THIS EXISTS AT ALL. Every field on these screens used to delegate its refusal to the browser.
 * That has three consequences, and the third is the expensive one:
 *
 *  1. The message is a browser-drawn bubble — unstyled, transient, easy to miss on a phone, and not
 *     in the platform's voice.
 *  2. Nothing is checked when the customer LEAVES a field, only when they submit.
 *  3. ⚠ The browser's own `type="email"` rule **accepts `person@example`**. Measured against the
 *     shipped build (BASELINE.md), such an address is accepted at all three email entry points, a
 *     real request goes out to Cognito, and on sign-up the shopper is ADVANCED to the code step — to
 *     wait for a code that cannot arrive, on a screen that deliberately cannot tell them why, because
 *     distinguishing "not delivered" from "wrong code" would leak whether an account exists.
 *
 * ⚠ NO FORM LIBRARY, and that is a recorded deviation from the locked web stack (plan → Complexity
 * Tracking). The whole requirement is: is this field touched, is its value acceptable, what do we say
 * if not, and clear it when it becomes acceptable. `apps/customer-web` is the one app that carries a
 * bundle budget with as little as 0.1 KB of headroom, and 019 shipped its cart dependency-free for the
 * same reason.
 *
 * ⚠ THE RULE ITSELF IS NOT DEFINED HERE. `isEmailShape` comes from `@effy/shared-types`, extracted
 * from the newsletter Lambda that already owned it, so the client refuses **exactly** what the server
 * refuses. A client with a stricter opinion than the server is a bug the customer cannot work around;
 * a client with a looser one is how the code got emailed into the void in the first place.
 */

export type FieldRule =
  | { kind: "required"; message: string }
  | { kind: "emailShape"; message: string }
  | { kind: "minLength"; min: number; message: string }

export type FieldConfig = {
  /**
   * ⚠ ORDER IS SIGNIFICANT AND FIXED: `required` first, always. An empty field must report that it
   * is empty, never that its format is wrong — "that doesn't look like an email address" is a
   * baffling thing to be told about a field you have not filled in (V-13).
   */
  rules: FieldRule[]
  /**
   * The DOM id to focus when this field is the first problem on submit. Defaults to the field key.
   */
  id?: string
  /**
   * ⚠ PASSWORDS ARE NOT TRIMMED. Leading and trailing whitespace in a password is part of the
   * password; trimming it here would refuse a credential the platform would have accepted, or worse,
   * accept a different one than the customer typed (V-23). Identifiers and names ARE trimmed —
   * whitespace there is a paste artefact, not content (FR-015).
   */
  trim?: boolean
}

/**
 * The message for a value, or `null` if it is acceptable.
 *
 * ⚠ DERIVED, NEVER STORED. Keeping the message beside the value in state is how a corrected field
 * keeps a stale error: the value changes, nothing recomputes, and the shopper is told they are still
 * wrong about something they have already fixed (FR-013, V-12).
 */
export function messageFor(config: FieldConfig, raw: string): string | null {
  const value = config.trim === false ? raw : raw.trim()
  for (const rule of config.rules) {
    switch (rule.kind) {
      case "required":
        // ⚠ A whitespace-only value is EMPTY, not malformed. The browser's own `required` is
        // satisfied by a single space (defect D-12).
        if (value.length === 0) return rule.message
        break
      case "emailShape":
        if (!isEmailShape(value)) return rule.message
        break
      case "minLength":
        if (value.length < rule.min) return rule.message
        break
    }
  }
  return null
}

/** The shared length ceiling, re-exported so a call site does not have to reach past this module. */
export { EMAIL_MAX_LENGTH }

/**
 * Per-field `touched` / `submitted` bookkeeping, and the submit gate.
 *
 * The visibility rule is ONE rule, stated once: a message is shown when there is one **and** the
 * field has been touched **or** the form has been submitted. Anything more elaborate produces a form
 * that greets a first-time visitor with errors, which is the failure mode of eager validation.
 */
export function useFieldValidation<K extends string>(config: Record<K, FieldConfig>) {
  const [touched, setTouched] = React.useState<Partial<Record<K, boolean>>>({})
  const [submitted, setSubmitted] = React.useState(false)

  /** The message to render beside `name` right now — `null` means render nothing. */
  const show = React.useCallback(
    (name: K, value: string): string | null => {
      if (!touched[name] && !submitted) return null
      return messageFor(config[name], value)
    },
    // `config` is a literal declared at the call site and stable in practice; the fields it names
    // never change within a step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [touched, submitted],
  )

  /**
   * Call from `onBlur`.
   *
   * ⚠ Only marks the field touched if the customer actually entered something (V-09). Arriving in a
   * field and tabbing straight back out is not a mistake, and shouting about it teaches people to
   * stop reading the messages.
   */
  const blur = React.useCallback((name: K, value: string) => {
    if (value.trim().length === 0) return
    setTouched((t) => (t[name] ? t : { ...t, [name]: true }))
  }, [])

  /**
   * Validate the given fields. Returns `true` when the caller may proceed.
   *
   * ⚠ THE CALLER PASSES AN EXPLICIT LIST, AND THAT IS NOT A CONVENIENCE. A step validates the fields
   * IT is asking for and no others — the first version of this took the whole value object and
   * validated everything in it, which meant the email step refused to advance because the password
   * (a field it does not show, on a step that does not ask for it) was empty. It would have broken
   * the platform's DEFAULT way in. The e2e caught it; a signature that cannot express "these fields"
   * is what made it expressible at all.
   *
   * The list order is the focus order: on failure the form is marked submitted (so every listed
   * field reveals its message, including ones the customer never entered) and focus moves to the
   * first problem (V-08, FR-014).
   */
  const check = React.useCallback(
    (entries: Array<[K, string]>): boolean => {
      setSubmitted(true)
      for (const [name, value] of entries) {
        if (messageFor(config[name], value) === null) continue
        const id = config[name].id ?? name
        // The field may not be mounted (a hidden step), in which case there is nothing to focus and
        // the refusal still stands.
        document.getElementById(id)?.focus()
        return false
      }
      return true
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  /** Forget everything — called when a step changes, so the next step starts clean. */
  const reset = React.useCallback(() => {
    setTouched({})
    setSubmitted(false)
  }, [])

  return { show, blur, check, reset }
}
