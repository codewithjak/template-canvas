/**
 * store.ts
 *
 * A tiny framework-agnostic store that holds the live toast list and the
 * current confirm dialog (if any). It is a module-level singleton with a
 * publish/subscribe API, so it can be driven imperatively from anywhere — event
 * handlers, plain utility functions, even non-React code — not just hooks. The
 * <NotificationProvider> subscribes via useSyncExternalStore and renders it.
 *
 * The public ergonomic API (notify.success(), confirm(), …) lives in api.ts and
 * is built on top of this.
 */

import { onLocaleChange, type Message } from './i18n';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: Message;
  /** Optional bold title above the message. */
  title?: Message;
  /** ms before auto-dismiss; 0 / Infinity means it stays until dismissed. */
  duration: number;
}

export interface ConfirmRequest {
  id: number;
  message: Message;
  title?: Message;
  confirmLabel?: Message;
  cancelLabel?: Message;
  /** Style the confirm button as a destructive action (red). */
  danger?: boolean;
  /** Resolved by the dialog when the user chooses. */
  resolve: (ok: boolean) => void;
}

interface State {
  toasts: Toast[];
  confirm: ConfirmRequest | null;
}

let state: State = { toasts: [], confirm: null };
const listeners = new Set<() => void>();
let nextId = 1;

function emit() {
  // New object identity each change so useSyncExternalStore detects it.
  listeners.forEach((l) => l());
}

function setState(patch: Partial<State>) {
  state = { ...state, ...patch };
  emit();
}

// Re-render mounted toasts/dialogs when the locale changes so their text
// (resolved lazily from Message keys) updates in place.
onLocaleChange(emit);

export const store = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot(): State {
    return state;
  },

  addToast(input: Omit<Toast, 'id'>): number {
    const id = nextId++;
    setState({ toasts: [...state.toasts, { ...input, id }] });
    return id;
  },

  dismissToast(id: number) {
    setState({ toasts: state.toasts.filter((t) => t.id !== id) });
  },

  /** Open a confirm dialog. Only one is shown at a time (last wins). */
  openConfirm(input: Omit<ConfirmRequest, 'id'>): number {
    const id = nextId++;
    setState({ confirm: { ...input, id } });
    return id;
  },

  /** Resolve and close the current confirm dialog. */
  resolveConfirm(ok: boolean) {
    const current = state.confirm;
    if (!current) return;
    setState({ confirm: null });
    current.resolve(ok);
  },
};

export type { State as NotifyState };
