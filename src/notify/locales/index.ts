/**
 * locales/index.ts
 *
 * Registry of all available locales. English is the source of truth for the
 * key set (see en.ts → MessageKey/Catalog). To add a language, create a sibling
 * file that satisfies `Catalog` and register it here — nothing else changes.
 *
 *   import es from './es';
 *   export const locales = { en, es } satisfies Record<string, Catalog>;
 */

import en, { type Catalog } from './en';

export const DEFAULT_LOCALE = 'en';

export const locales: Record<string, Catalog> = {
  en,
};

export type LocaleCode = keyof typeof locales | string;
