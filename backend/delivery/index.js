'use strict';

/**
 * delivery/index.js
 *
 * Orchestrates delivery of a rendered export artifact. P1 supports a single
 * channel — email attachment. It validates the request, resolves who the reply
 * should go to (the signed-in user), and dispatches.
 *
 * The HTTP route stays thin: validate up front, then call deliver().
 */

const { isValidEmail } = require('../lib/email');
const { resolveTeamFromJwt } = require('../apiKeys');
const { resolveDeadline } = require('../lib/deadline');
const { buildDeadlineIcs } = require('../lib/icsBuilder');
const { deliverByEmail } = require('./emailDelivery');

const FROM = process.env.CONTACT_FROM || 'noreply@map-doc.com';

/** Calendar block is optional; when present its deadline must be resolvable. */
function validateCalendar(calendar) {
  if (!calendar) return null;
  if (!resolveDeadline(calendar.deadline)) return 'A valid response deadline is required.';
  return null;
}

/** Returns an error string when the delivery request is unusable, else null. */
function validateDelivery(delivery) {
  if (!delivery || !delivery.email) return 'No delivery target provided.';
  if (!isValidEmail(delivery.email.to)) return 'A valid recipient email is required.';
  return validateCalendar(delivery.calendar);
}

/** Build the .ics reminder for a delivery, or null when no calendar was asked for. */
function buildCalendarIcs(delivery) {
  if (!delivery.calendar) return null;
  const deadline = resolveDeadline(delivery.calendar.deadline);
  if (!deadline) return null; // already validated; defensive
  return buildDeadlineIcs({
    title:     delivery.calendar.title,
    deadline,
    organizer: FROM,
    attendee:  delivery.email.to,
  });
}

/**
 * Reply-To = the signed-in user's address, so replies reach the sender. Degrades
 * to null (no Reply-To) when the JWT can't be resolved (e.g. local dev without
 * Supabase); the message still sends from the verified domain sender.
 */
async function resolveReplyTo(authHeader) {
  try {
    const ctx = await resolveTeamFromJwt(authHeader);
    return ctx && ctx.userEmail ? { email: ctx.userEmail } : null;
  } catch {
    return null;
  }
}

/** Deliver `artifact` per the `delivery` request. Throws on send failure. */
async function deliver({ artifact, delivery, authHeader }) {
  const replyTo     = await resolveReplyTo(authHeader);
  const calendarIcs = buildCalendarIcs(delivery);
  await deliverByEmail({ artifact, email: delivery.email, replyTo, calendarIcs });
  return { ok: true, viaLink: false, withReminder: Boolean(calendarIcs) };
}

module.exports = { deliver, validateDelivery };
