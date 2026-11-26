import { COUNTRIES, countryByCode, countryForDial } from "./countries.ts";

/** Calling codes whose numbers keep a leading 0 as part of the number (not a trunk prefix): Italy, San Marino. */
const KEEPS_LEADING_ZERO = new Set(["39", "378"]);

/**
 * Builds the value sent to the API from the picked country and the typed number. The API parses
 * it and returns E.164, so this only has to produce a "+<code><digits>" string:
 * - an empty number returns null (clears the phone number),
 * - a number typed with its own "+" or "00" prefix is taken as already international,
 * - one national trunk "0" is dropped (06 12345678 in the Netherlands becomes +31612345678).
 * It never validates; the API's 422 is shown on the field.
 */
export function buildPhone(countryCode: string, input: string): string | null {
  const raw = input.trim();
  if (raw === "") return null;
  const digitsOnly = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) return `+${digitsOnly}`;
  if (digitsOnly.startsWith("00")) return `+${digitsOnly.slice(2)}`;
  const dial = countryByCode(countryCode)?.dial;
  if (!dial) return raw; // unknown country: let the API reject it
  let digits = digitsOnly;
  if (digits.startsWith("0") && !KEEPS_LEADING_ZERO.has(dial)) digits = digits.slice(1);
  return `+${dial}${digits}`;
}

const MAX_DIAL_LENGTH = Math.max(...COUNTRIES.map((c) => c.dial.length));

/** Splits a stored E.164 number into a country and the national digits for display. */
export function splitPhone(e164: string | null | undefined): { country: string; national: string } | null {
  if (!e164 || !e164.startsWith("+")) return null;
  const digits = e164.slice(1).replace(/\D/g, "");
  // Calling codes are 1 to 3 digits and no code is the start of another, so the first match wins.
  for (let len = 1; len <= MAX_DIAL_LENGTH; len++) {
    const country = countryForDial(digits.slice(0, len));
    if (country) return { country: country.code, national: digits.slice(len) };
  }
  return null;
}

/** Region of a BCP-47 locale ("nl-NL" gives "NL"), or undefined when it has none ("en"). */
export function regionOfLocale(locale: string): string | undefined {
  try {
    const region = new Intl.Locale(locale).region;
    return region && countryByCode(region) ? region : undefined;
  } catch {
    return undefined;
  }
}

/**
 * What the phone fields show first. Deterministic from the saved profile (so the server HTML and
 * hydration agree): the stored number's country, else the locale's region, else empty.
 * A stored number whose calling code is not in the table is shown whole, with its "+", never
 * dropped: saving sends it back unchanged.
 */
export function phoneDefaults(e164: string | null | undefined, locale: string): { country: string | null; number: string } {
  const split = splitPhone(e164);
  if (split) return { country: split.country, number: split.national };
  if (e164) return { country: null, number: e164 };
  return { country: regionOfLocale(locale) ?? null, number: "" };
}
