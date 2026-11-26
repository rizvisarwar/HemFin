import type { ComboOption } from "./countries.ts";

/** Active ISO 4217 currency codes. The API validates against the full ISO list. */
export const CURRENCY_CODES: readonly string[] = (
  "AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD " +
  "CAD CDF CHF CLP CNY COP CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF " +
  "GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP " +
  "LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB " +
  "PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SYP SZL THB " +
  "TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VES VND VUV WST XAF XCD XOF XPF YER ZAR ZMW ZWG"
).split(" ");

/** Name of a currency in the given locale ("Euro"); the code when unknown. */
export function currencyName(code: string, locale = "en"): string {
  try {
    return new Intl.DisplayNames([locale], { type: "currency" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function currencyOptions(locale = "en"): ComboOption[] {
  return CURRENCY_CODES.map((code) => {
    const name = currencyName(code, locale);
    return { value: code, label: name, hint: code, search: `${code} ${name}`.toLowerCase() };
  }).sort((a, b) => a.label.localeCompare(b.label, locale));
}

/** True for a code in the list (case-insensitive, trimmed). */
export function isKnownCurrency(code: string): boolean {
  return CURRENCY_CODES.includes(code.trim().toUpperCase());
}
