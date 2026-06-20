'use strict';

/**
 * backend/admin/index.js  [ADMIN PANEL — isolated feature]
 *
 * Express router for the platform-admin panel. Mounted from backend/index.js
 * with a single tagged line:
 *
 *   app.use(require('./admin'));   // [ADMIN PANEL]
 *
 * Remove that line + this folder to delete the feature entirely. Nothing else
 * depends on it.
 *
 * Every route is admin-gated server-side via resolveAdmin().
 */

const express = require('express');

const { resolveAdmin } = require('./middleware');
const { listAllUsers } = require('./users');
const { setPlanForEmail } = require('./setPlan');

const router = express.Router();

// Map a thrown error to its HTTP status; log only true server faults.
function sendError(res, tag, err, fallback) {
  const status = err.status || 500;
  if (status >= 500) console.error(tag, err);
  return res.status(status).json({ error: err.message || fallback });
}

/**
 * GET /v1/admin/me
 * Cheap probe for the client guard. Returns { isAdmin: false } (not 403) for a
 * signed-in non-admin so the UI can branch without treating it as an error.
 * A missing/invalid token is still a 401.
 */
router.get('/v1/admin/me', async (req, res) => {
  try {
    const auth = await resolveAdmin(req.headers.authorization);
    if (!auth.ok && auth.status === 401) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    return res.json({ isAdmin: !!auth.ok });
  } catch (err) {
    return sendError(res, '[admin/me]', err, 'Could not resolve admin status.');
  }
});

/** GET /v1/admin/users — every account, newest first. */
router.get('/v1/admin/users', async (req, res) => {
  try {
    const auth = await resolveAdmin(req.headers.authorization);
    if (!auth.ok) return res.status(auth.status).json({ error: 'Admin access required.' });
    return res.json({ users: await listAllUsers() });
  } catch (err) {
    return sendError(res, '[admin/users]', err, 'Could not load users.');
  }
});

/** POST /v1/admin/set-plan  body { email, plan } — grant a plan to an account. */
router.post('/v1/admin/set-plan', async (req, res) => {
  try {
    const auth = await resolveAdmin(req.headers.authorization);
    if (!auth.ok) return res.status(auth.status).json({ error: 'Admin access required.' });

    const { email, plan } = req.body || {};
    const result = await setPlanForEmail(email, plan);
    return res.json({ ok: true, ...result });
  } catch (err) {
    return sendError(res, '[admin/set-plan]', err, 'Could not set plan.');
  }
});

module.exports = router;
