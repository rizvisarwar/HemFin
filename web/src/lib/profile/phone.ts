import { COUNTRIES, countryByCode, countryForDial } from "./countries.ts";

/** Calling codes whose numbers keep a leading 0 as part of the number (not a trunk prefix). */
const KEEPS_LEADING_ZERO = new Set(["39", "378", "379"]);

/**
 * Builds the value sent to the API from the picked country and the typed number. The API parses
 * it and returns E.164, so this only has to produce a "+<code><digits>" string:
 * - an empty number returns null (clears the phone number),
 * - a number typed with its own "+" is taken as already international,
 * - one national trunk "0" is dropped (06 12345678 in the Netherlands becomes +31612345678).
 * It never validates; the API's 422 is shown on the field.
 */
export function buildPhone(countryCode: string, input: string): string | null {
  const raw = input.trim();
  if (raw === "") return null;
  if (raw.startsWith("+")) return `+${raw.replace(/\D/g, "")}`;
  const dial = countryByCode(countryCode)?.dial;
  if (!dial) return raw; // unknown country: let the API reject it
  let digits = raw.replace(/\D/g, "");
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
