import { describe, expect, it } from 'vitest';

import { matchBrowserLocale, resolveLocaleSelection, type Locale } from '../src/i18n';
import { en, type MessageKey } from '../src/i18n/en';
import { fr } from '../src/i18n/fr';
import { uk } from '../src/i18n/uk';
import { es } from '../src/i18n/es';
import { ja } from '../src/i18n/ja';

const translations: Record<Exclude<Locale, 'en'>, Record<MessageKey, string>> = {
  fr,
  uk,
  es,
  ja,
};

const getPlaceholders = (text: string): string[] =>
  [...text.matchAll(/\{(\w+)\}/g)].map(([, name]) => name).sort();

describe('translation (i18n) placeholders', () => {
  it('keeps placeholders consistent across all translations', () => {
    for (const [locale, dictionary] of Object.entries(translations)) {
      for (const key of Object.keys(en) as MessageKey[]) {
        expect(getPlaceholders(dictionary[key]), `${locale}.${key}`).toEqual(getPlaceholders(en[key]));
      }
    }
  });
});

describe('browser language selection', () => {
  it('uses the first supported language and matches regional tags', () => {
    expect(matchBrowserLocale(['de-DE', 'fr-CA', 'en-US'])).toBe('fr');
  });

  it('falls back to English without a notice when no language is supported', () => {
    expect(resolveLocaleSelection(undefined, undefined, ['de-DE', 'it-IT'])).toEqual({
      locale: 'en',
      preference: 'auto',
      notify: false,
    });
  });

  it('announces an automatically selected non-English language', () => {
    expect(resolveLocaleSelection(undefined, undefined, ['fr-FR'])).toEqual({
      locale: 'fr',
      preference: 'auto',
      notify: true,
    });
  });

  it('preserves a manually selected language', () => {
    expect(resolveLocaleSelection('en', 'manual', ['fr-FR'])).toEqual({
      locale: 'en',
      preference: 'manual',
      notify: false,
    });
  });

  it('does not repeat the notice for a saved automatic choice', () => {
    expect(resolveLocaleSelection('fr', 'auto', ['en-US'])).toEqual({
      locale: 'fr',
      preference: 'auto',
      notify: false,
    });
  });

  it('preserves a non-English choice saved by an older version', () => {
    expect(resolveLocaleSelection('fr', undefined, ['en-US'])).toEqual({
      locale: 'fr',
      preference: 'manual',
      notify: false,
    });
  });

  it('selects Ukrainian when it is the first supported browser language', () => {
    expect(resolveLocaleSelection(undefined, undefined, ['uk-UA', 'fr-FR'])).toEqual({
      locale: 'uk',
      preference: 'auto',
      notify: true,
    });
  });
});
