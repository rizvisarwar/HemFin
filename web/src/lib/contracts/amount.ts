/**
 * Amount text from a form, checked and turned into the decimal string the API takes
 * (docs/design/finance.md 3.1). Pure string work: the text never goes through Number() or
 * parseFloat(), so no digit can be lost or rounded.
 */

export type DecimalMark = "." | ",";

/** The locale's decimal mark ("." for en, "," for de or sv). Falls back to "." for a locale the runtime rejects. */
export function decimalMark(locale: string): DecimalMark {
  try {
    const part = new Intl.NumberFormat(locale).formatToParts(1.1).find((p) => p.type === "decimal");
    return part?.value === "," ? "," : ".";
  } catch {
    return ".";
  }
}

/** Minor units of a currency (EUR 2, JPY 0). Falls back to 2 for a code the runtime rejects. */
export function fractionDigits(currency: string, locale = "en"): number {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

export type AmountResult = { ok: true; value: string } | { ok: false; message: string };

/**
 * Accepts digits with at most one decimal mark, the locale's own (3.1). A thousands separator, the other
 * decimal mark, letters and signs are rejected, never reinterpreted. On success `value` has a dot
 * ("12.50") and no leading zeros.
 */
export function parseAmount(raw: string, opts: { mark: DecimalMark; digits: number; currency: string }): AmountResult {
  const text = raw.trim();
  if (text === "") return { ok: false, message: "Enter the amount." };
  const mark = opts.mark;
  const pattern = new RegExp(`^\\d+(?:${mark === "." ? "\\." : ","}\\d+)?$`);
  if (!pattern.test(text)) return { ok: false, message: `Enter an amount like 12${mark}50.` };
  const [whole, fraction = ""] = text.split(mark);
  if (fraction.length > opts.digits) {
    return {
      ok: false,
      message:
        opts.digits === 0
          ? `${opts.currency} amounts are whole numbers.`
          : `${opts.currency} amounts can have up to ${opts.digits} decimal places.`,
    };
  }
  if (/^0*$/.test(whole + fraction)) return { ok: false, message: "Enter an amount greater than 0." };
  const wholeClean = whole.replace(/^0+(?=\d)/, "");
  return { ok: true, value: fraction ? `${wholeClean}.${fraction}` : wholeClean };
}

/** An API amount ("4350.00") as editable text with the locale's mark. Extra zero decimals are dropped. */
export function amountToInput(value: string, opts: { mark: DecimalMark; digits: number }): string {
  const [whole, fraction = ""] = value.split(".");
  let f = fraction;
  while (f.length > opts.digits && f.endsWith("0")) f = f.slice(0, -1);
  return f ? `${whole}${opts.mark}${f}` : whole;
}
