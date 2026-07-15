/**
 * SendDocumentModal.tsx
 *
 * Collects a delivery channel and its target, then asks the parent to render +
 * send the current export. Two channels:
 *   - Email: recipient + optional subject/message + an optional "respond by"
 *     deadline (relative or absolute), sent as a calendar reminder.
 *   - WhatsApp: an E.164 number + optional caption. Media is delivered inside the
 *     recipient's 24-hour session window (see the note in the form).
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

type Channel = 'email' | 'whatsapp';
type DeadlineMode = 'relative' | 'absolute';

/** E.164: a leading '+' then 7–15 digits, first digit non-zero. */
const E164_RE = /^\+[1-9]\d{6,14}$/;

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
  const [channel, setChannel] = useState<Channel>('email');

  const [to, setTo]           = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [phone, setPhone]     = useState('');

  const [addDeadline, setAddDeadline] = useState(false);
  const [mode, setMode]               = useState<DeadlineMode>('relative');
  const [days, setDays]               = useState(3);
  const [hours, setHours]             = useState(0);
  const [absolute, setAbsolute]       = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [done, setDone]             = useState<SendDocumentResult | null>(null);

  const targetLabel = channel === 'email' ? to.trim() : phone.trim();
  const canSubmit =
    !submitting &&
    (channel === 'email' ? to.trim().length > 0 : E164_RE.test(phone.trim()));

  /** Assemble the DeliverySpec for the selected channel. */
  const buildDelivery = (): DeliverySpec => {
    if (channel === 'whatsapp') {
      return { whatsapp: { to: phone.trim(), message: message.trim() || undefined } };
    }
    const deadline = buildDeadline(addDeadline, mode, days, hours, absolute);
    return {
      email: { to: to.trim(), subject: subject.trim() || undefined, message: message.trim() || undefined },
      ...(deadline ? { calendar: { title: subject.trim() || 'Respond to document', deadline } } : {}),
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    try {
      setSubmitting(true);
      setError(null);
      setDone(await onSend(buildDelivery()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the document.');
    } finally {
      setSubmitting(false);
    }
  };

  const successNote =
    channel === 'whatsapp'
      ? ' on WhatsApp'
      : done?.withReminder ? ' with a reminder' : '';

  return (
    <div className="sdm-backdrop" onClick={onClose}>
      <div className="sdm-card" onClick={e => e.stopPropagation()}>
        <h2 className="sdm-title">Send document</h2>
        <p className="sdm-subtitle">Deliver this export by email or WhatsApp.</p>

        {done ? (
          <div className="sdm-success">
            <p>✓ Sent to <strong>{targetLabel}</strong>{successNote}.</p>
            <div className="sdm-actions">
              <button type="button" className="sdm-btn sdm-btn--primary" onClick={onClose}>Done</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="sdm-mode" role="tablist">
              <label className="sdm-radio">
                <input type="radio" checked={channel === 'email'} onChange={() => setChannel('email')} />
                Email
              </label>
              <label className="sdm-radio">
                <input type="radio" checked={channel === 'whatsapp'} onChange={() => setChannel('whatsapp')} />
                WhatsApp
              </label>
            </div>

            {channel === 'email' ? (
              <>
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
              </>
            ) : (
              <>
                <label className="sdm-label">WhatsApp number</label>
                <input
                  className="sdm-input" type="tel" value={phone} autoFocus
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+14155550123" maxLength={16}
                />

                <label className="sdm-label">Caption</label>
                <textarea
                  className="sdm-input sdm-textarea" value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Optional message sent with the document…" maxLength={1024} rows={3}
                />

                <p className="sdm-hint">
                  WhatsApp only delivers to a recipient who has messaged your business number in
                  the last 24 hours. Use the full international format, e.g. +14155550123.
                </p>
              </>
            )}

            {error && <p className="sdm-error">{error}</p>}

            <div className="sdm-actions">
              <button type="button" className="sdm-btn sdm-btn--cancel" onClick={onClose} disabled={submitting}>
                Cancel
              </button>
              <button type="submit" className="sdm-btn sdm-btn--primary" disabled={!canSubmit}>
                {submitting ? 'Sending…' : channel === 'whatsapp' ? 'Send on WhatsApp' : '✉ Send'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default SendDocumentModal;
