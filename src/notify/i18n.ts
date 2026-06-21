/**
 * i18n.ts
 *
 * The translation layer for the notification module. Deliberately tiny and
 * dependency-free — it only needs to resolve a key + variables into a string
 * for the current locale, and let the locale be switched at runtime.
 *
 * Built to grow: when the rest of the app needs i18n, this same module (or one
 * modelled on it) can back it — the catalogs in ./locales are the single source
 * of truth. See MULTILINGUAL_EXPORT_ARCHITECTURE.md §5.
 *
 * Messages can be passed two ways throughout the module:
 *   - a translation key:  t('export.failed')  →  "Export failed."
 *   - a raw string:       t('Saved 3 rows')   →  "Saved 3 rows"  (passthrough)
 * The passthrough means call sites can be migrated to keys gradually without
 * breaking anything.
 */

import { DEFAULT_LOCALE, locales, type LocaleCode } from './locales';
import type { MessageKey } from './locales/en';

/** A message is either a known key, or `{ key, vars }` for interpolation. */
export type Message =
  | MessageKey
  | (string & {})                                   // raw passthrough string
  | { key: MessageKey | string; vars?: Vars };

export type Vars = Record<string, string | number>;

let currentLocale: LocaleCode = DEFAULT_LOCALE;
const listeners = new Set<() => void>();

/** The active locale code (e.g. 'en'). */
export function getLocale(): LocaleCode {
  return currentLocale;
}

/**
 * Switch the active locale. Unknown codes are ignored (we keep the current one)
 * so a bad value never blanks the UI. Notifies subscribers so mounted toasts /
 * dialogs re-render in the new language.
 */
export function setLocale(code: LocaleCode): void {
  if (!locales[code]) {
    if (import.meta.env?.DEV) console.warn(`[notify/i18n] unknown locale "${code}", ignoring`);
    return;
  }
  if (code === currentLocale) return;
  currentLocale = code;
  listeners.forEach((l) => l());
}

/** Subscribe to locale changes; returns an unsubscribe function. */
export function onLocaleChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Fill `{name}` placeholders in a template string from `vars`. */
function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

/**
 * Resolve a key (or raw string) to a localized, interpolated string.
 *   - known key in the active locale  → translated
 *   - known key missing in active locale → fall back to English
 *   - unknown key / raw string         → used verbatim (then interpolated)
 */
export function t(key: MessageKey | string, vars?: Vars): string {
  const active = locales[currentLocale] as Record<string, string> | undefined;
  const fallback = locales[DEFAULT_LOCALE] as Record<string, string>;
  const template = active?.[key] ?? fallback?.[key] ?? key;
  return interpolate(template, vars);
}

/** Resolve any `Message` shape to a final string. Used by the toast/dialog UI. */
export function resolveMessage(msg: Message): string {
  if (typeof msg === 'string') return t(msg);
  return t(msg.key, msg.vars);
}
