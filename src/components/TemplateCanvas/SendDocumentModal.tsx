/**
 * SendDocumentModal.tsx
 *
 * Collects a recipient (plus optional subject/message) and an optional
 * "respond by" deadline, then asks the parent to render + email the current
 * export. The deadline can be relative ("respond within N days/hours") or an
 * absolute date/time; either way it is sent to the server as a delivery spec.
 *
 * It only gathers input and reports status — the actual render/send happens in
 * the parent via the `onSend` callback.
 */

import React, { useState } from 'react';
import type { DeliverySpec, DeadlineSpec, SendDocumentResult } from '../../services/dataSourceService';
import './SendDocumentModal.css';

interface Props {
  onClose: () => void;
  onSend:  (delivery: DeliverySpec) => Promise<SendDocumentResult>;
}

type DeadlineMode = 'relative' | 'absolute';

/** Build the deadline spec from the form, or null when no deadline was added. */
function buildDeadline(
  enabled: boolean,
  mode:    DeadlineMode,
  days:    number,
  hours:   number,
  absolute: string,
): DeadlineSpec | null {
  if (!enabled) return null;
  if (mode === 'absolute') {
    return absolute ? { mode: 'absolute', value: new Date(absolute).toISOString() } : null;
  }
  return { mode: 'relative', value: { days, hours } };
}

const SendDocumentModal: React.FC<Props> = ({ onClose, onSend }) => {
  const [to, setTo]           = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const [addDeadline, setAddDeadline] = useState(false);
  const [mode, setMode]               = useState<DeadlineMode>('relative');
  const [days, setDays]               = useState(3);
  const [hours, setHours]             = useState(0);
  const [absolute, setAbsolute]       = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [done, setDone]             = useState<SendDocumentResult | null>(null);

  const canSubmit = to.trim().length > 0 && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    const deadline = buildDeadline(addDeadline, mode, days, hours, absolute);
    const delivery: DeliverySpec = {
      email: { to: to.trim(), subject: subject.trim() || undefined, message: message.trim() || undefined },
      ...(deadline ? { calendar: { title: subject.trim() || 'Respond to document', deadline } } : {}),
    };

    try {
      setSubmitting(true);
      setError(null);
      setDone(await onSend(delivery));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the document.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="sdm-backdrop" onClick={onClose}>
      <div className="sdm-card" onClick={e => e.stopPropagation()}>
        <h2 className="sdm-title">Send via email</h2>
        <p className="sdm-subtitle">Email this export, optionally with a response deadline.</p>

        {done ? (
          <div className="sdm-success">
            <p>✓ Sent to <strong>{to.trim()}</strong>{done.withReminder ? ' with a reminder' : ''}.</p>
            <div className="sdm-actions">
              <button type="button" className="sdm-btn sdm-btn--primary" onClick={onClose}>Done</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <label className="sdm-label">Recipient email</label>
            <input
              className="sdm-input" type="email" value={to} autoFocus
              onChange={e => setTo(e.target.value)}
              placeholder="name@example.com" maxLength={254}
            />

            <label className="sdm-label">Subject</label>
            <input
              className="sdm-input" type="text" value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Your document" maxLength={150}
            />

            <label className="sdm-label">Message</label>
            <textarea
              className="sdm-input sdm-textarea" value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Optional note to the recipient…" maxLength={2000} rows={3}
            />

            <label className="sdm-check">
              <input
                type="checkbox" checked={addDeadline}
                onChange={e => setAddDeadline(e.target.checked)}
              />
              Add a response deadline (calendar reminder)
            </label>

            {addDeadline && (
              <div className="sdm-deadline">
                <div className="sdm-mode">
                  <label className="sdm-radio">
                    <input type="radio" checked={mode === 'relative'} onChange={() => setMode('relative')} />
                    Within
                  </label>
                  <label className="sdm-radio">
                    <input type="radio" checked={mode === 'absolute'} onChange={() => setMode('absolute')} />
                    By date
                  </label>
                </div>

                {mode === 'relative' ? (
                  <div className="sdm-relative">
                    <input
                      className="sdm-input sdm-num" type="number" min={0} value={days}
                      onChange={e => setDays(Math.max(0, Number(e.target.value)))}
                    />
                    <span>days</span>
                    <input
                      className="sdm-input sdm-num" type="number" min={0} max={23} value={hours}
                      onChange={e => setHours(Math.max(0, Number(e.target.value)))}
                    />
                    <span>hours</span>
                  </div>
                ) : (
                  <input
                    className="sdm-input" type="datetime-local" value={absolute}
                    onChange={e => setAbsolute(e.target.value)}
                  />
                )}
              </div>
            )}

            {error && <p className="sdm-error">{error}</p>}

            <div className="sdm-actions">
              <button type="button" className="sdm-btn sdm-btn--cancel" onClick={onClose} disabled={submitting}>
                Cancel
              </button>
              <button type="submit" className="sdm-btn sdm-btn--primary" disabled={!canSubmit}>
                {submitting ? 'Sending…' : '✉ Send'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default SendDocumentModal;
