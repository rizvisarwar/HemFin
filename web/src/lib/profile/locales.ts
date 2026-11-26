/** Locales offered in the profile. The locale drives number and date formats (see lib/format.ts). */
export const LOCALE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "en", label: "English" },
  { value: "en-GB", label: "English (United Kingdom)" },
  { value: "en-US", label: "English (United States)" },
  { value: "nl", label: "Nederlands" },
  { value: "nl-NL", label: "Nederlands (Nederland)" },
  { value: "nl-BE", label: "Nederlands (Belgie)" },
  { value: "de", label: "Deutsch" },
  { value: "de-DE", label: "Deutsch (Deutschland)" },
  { value: "fr", label: "Francais" },
  { value: "fr-FR", label: "Francais (France)" },
  { value: "es", label: "Espanol" },
  { value: "it", label: "Italiano" },
  { value: "pt", label: "Portugues" },
  { value: "sv", label: "Svenska" },
  { value: "da", label: "Dansk" },
  { value: "nb", label: "Norsk bokmal" },
  { value: "fi", label: "Suomi" },
  { value: "pl", label: "Polski" },
];

/** The options plus the current value when it is not in the list, so a saved locale is never lost. */
export function localeOptionsWith(current: string): readonly { value: string; label: string }[] {
  return LOCALE_OPTIONS.some((o) => o.value === current)
    ? LOCALE_OPTIONS
    : [...LOCALE_OPTIONS, { value: current, label: current }];
}

/** True when Intl accepts the tag, so a bad saved locale can never crash number formatting. */
export function isUsableLocale(tag: string): boolean {
  try {
    return Intl.NumberFormat.supportedLocalesOf([tag]).length > 0;
  } catch {
    return false;
  }
}
