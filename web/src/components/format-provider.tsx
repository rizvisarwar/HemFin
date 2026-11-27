"use client";

import * as React from "react";
import { makeFormatter, type Formatter } from "@/lib/format";

const formatter = makeFormatter();
const FormatContext = React.createContext<Formatter>(formatter);

/**
 * Makes the money and date formatters (sv-SE, SEK; HEM-024) available to every client component in
 * the (app) shell. Mounted by the (app) layout.
 */
export function FormatProvider({ children }: { children: React.ReactNode }) {
  return <FormatContext.Provider value={formatter}>{children}</FormatContext.Provider>;
}

/**
 * Money and date formatting:
 *   const { money, date, calendarDate } = useFormat();
 *   money("1240.50")                       // "1 240,50 kr"
 *   money("5", { currency: "USD" })        // a record stored in another currency: "5,00 USD"
 */
export function useFormat(): Formatter {
  return React.useContext(FormatContext);
}
