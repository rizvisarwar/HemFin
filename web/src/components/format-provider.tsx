"use client";

import * as React from "react";
import { DEFAULT_PREFS, makeFormatter, type FormatPrefs, type Formatter } from "@/lib/format";

const FormatContext = React.createContext<Formatter | null>(null);

/**
 * Makes the signed-in user's base currency and locale (from their profile) available to every
 * client component in the (app) shell. Mounted by the (app) layout, which re-reads the profile
 * after a save (router.refresh()).
 */
export function FormatProvider({ prefs, children }: { prefs: FormatPrefs; children: React.ReactNode }) {
  const value = React.useMemo(() => makeFormatter({ currency: prefs.currency, locale: prefs.locale }), [prefs.currency, prefs.locale]);
  return <FormatContext.Provider value={value}>{children}</FormatContext.Provider>;
}

const FALLBACK = makeFormatter(DEFAULT_PREFS);

/**
 * Money and date formatting in the user's base currency and locale:
 *   const { money, date, prefs } = useFormat();
 *   money("1240.50")                       // base currency
 *   money("5", { currency: "USD" })        // a record held in another currency
 * Outside the provider (tests, public pages) it uses the defaults (EUR, en).
 */
export function useFormat(): Formatter {
  return React.useContext(FormatContext) ?? FALLBACK;
}
