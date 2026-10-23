"use client"

import * as React from "react"

import { EMAIL_MAX_LENGTH, isEmailShape } from "@effy/shared-types"

/**
 * Field validation for the auth screens, in the platform's voice and on leaving a field (the browser's
 * `type="email"` accepts `person@example`, which would send a code that can never arrive). No form
 * library (the bundle budget). `isEmailShape` comes from `@effy/shared-types`, so the client refuses
 * exactly what the server refuses.
 */

export type FieldRule =
  | { kind: "required"; message: string }
  | { kind: "emailShape"; message: string }
  | { kind: "minLength"; min: number; message: string }

export type FieldConfig = {
  /** Order is fixed: `required` first, so an empty field says it is empty, not malformed. */
  rules: FieldRule[]
  /** The DOM id to focus when this is the first problem on submit; defaults to the field key. */
  id?: string
  /** Passwords are not trimmed (whitespace is part of them); identifiers and names are. */
  trim?: boolean
}

/** The message for a value, or `null` if acceptable. Derived, never stored, so a corrected field never keeps a stale error. */
export function messageFor(config: FieldConfig, raw: string): string | null {
  const value = config.trim === false ? raw : raw.trim()
  for (const rule of config.rules) {
    switch (rule.kind) {
      case "required":
        // Whitespace-only is empty, not malformed (the browser's `required` accepts a space).
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

/** The shared length ceiling, re-exported. */
export { EMAIL_MAX_LENGTH }

/** Per-field touched/submitted bookkeeping and the submit gate: a message shows when there is one and the field was touched or the form submitted. */
export function useFieldValidation<K extends string>(config: Record<K, FieldConfig>) {
  const [touched, setTouched] = React.useState<Partial<Record<K, boolean>>>({})
  const [submitted, setSubmitted] = React.useState(false)

  /** The message to render beside `name` now; `null` renders nothing. */
  const show = React.useCallback(
    (name: K, value: string): string | null => {
      if (!touched[name] && !submitted) return null
      return messageFor(config[name], value)
    },
    // `config` is a call-site literal; its fields never change within a step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [touched, submitted],
  )

  /** Call from `onBlur`. Marks the field touched only if something was entered: tabbing through is not a mistake. */
  const blur = React.useCallback((name: K, value: string) => {
    if (value.trim().length === 0) return
    setTouched((t) => (t[name] ? t : { ...t, [name]: true }))
  }, [])

  /**
   * Validates the given fields, returning `true` to proceed. The caller lists the fields its step asks
   * for (validating hidden ones would block a step). The list is the focus order: on failure every listed
   * field shows its message and focus moves to the first problem.
   */
  const check = React.useCallback(
    (entries: Array<[K, string]>): boolean => {
      setSubmitted(true)
      for (const [name, value] of entries) {
        if (messageFor(config[name], value) === null) continue
        const id = config[name].id ?? name
        // The field may not be mounted (a hidden step); the refusal still stands.
        document.getElementById(id)?.focus()
        return false
      }
      return true
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  /** Forget everything when a step changes. */
  const reset = React.useCallback(() => {
    setTouched({})
    setSubmitted(false)
  }, [])

  return { show, blur, check, reset }
}
