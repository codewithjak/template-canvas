/**
 * notify — customized, i18n-ready notifications for the app.
 *
 * Replaces the browser's default alert()/confirm() with styled toasts and a
 * promise-based confirm dialog, all routed through a translation layer so the
 * UI can be localized later (see i18n.ts + ./locales).
 *
 * Setup — mount the provider once near the app root:
 *   import { NotificationProvider } from './notify';
 *   <NotificationProvider />
 *
 * Usage — anywhere:
 *   import { notify, confirm } from './notify';
 *   notify.success('Saved');
 *   if (await confirm({ key: 'apiKey.revokeConfirm', danger: true })) { ... }
 *
 * Localization:
 *   import { setLocale } from './notify';
 *   setLocale('es');
 */

export { default as NotificationProvider } from './NotificationProvider';
export { notify, confirm } from './api';
export type { ConfirmOptions } from './api';
export { setLocale, getLocale, t } from './i18n';
export type { Message } from './i18n';
