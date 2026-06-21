/**
 * api.ts
 *
 * The public, ergonomic API for showing notifications. Import these anywhere —
 * components, event handlers, plain async utilities:
 *
 *   import { notify, confirm } from './notify';
 *
 *   notify.success('Saved');
 *   notify.error({ key: 'template.saveFailed', vars: { error: msg } });
 *
 *   if (await confirm({ key: 'apiKey.revokeConfirm' })) { ... }
 *
 * Everything routes through the i18n layer, so a `Message` can be a translation
 * key, a `{ key, vars }` object, or a raw string (passthrough). See i18n.ts.
 */

import { store, type ToastKind } from './store';
import type { Message } from './i18n';

interface ToastOptions {
  title?: Message;
  /** ms before auto-dismiss. Defaults per kind (errors linger longer). */
  duration?: number;
}

// Errors stay up longer than transient successes; warnings in between.
const DEFAULT_DURATION: Record<ToastKind, number> = {
  success: 3500,
  info: 4000,
  warning: 5000,
  error: 6000,
};

function show(kind: ToastKind, message: Message, opts: ToastOptions = {}): number {
  return store.addToast({
    kind,
    message,
    title: opts.title,
    duration: opts.duration ?? DEFAULT_DURATION[kind],
  });
}

export const notify = {
  success: (message: Message, opts?: ToastOptions) => show('success', message, opts),
  error:   (message: Message, opts?: ToastOptions) => show('error', message, opts),
  info:    (message: Message, opts?: ToastOptions) => show('info', message, opts),
  warning: (message: Message, opts?: ToastOptions) => show('warning', message, opts),
  /** Imperatively dismiss a toast by the id returned from a show call. */
  dismiss: (id: number) => store.dismissToast(id),
};

export interface ConfirmOptions {
  message: Message;
  title?: Message;
  confirmLabel?: Message;
  cancelLabel?: Message;
  /** Style the confirm button as destructive (red). */
  danger?: boolean;
}

/**
 * Promise-based replacement for window.confirm(). Resolves true if the user
 * confirms, false if they cancel / dismiss. Accepts either an options object or
 * a bare message for the common case:
 *
 *   if (!(await confirm('Delete this?'))) return;
 *   if (!(await confirm({ key: 'invite.revokeConfirm' }))) return;
 */
export function confirm(input: Message | ConfirmOptions): Promise<boolean> {
  const opts: ConfirmOptions =
    typeof input === 'string' || (input && 'key' in (input as object) && !('message' in (input as object)))
      ? { message: input as Message }
      : (input as ConfirmOptions);

  return new Promise<boolean>((resolve) => {
    store.openConfirm({
      message: opts.message,
      title: opts.title,
      confirmLabel: opts.confirmLabel,
      cancelLabel: opts.cancelLabel,
      danger: opts.danger,
      resolve,
    });
  });
}
