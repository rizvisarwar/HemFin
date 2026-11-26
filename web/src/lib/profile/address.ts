import { countryName } from "./countries.ts";

export const MAX_ADDRESSES = 20;

/** Field length limits, the same as the API (api/src/hemfin/modules/profile/schemas.py). */
export const ADDRESS_LIMITS = { label: 50, line1: 200, line2: 200, city: 100, region: 100, postcode: 20 } as const;

export interface AddressValues {
  label: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postcode: string;
  country: string; // alpha-2
}

export type AddressErrors = Partial<Record<keyof AddressValues, string>>;

const REQUIRED: { key: keyof AddressValues; message: string }[] = [
  { key: "label", message: "Give the address a name, for example Home." },
  { key: "line1", message: "Enter the street and number." },
  { key: "city", message: "Enter the city or town." },
  { key: "country", message: "Choose a country." },
];

/** Client-side checks that only save a round trip; the API stays the authority. */
export function validateAddress(v: AddressValues, knownCountry: (code: string) => boolean): AddressErrors {
  const errors: AddressErrors = {};
  for (const { key, message } of REQUIRED) {
    if (v[key].trim() === "") errors[key] = message;
  }
  if (!errors.country && !knownCountry(v.country.trim())) errors.country = "Choose a country from the list.";
  for (const [key, max] of Object.entries(ADDRESS_LIMITS) as [keyof typeof ADDRESS_LIMITS, number][]) {
    if (!errors[key] && v[key].trim().length > max) errors[key] = `Use at most ${max} characters.`;
  }
  return errors;
}

/** Body for POST/PATCH: trimmed, with empty optional fields sent as null (which clears them on PATCH). */
export function addressPayload(v: AddressValues) {
  const opt = (s: string) => (s.trim() === "" ? null : s.trim());
  return {
    label: v.label.trim(),
    line1: v.line1.trim(),
    line2: opt(v.line2),
    city: v.city.trim(),
    region: opt(v.region),
    postcode: opt(v.postcode),
    country: v.country.trim().toUpperCase(),
  };
}

/** Display lines of an address, skipping empty parts: street, "postcode city", region, country. */
export function addressLines(
  a: { line1: string; line2?: string | null; city: string; region?: string | null; postcode?: string | null; country: string },
  locale = "en",
): string[] {
  const cityLine = [a.postcode, a.city].filter(Boolean).join(" ");
  return [a.line1, a.line2, cityLine, a.region, countryName(a.country, locale)].filter((l): l is string => !!l);
}
