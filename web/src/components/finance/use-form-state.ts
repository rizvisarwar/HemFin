"use client";

import * as React from "react";
import type { ProblemFields } from "@/lib/profile/problem";

/**
 * The state every finance form dialog shares (finance.md 3.10): values, field errors, a form-level
 * message, busy, the "Discard changes?" question and the unsaved-changes check. Mount the dialog
 * under a new `key` each time it opens, so the fields start from `initial`. Field names equal the
 * API's, so a server error lands under its field (F8).
 */
export function useFormState<V extends object>(initial: () => V, fields: readonly (keyof V & string)[], formId: string) {
  type Field = keyof V & string;
  type Errors = Partial<Record<Field, string>>;

  const [start] = React.useState(initial);
  const [values, setValues] = React.useState<V>(start);
  const [errors, setErrors] = React.useState<Errors>({});
  const [formError, setFormError] = React.useState<string>();
  const [busy, setBusy] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  const [discard, setDiscard] = React.useState(false);

  // After a failed submit: focus the first invalid field and bring its message into view in the scrolling body.
  React.useEffect(() => {
    if (attempt === 0) return;
    const el = document.getElementById(formId)?.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (!el) return;
    el.focus();
    const ids = (el.getAttribute("aria-describedby") ?? "").split(" ").filter((id) => id.endsWith("-error"));
    const message = ids.length ? document.getElementById(ids[ids.length - 1]) : null;
    message?.scrollIntoView({ block: "nearest" });
  }, [attempt, formId]);

  const dirty = JSON.stringify(values) !== JSON.stringify(start);

  function set<K extends Field>(field: K, value: V[K]) {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));
  }

  /** Validate on blur: only the field that was left shows its message. */
  function blur(field: Field, all: Errors) {
    setErrors((e) => ({ ...e, [field]: all[field] }));
  }

  /** A failed client validation: show the messages and move focus to the first. */
  function invalid(next: Errors) {
    setErrors(next);
    setFormError(undefined);
    setAttempt((n) => n + 1);
  }

  /** A server refusal: field errors where the API named a field, otherwise a message at the top. Values stay. */
  function refused(problem: ProblemFields) {
    const next: Errors = {};
    for (const [field, message] of Object.entries(problem.fields)) {
      if ((fields as readonly string[]).includes(field)) next[field as Field] = message;
    }
    const known = Object.keys(next).length > 0;
    setErrors(next);
    setFormError(problem.form ?? (known ? undefined : "Something went wrong. Try again in a moment."));
    setAttempt((n) => n + 1);
  }

  /** Close now when nothing changed, otherwise ask first. A busy form never closes. */
  function requestClose(close: () => void) {
    if (busy) return;
    if (dirty) setDiscard(true);
    else close();
  }

  return { values, setValues, set, blur, errors, setErrors, invalid, refused, formError, setFormError, busy, setBusy, discard, setDiscard, dirty, requestClose };
}
