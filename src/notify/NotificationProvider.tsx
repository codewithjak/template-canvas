/**
 * NotificationProvider.tsx
 *
 * Mounts the visual layer for the notification module: the toast stack
 * (bottom-right) and the confirm dialog (centered modal). Mount it once near
 * the app root — it reads everything from the singleton store, so there are no
 * props and no context to thread:
 *
 *   <NotificationProvider />
 *
 * All text is resolved through resolveMessage() at render time, so toasts and
 * dialogs already on screen re-localize when setLocale() is called.
 */

import { useSyncExternalStore, useEffect } from 'react';
import { store, type Toast, type ConfirmRequest } from './store';
import { resolveMessage, t } from './i18n';
import './notify.css';

const ICON: Record<Toast['kind'], string> = {
  success: '✓',
  error: '✕',
  info: 'i',
  warning: '!',
};

function ToastCard({ toast }: { toast: Toast }) {
  // Auto-dismiss after the toast's duration (0 / Infinity = sticky).
  useEffect(() => {
    if (!toast.duration || !Number.isFinite(toast.duration)) return;
    const id = window.setTimeout(() => store.dismissToast(toast.id), toast.duration);
    return () => window.clearTimeout(id);
  }, [toast.id, toast.duration]);

  return (
    <div className={`ntf-toast ntf-toast--${toast.kind}`} role="status" aria-live="polite">
      <span className="ntf-toast__icon" aria-hidden="true">{ICON[toast.kind]}</span>
      <div className="ntf-toast__body">
        {toast.title && <div className="ntf-toast__title">{resolveMessage(toast.title)}</div>}
        <div className="ntf-toast__msg">{resolveMessage(toast.message)}</div>
      </div>
      <button
        type="button"
        className="ntf-toast__close"
        aria-label={t('common.ok')}
        onClick={() => store.dismissToast(toast.id)}
      >
        ✕
      </button>
    </div>
  );
}

function ConfirmDialog({ request }: { request: ConfirmRequest }) {
  // Esc cancels, Enter confirms — standard dialog affordances.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') store.resolveConfirm(false);
      else if (e.key === 'Enter') store.resolveConfirm(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [request.id]);

  return (
    <div className="ntf-backdrop" onClick={() => store.resolveConfirm(false)}>
      <div
        className="ntf-dialog"
        role="alertdialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="ntf-dialog__title">
          {resolveMessage(request.title ?? 'common.warning')}
        </h2>
        <p className="ntf-dialog__msg">{resolveMessage(request.message)}</p>
        <div className="ntf-dialog__actions">
          <button
            type="button"
            className="ntf-btn ntf-btn--cancel"
            onClick={() => store.resolveConfirm(false)}
            autoFocus
          >
            {resolveMessage(request.cancelLabel ?? 'common.cancel')}
          </button>
          <button
            type="button"
            className={`ntf-btn ${request.danger ? 'ntf-btn--danger' : 'ntf-btn--confirm'}`}
            onClick={() => store.resolveConfirm(true)}
          >
            {resolveMessage(request.confirmLabel ?? 'common.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

function NotificationProvider() {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  return (
    <>
      <div className="ntf-toaster" aria-live="polite">
        {state.toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} />
        ))}
      </div>
      {state.confirm && <ConfirmDialog request={state.confirm} />}
    </>
  );
}

export default NotificationProvider;
