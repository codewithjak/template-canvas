'use strict';

/**
 * delivery/index.js
 *
 * Orchestrates delivery of a rendered export artifact. It validates the request,
 * then dispatches to a channel: email attachment, or WhatsApp media (P3). Each
 * channel lives in its own module; this file only validates and routes.
 *
 * The HTTP route stays thin: validate up front, then call deliver().
 */

const { isValidEmail } = require('../lib/email');
const { resolveTeamFromJwt } = require('../apiKeys');
const { resolveDeadline } = require('../lib/deadline');
const { buildDeadlineIcs } = require('../lib/icsBuilder');
const { deliverByEmail } = require('./emailDelivery');
const { deliverByWhatsApp } = require('./whatsappDelivery');
const mediaStore = require('./mediaStore');
const whatsappSender = require('./providers/whatsappSender');

const FROM = process.env.CONTACT_FROM || 'noreply@map-doc.com';

/** E.164: a leading '+' then 7–15 digits, first digit non-zero. */
const E164_RE = /^\+[1-9]\d{6,14}$/;
const WHATSAPP_MESSAGE_MAX = 1024;

/** Calendar block is optional; when present its deadline must be resolvable. */
function validateCalendar(calendar) {
  if (!calendar) return null;
  if (!resolveDeadline(calendar.deadline)) return 'A valid response deadline is required.';
  return null;
}

/** WhatsApp block is valid when it carries an E.164 number and a bounded message. */
function validateWhatsApp(whatsapp) {
  if (!whatsapp || !whatsapp.to) return 'A recipient WhatsApp number is required.';
  if (!E164_RE.test(String(whatsapp.to).trim())) {
    return 'A valid WhatsApp number in E.164 format (e.g. +14155550123) is required.';
  }
  if (whatsapp.message && String(whatsapp.message).length > WHATSAPP_MESSAGE_MAX) {
    return 'The WhatsApp message is too long.';
  }
  return null;
}

/** Returns an error string when the delivery request is unusable, else null. */
function validateDelivery(delivery) {
  if (!delivery || (!delivery.email && !delivery.whatsapp)) return 'No delivery target provided.';
  if (delivery.email && !isValidEmail(delivery.email.to)) return 'A valid recipient email is required.';
  if (delivery.whatsapp) {
    const whatsappError = validateWhatsApp(delivery.whatsapp);
    if (whatsappError) return whatsappError;
  }
  return validateCalendar(delivery.calendar);
}

/** True when WhatsApp delivery has both a configured provider and a media store. */
function isWhatsAppConfigured() {
  return whatsappSender.isConfigured() && mediaStore.isConfigured();
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

/** Email channel: attach the artifact, with an optional calendar reminder. */
async function deliverViaEmail(artifact, delivery, authHeader) {
  const replyTo     = await resolveReplyTo(authHeader);
  const calendarIcs = buildCalendarIcs(delivery);
  await deliverByEmail({ artifact, email: delivery.email, replyTo, calendarIcs });
  return { ok: true, viaLink: false, withReminder: Boolean(calendarIcs) };
}

/** WhatsApp channel: store → mint short-lived URL → send via the provider. */
async function deliverViaWhatsApp(artifact, delivery) {
  const { sid } = await deliverByWhatsApp({
    artifact,
    whatsapp:   delivery.whatsapp,
    sender:     whatsappSender.fromEnv(),
    mediaStore: mediaStore.fromEnv(),
  });
  return { ok: true, viaLink: true, sid };
}

/** Deliver `artifact` per the `delivery` request. Throws on send failure. */
async function deliver({ artifact, delivery, authHeader }) {
  if (delivery.whatsapp) return deliverViaWhatsApp(artifact, delivery);
  return deliverViaEmail(artifact, delivery, authHeader);
}

module.exports = { deliver, validateDelivery, validateWhatsApp, isWhatsAppConfigured };
