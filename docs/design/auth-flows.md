# Auth flows: layout, copy and interaction rules

Applies to `/sign-in`, `/sign-up`, `/check-email`, `/forgot-password`, `/reset-password` (HEM-010). Tokens and focus rules come from `design-system.md`.

## Layout

- **Brand panel rule.** The split layout with the brand panel (left half, logo and value points) is shown on **`/sign-in` and `/sign-up` only, and only from 1280 px (`xl`) up**. Below that, and on `/check-email`, `/forgot-password` and `/reset-password` at every width, the page is a single column with the logo above the form. The reason: the three secondary pages are short, reached from an email or a link, and gain nothing from marketing copy.
- Form column: max 440 px on phone and tablet (card from `md`), 400 px with no card on the desktop split layout. No horizontal scroll at 375, 768 and 1280.

## Forms

- Every auth form is `method="post"` and its submit button is **disabled until the component has hydrated** (`useHydrated`). A form submitted before its JavaScript loads must never put values in the URL.
- Password inputs are **uncontrolled** and read from `FormData` on submit, so text typed before hydration is kept.
- Focus moves to the first invalid field after a failed submit. Field errors are inline with `aria-invalid` and a polite live region. A form-level error uses `role="alert"`.
- **Sign-in auth errors** mark **both** fields `aria-invalid` and associate the message with both (`aria-describedby`). The message never says which field was wrong.
- **Password rules** (sign-up, reset): a checklist (icon, text and an sr-only "done / not done yet"), plus a polite summary ("2 of 4 password rules met.") announced one second after typing stops and only when it changes.

## Copy

| Where | Text |
|---|---|
| Check email, with address | "If you can sign up with **{email}**, we've sent a link to confirm it. Open the link on this device to finish creating your account." |
| Check email, no address | "If you can sign up with that address, we've sent a link to confirm it. Open the link on this device to finish creating your account." |
| Resend or sign-up of an existing address | "If this email address can be used, we have sent a message with a link. It can take a few minutes." |
| Forgot password | "If an account exists for that email address, we have sent a link to reset the password." |
| Cooldown sentence | "You can ask for another email in {n} seconds." |
| Cooldown ended (announced only) | "You can send the email again now." |

The check-email wording is true whether or not the address already has an account, so it reveals nothing.

## Send cooldown (check-email resend, forgot password)

- After a send the button gets `aria-disabled` (not `disabled`), so keyboard focus stays on it. The click handler ignores clicks during the cooldown. `aria-disabled` buttons render at 60% opacity.
- The label reads "Send again in {n}s". A **visible sentence in normal text colour** explains it ("You can ask for another email in {n} seconds."), because disabled-looking text is hard to read.
- The countdown is **not** announced every second. When it ends, a polite live region says "You can send the email again now."
- Cooldown is 60 seconds.

## Google button

"Continue with Google". Roboto Medium 500, 14/20, scoped to the button; 10 px between the G and the label (current Google web guidance; an earlier version said 12 px); unmodified four-colour G; pill, 44 px high; light `#FFFFFF`/`#747775`/`#1F1F1F`, dark `#131314`/`#8E918F`/`#E3E3E3`. Google's current table names Google Sans Medium; it is not licensed for general use, so Roboto Medium is the stand-in. Recheck the guideline text before release.

## Focus ring

Follows `design-system.md` section 4.5 everywhere: the global 2 px `--ring` outline with a 2 px offset on `:focus-visible`. Shared Button, Input and Badge no longer draw their own 3 px translucent ring or change the border colour on focus.

## Emails

Light-only on purpose (fixed hex colours, `color-scheme: light`), so contrast is the same in every client. The expiry line is 16 px in normal text colour. The footer reads "You're receiving this because this address was used on HemFin. If that was not you, you can ignore this email." and names the sender with the site URL.
