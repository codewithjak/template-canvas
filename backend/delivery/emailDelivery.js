'use strict';

/**
 * delivery/emailDelivery.js
 *
 * The email channel for export delivery. Sends a rendered artifact as an
 * attachment via the shared lib/email.js sender. Reuses the verified domain
 * sender (CONTACT_FROM) for `From`; the caller supplies `replyTo` so the
 * recipient's reply reaches the person who sent the document.
 *
 * Small functions only: shape the attachment, shape the message, send.
 */

const { sendMail } = require('../lib/email');

const FROM = process.env.CONTACT_FROM || 'noreply@map-doc.com';

/** A SendGrid attachment from a rendered artifact (base64-encoded). */
function toAttachment(artifact) {
  return {
    content:     artifact.buffer.toString('base64'),
    filename:    artifact.fileName,
    type:        artifact.contentType,
    disposition: 'attachment',
  };
}

/** Shape the SendGrid message. `replyTo` is added only when provided. */
function buildMessage({ to, replyTo, subject, message, attachments }) {
  const msg = {
    to,
    from:        FROM,
    subject:     subject || 'Your document',
    text:        message || 'Please find your document attached.',
    attachments,
  };
  if (replyTo) msg.replyTo = replyTo;
  return msg;
}

/** Send `artifact` to `email.to` as an attachment. */
async function deliverByEmail({ artifact, email, replyTo }) {
  return sendMail(buildMessage({
    to:          email.to,
    replyTo,
    subject:     email.subject,
    message:     email.message,
    attachments: [toAttachment(artifact)],
  }));
}

module.exports = { deliverByEmail, toAttachment, buildMessage };
