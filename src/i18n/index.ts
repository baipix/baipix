import { useSyncExternalStore } from 'react';

import { en, type MessageKey } from './en';
import { fr } from './fr';
import { uk } from './uk';

export type Locale = 'en' | 'fr' | 'uk';
export type { MessageKey };

const dictionaries: Record<Locale, Record<MessageKey, string>> = {
  en,
  fr,
  uk,
};

export const LOCALES: { id: Locale; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'fr', label: 'Français' },
  { id: 'uk', label: 'Українська' },
];

// English by default, whatever the browser's language; the choice in View › Language is saved.
let locale: Locale = 'en';
let localePreference: LocalePreference = 'auto';

const listeners = new Set<() => void>();

export const getLocale = (): Locale => locale;

export const getLocalePreference = (): LocalePreference => localePreference;

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export type LocalePreference = 'auto' | 'manual';

export interface LocaleSelection {
  locale: Locale;
  preference: LocalePreference;
  notify: boolean;
}

const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(dictionaries, value);

/** Returns the first supported language from the browser's ordered preferences. */
export function matchBrowserLocale(languages: readonly string[]): Locale | null {
  for (const language of languages) {
    const candidate = language.trim().toLowerCase().replace('_', '-').split('-')[0];

    if (candidate && isLocale(candidate)) return candidate;
  }

  return null;
}

/** Restores a saved choice or resolves the browser's language on first use. */
export function resolveLocaleSelection(
  savedLocale: unknown,
  savedPreference: unknown,
  languages: readonly string[],
): LocaleSelection {
  if (isLocale(savedLocale) && (savedPreference === 'manual' || savedPreference === 'auto')) {
    return {
      locale: savedLocale,
      preference: savedPreference,
      notify: false,
    };
  }

  // Older versions saved the locale but did not record how it was chosen.
  // A non-English locale therefore represents an existing user choice.
  if (isLocale(savedLocale) && savedLocale !== 'en') {
    return {
      locale: savedLocale,
      preference: 'manual',
      notify: false,
    };
  }

  const detected = matchBrowserLocale(languages);

  return {
    locale: detected ?? 'en',
    preference: 'auto',
    notify: detected !== null && detected !== 'en',
  };
}

export function setLocale(next: Locale, preference: LocalePreference = 'auto'): void {
  if (!isLocale(next)) return;
  if (next === locale && preference === localePreference) return;

  locale = next;
  localePreference = preference;

  if (typeof document !== 'undefined') {
    document.documentElement.lang = next;
  }

  listeners.forEach((listener) => listener());
}

export type Vars = Record<string, string | number>;

/** Translates a key, replacing `{name}` placeholders. Falls back to English, then to the key. */
export function t(key: MessageKey, vars?: Vars): string {
  const template = dictionaries[locale][key] ?? en[key] ?? key;
  return vars
    ? template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`))
    : template;
}

/** Re-renders the component when the language changes. */
export function useT(): typeof t {
  useSyncExternalStore(subscribeLocale, () => locale);
  return t;
}
