/**
 * Amount text from a form (SEK), checked and turned into the decimal string the API takes
 * (docs/design/finance.md 3.1). Pure string work: the text never goes through Number() or
 * parseFloat(), so no digit can be lost or rounded.
 */

export type AmountResult = { ok: true; value: string } | { ok: false; message: string };

/** SEK has 2 decimals (öre). */
const DIGITS = 2;

export const AMOUNT_HINT = "Use a comma before the öre, like 12,50.";

// Digit groups of three separated by spaces: "1 234" or "12 345,50" (regular, no-break or narrow no-break space).
const GROUPED = /^\d{1,3}(?:[   ]\d{3})+(?:[.,]\d+)?$/;
const PLAIN = /^\d+(?:[.,]\d+)?$/;

/**
 * Accepts "12,50", "12.50", "12" and "1 234,50". Rejects a second decimal mark, more than 2 decimals,
 * letters, signs and any other separator (never reinterpreted). On success `value` has a dot
 * ("12.50") and no leading zeros.
 */
export function parseAmount(raw: string): AmountResult {
  const text = raw.trim();
  if (text === "") return { ok: false, message: "Enter the amount." };
  if (!GROUPED.test(text) && !PLAIN.test(text)) return { ok: false, message: AMOUNT_HINT };
  const [whole, fraction = ""] = text.replace(/[   ]/g, "").split(/[.,]/);
  if (fraction.length > DIGITS) return { ok: false, message: `Use at most ${DIGITS} decimals (öre). ${AMOUNT_HINT}` };
  if (/^0*$/.test(whole + fraction)) return { ok: false, message: "Enter an amount greater than 0." };
  const wholeClean = whole.replace(/^0+(?=\d)/, "");
  return { ok: true, value: fraction ? `${wholeClean}.${fraction}` : wholeClean };
}

/** An API amount ("4350.00") as editable text with a decimal comma ("4350,00"). */
export function amountToInput(value: string): string {
  return value.replace(".", ",");
}
