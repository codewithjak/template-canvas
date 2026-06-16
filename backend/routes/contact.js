'use strict';

/**
 * routes/contact.js
 *
 * The public "Contact us" form from the marketing site. It emails the message
 * to CONTACT_TO via SendGrid, with the visitor's address as Reply-To. Because
 * it's unauthenticated, it is validated, honeypot-guarded, and lightly
 * rate-limited per IP.
 *
 * Exports an Express router mounted by index.js.
 */

const express = require('express');
const sgMail = require('@sendgrid/mail');

const router = express.Router();

const CONTACT_TO   = process.env.CONTACT_TO   || 'junaid.khan@map-doc.com';
const CONTACT_FROM = process.env.CONTACT_FROM || 'noreply@map-doc.com';
const CONTACT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Tiny in-memory per-IP throttle: max 5 submissions / 10 min. Resets on
// restart — enough to blunt casual abuse without a datastore.
const contactHits = new Map();
function contactRateLimited(ip) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const recent = (contactHits.get(ip) || []).filter((t) => now - t < windowMs);
  recent.push(now);
  contactHits.set(ip, recent);
  return recent.length > 5;
}

const escapeHtml = (s) =>
  String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

router.post('/contact', async (req, res) => {
  const { name = '', email = '', message = '', company = '' } = req.body || {};

  // Honeypot: real users never see/fill the hidden "company" field.
  if (String(company).trim()) return res.json({ ok: true });

  const cleanName    = String(name).trim();
  const cleanEmail   = String(email).trim();
  const cleanMessage = String(message).trim();

  if (!cleanName || !cleanEmail || !cleanMessage) {
    return res.status(400).json({ error: 'Name, email and message are all required.' });
  }
  if (!CONTACT_EMAIL_RE.test(cleanEmail) || cleanEmail.length > 254) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (cleanName.length > 120 || cleanMessage.length > 5000) {
    return res.status(400).json({ error: 'That message is too long.' });
  }

  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    console.error('[contact] SENDGRID_API_KEY not set');
    return res.status(503).json({ error: 'Contact form is not configured yet.' });
  }

  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
    .split(',')[0]
    .trim();
  if (contactRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many messages — please try again in a little while.' });
  }

  try {
    sgMail.setApiKey(apiKey);
    await sgMail.send({
      to: CONTACT_TO,
      from: CONTACT_FROM, // must be a SendGrid-authenticated sender/domain
      replyTo: { email: cleanEmail, name: cleanName },
      subject: `New contact message from ${cleanName}`,
      text: `Name: ${cleanName}\nEmail: ${cleanEmail}\n\n${cleanMessage}`,
      html:
        `<p><strong>Name:</strong> ${escapeHtml(cleanName)}<br>` +
        `<strong>Email:</strong> ${escapeHtml(cleanEmail)}</p>` +
        `<p style="white-space:pre-wrap">${escapeHtml(cleanMessage)}</p>`,
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[contact]', err?.response?.body || err);
    return res.status(502).json({ error: 'Could not send your message. Please try again.' });
  }
});

module.exports = router;
