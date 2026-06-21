'use strict';

/**
 * lib/email.js
 *
 * Shared email primitives. There is ONE SendGrid call site (`sendMail`) and one
 * copy of the small helpers every email path needs — validation, HTML escaping,
 * a per-key rate limiter, and client-IP extraction. Both the public contact
 * form (routes/contact.js) and export delivery (delivery/*) build on these so
 * the email behavior stays consistent and is configured in a single place.
 *
 * All helpers are small and single-purpose: give them values, get a value back.
 * Only `sendMail` performs I/O.
 */

const sgMail = require('@sendgrid/mail');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True when `value` looks like a deliverable address (shape + length only). */
function isValidEmail(value) {
  const email = String(value || '').trim();
  return email.length > 0 && email.length <= 254 && EMAIL_RE.test(email);
}

/** Escape the characters that would break out of HTML text content. */
function escapeHtml(value) {
  return String(value).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
}

/** First client IP from the proxy chain, falling back to the socket address. */
function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
    .split(',')[0]
    .trim();
}

/**
 * Build an in-memory per-key throttle. Returns a function that records a hit for
 * `key` and reports whether it is now OVER `max` within the rolling `windowMs`.
 * State resets on restart — enough to blunt casual abuse without a datastore.
 */
function makeRateLimiter(max, windowMs) {
  const hits = new Map();
  return function isRateLimited(key) {
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    recent.push(now);
    hits.set(key, recent);
    return recent.length > max;
  };
}

/** True when SendGrid is configured. Callers can return 503 when it is not. */
function isEmailConfigured() {
  return Boolean(process.env.SENDGRID_API_KEY);
}

/**
 * Send one message via SendGrid. The single SendGrid call site: sets the API
 * key from the environment, then sends. Throws when not configured (caller maps
 * that to a 503) and propagates SendGrid errors unchanged.
 */
async function sendMail(message) {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) throw new Error('SENDGRID_API_KEY not set');
  sgMail.setApiKey(apiKey);
  return sgMail.send(message);
}

const INVITE_FROM = process.env.CONTACT_FROM || 'noreply@map-doc.com';

/**
 * Email a team invitation: a branded "you've been invited" message carrying the
 * accept link. Built on the same `sendMail` path as the contact form and export
 * delivery. `invitedBy` (the inviter's address) becomes Reply-To so the invitee
 * can reply to a real person. Throws on send failure (caller decides whether to
 * surface it — the invite row already exists, so the link is the fallback).
 */
async function sendInviteEmail({ to, teamName, role, acceptUrl, invitedBy }) {
  const team = teamName || 'a team';
  const msg = {
    to,
    from:    INVITE_FROM, // must be a SendGrid-authenticated sender/domain
    subject: `You've been invited to join ${team} on Mapdoc`,
    text:
      `You've been invited to join "${team}" on Mapdoc as a ${role || 'member'}.\n\n` +
      `Accept your invite:\n${acceptUrl}\n\n` +
      `This link expires in 7 days. If you weren't expecting this, you can ignore this email.`,
    html:
      `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;color:#0f172a;line-height:1.5">` +
      `<p>You've been invited to join <strong>${escapeHtml(team)}</strong> on Mapdoc as a <strong>${escapeHtml(role || 'member')}</strong>.</p>` +
      `<p><a href="${encodeURI(acceptUrl)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;padding:10px 20px;font-weight:600">Accept invitation</a></p>` +
      `<p style="color:#64748b;font-size:13px">Or paste this link into your browser:<br>${escapeHtml(acceptUrl)}</p>` +
      `<p style="color:#64748b;font-size:13px">This link expires in 7 days. If you weren't expecting this, you can ignore this email.</p>` +
      `</div>`,
  };
  if (invitedBy && isValidEmail(invitedBy)) msg.replyTo = { email: invitedBy };
  return sendMail(msg);
}

module.exports = {
  isValidEmail,
  escapeHtml,
  clientIp,
  makeRateLimiter,
  isEmailConfigured,
  sendMail,
  sendInviteEmail,
};
