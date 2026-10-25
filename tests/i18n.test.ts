import { describe, expect, it } from 'vitest';

import type { Locale } from '../src/i18n';
import { en, type MessageKey } from '../src/i18n/en';
import { fr } from '../src/i18n/fr';

const translations: Record<Exclude<Locale, 'en'>, Record<MessageKey, string>> = { fr };

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
