'use strict';

/**
 * routes/contact.js
 *
 * The public "Contact us" form from the marketing site. It emails the message
 * to CONTACT_TO via SendGrid, with the visitor's address as Reply-To. Because
 * it's unauthenticated, it is validated, honeypot-guarded, and lightly
 * rate-limited per IP.
 *
 * Email validation, HTML escaping, the rate limiter, IP extraction, and the
 * SendGrid send all come from the shared lib/email.js — one implementation,
 * reused by every email path.
 *
 * Exports an Express router mounted by index.js.
 */

const express = require('express');
const {
  isValidEmail, escapeHtml, clientIp, makeRateLimiter, isEmailConfigured, sendMail,
} = require('../lib/email');

const router = express.Router();

const CONTACT_TO   = process.env.CONTACT_TO   || 'junaid.khan@map-doc.com';
const CONTACT_FROM = process.env.CONTACT_FROM || 'noreply@map-doc.com';

// Max 5 submissions / 10 min per IP.
const contactRateLimited = makeRateLimiter(5, 10 * 60 * 1000);

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
  if (!isValidEmail(cleanEmail)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (cleanName.length > 120 || cleanMessage.length > 5000) {
    return res.status(400).json({ error: 'That message is too long.' });
  }

  if (!isEmailConfigured()) {
    console.error('[contact] SENDGRID_API_KEY not set');
    return res.status(503).json({ error: 'Contact form is not configured yet.' });
  }

  if (contactRateLimited(clientIp(req))) {
    return res.status(429).json({ error: 'Too many messages — please try again in a little while.' });
  }

  try {
    await sendMail({
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
