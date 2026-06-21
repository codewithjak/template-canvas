'use strict';

/**
 * routes/teamApi.js
 *
 * The API-integration and team-management endpoints. These are entirely
 * separate from the generate/parse routes — they add a second auth mode
 * (an API key) alongside the app's Supabase-JWT flow, plus team admin.
 *
 *   Key management (JWT):   POST/GET /v1/keys, POST /v1/keys/revoke, GET /v1/usage
 *   Team management (JWT):  GET /v1/team, POST /v1/team/invites[/revoke],
 *                           POST /v1/team/members/remove,
 *                           GET /v1/invites/:token, POST /v1/invites/accept
 *   Data ingestion (key):   POST /v1/ingest
 *   Dev-only plan switch:   POST /v1/plan
 *
 * Exports an Express router mounted by index.js.
 */

const express = require('express');

const { parseDataSource, validateBindings } = require('../parsers/index');
const { planAllows, PLAN_ORDER, getPlan } = require('../plans');
const {
  extractApiKey,
  resolveTeamFromJwt,
  resolveTeamFromApiKey,
  issueKeyForTeam,
  getKeyMeta,
  revokeKeyForTeam,
} = require('../apiKeys');
const {
  listTeam,
  createInvite,
  revokeInvite,
  removeMember,
  lookupInvite,
  acceptInvite,
} = require('../teams');
const { getUsageSummary, getTeamPlan } = require('../usage');
const { getAdmin: getSupabaseAdmin } = require('../supabaseAdmin');
const { isEmailConfigured, sendInviteEmail } = require('../lib/email');

// Where the invitee lands. Must be the deployed frontend in production
// (e.g. https://app.map-doc.com); falls back to local dev.
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

const router = express.Router();

// Owner/admin may manage the team; members/viewers may not.
const isManager = (role) => role === 'owner' || role === 'admin';

// Flatten a saved template document (body_json) to its element list.
function collectTemplateElements(bodyJson) {
  if (!bodyJson || !Array.isArray(bodyJson.pages)) return [];
  return bodyJson.pages.flatMap(p => (Array.isArray(p.elements) ? p.elements : []));
}

// Map a thrown error to its HTTP status; log only true server faults.
function sendTeamError(res, tag, err, fallback) {
  const status = err.status || 500;
  if (status >= 500) console.error(tag, err);
  return res.status(status).json({ error: err.message || fallback });
}

// ── Key management (JWT-scoped) ───────────────────────────────────────────────

router.post('/v1/keys', async (req, res) => {
  try {
    const ctx = await resolveTeamFromJwt(req.headers.authorization);
    if (!ctx) return res.status(401).json({ error: 'Authentication required.' });
    // API access is a Business-tier capability.
    if (!planAllows(await getTeamPlan(ctx.teamId), 'api')) {
      return res.status(403).json({ error: 'API access requires the Business plan. Upgrade to unlock it.' });
    }
    const apiKey = await issueKeyForTeam(ctx.teamId);
    // Returned ONCE. Only a hash is stored — it cannot be retrieved again.
    return res.json({ apiKey, prefix: apiKey.slice(0, 14) });
  } catch (err) {
    console.error('[v1/keys POST]', err);
    return res.status(500).json({ error: err.message || 'Could not issue key.' });
  }
});

router.get('/v1/keys', async (req, res) => {
  try {
    const ctx = await resolveTeamFromJwt(req.headers.authorization);
    if (!ctx) return res.status(401).json({ error: 'Authentication required.' });
    return res.json({ key: await getKeyMeta(ctx.teamId) });
  } catch (err) {
    console.error('[v1/keys GET]', err);
    return res.status(500).json({ error: err.message || 'Could not load key.' });
  }
});

router.post('/v1/keys/revoke', async (req, res) => {
  try {
    const ctx = await resolveTeamFromJwt(req.headers.authorization);
    if (!ctx) return res.status(401).json({ error: 'Authentication required.' });
    await revokeKeyForTeam(ctx.teamId);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[v1/keys/revoke]', err);
    return res.status(500).json({ error: err.message || 'Could not revoke key.' });
  }
});

router.get('/v1/usage', async (req, res) => {
  try {
    const ctx = await resolveTeamFromJwt(req.headers.authorization);
    if (!ctx) return res.status(401).json({ error: 'Authentication required.' });
    return res.json(await getUsageSummary(ctx.teamId));
  } catch (err) {
    console.error('[v1/usage]', err);
    return res.status(500).json({ error: err.message || 'Could not load usage.' });
  }
});

// ── Team management (JWT-scoped) ──────────────────────────────────────────────
// Team workspaces are a Business-tier capability; every team route re-checks it
// server-side (a downgrade must stop further management).

router.get('/v1/team', async (req, res) => {
  try {
    const ctx = await resolveTeamFromJwt(req.headers.authorization);
    if (!ctx) return res.status(401).json({ error: 'Authentication required.' });
    if (!planAllows(await getTeamPlan(ctx.teamId), 'teams')) {
      return res.status(403).json({ error: 'Team workspaces require the Business plan.' });
    }
    const data = await listTeam(ctx.teamId);
    return res.json({ ...data, role: ctx.role, currentUserId: ctx.userId });
  } catch (err) {
    return sendTeamError(res, '[v1/team GET]', err, 'Could not load team.');
  }
});

router.post('/v1/team/invites', async (req, res) => {
  try {
    const ctx = await resolveTeamFromJwt(req.headers.authorization);
    if (!ctx) return res.status(401).json({ error: 'Authentication required.' });
    if (!planAllows(await getTeamPlan(ctx.teamId), 'teams')) {
      return res.status(403).json({ error: 'Team workspaces require the Business plan.' });
    }
    if (!isManager(ctx.role)) {
      return res.status(403).json({ error: 'Only owners and admins can invite members.' });
    }
    const { email, role } = req.body || {};
    const invite = await createInvite(ctx.teamId, email, role, ctx.userId);

    // Email the invitee a branded accept link. The invite row already exists,
    // so a send failure must NOT fail the request — the returned token still
    // lets the UI show a copyable link as a fallback. We report whether the
    // email went out so the UI can message accordingly.
    const acceptUrl = `${FRONTEND_ORIGIN}/invite?token=${invite.token}`;
    let emailed = false;
    if (isEmailConfigured()) {
      try {
        const sb = getSupabaseAdmin();
        const { data: team } = sb
          ? await sb.from('teams').select('name').eq('id', ctx.teamId).maybeSingle()
          : { data: null };
        await sendInviteEmail({
          to:        invite.email,
          teamName:  team?.name,
          role:      invite.role,
          acceptUrl,
          invitedBy: ctx.userEmail,
        });
        emailed = true;
      } catch (mailErr) {
        console.error('[v1/team/invites] email send failed', mailErr?.response?.body || mailErr);
      }
    }

    // The token is returned so the UI can build a shareable accept link too.
    return res.json({ invite, emailed });
  } catch (err) {
    return sendTeamError(res, '[v1/team/invites]', err, 'Could not create invite.');
  }
});

router.post('/v1/team/invites/revoke', async (req, res) => {
  try {
    const ctx = await resolveTeamFromJwt(req.headers.authorization);
    if (!ctx) return res.status(401).json({ error: 'Authentication required.' });
    if (!isManager(ctx.role)) {
      return res.status(403).json({ error: 'Only owners and admins can manage invites.' });
    }
    const { inviteId } = req.body || {};
    if (!inviteId) return res.status(400).json({ error: '"inviteId" is required.' });
    await revokeInvite(ctx.teamId, inviteId);
    return res.json({ ok: true });
  } catch (err) {
    return sendTeamError(res, '[v1/team/invites/revoke]', err, 'Could not revoke invite.');
  }
});

router.post('/v1/team/members/remove', async (req, res) => {
  try {
    const ctx = await resolveTeamFromJwt(req.headers.authorization);
    if (!ctx) return res.status(401).json({ error: 'Authentication required.' });
    if (!isManager(ctx.role)) {
      return res.status(403).json({ error: 'Only owners and admins can remove members.' });
    }
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: '"userId" is required.' });
    await removeMember(ctx.teamId, userId);
    return res.json({ ok: true });
  } catch (err) {
    return sendTeamError(res, '[v1/team/members/remove]', err, 'Could not remove member.');
  }
});

// Unauthenticated — the token itself is the capability. Lets the accept page
// show "you've been invited to X" before the user signs in.
router.get('/v1/invites/:token', async (req, res) => {
  try {
    const info = await lookupInvite(req.params.token);
    if (!info) return res.status(404).json({ error: 'This invite link is invalid.' });
    return res.json(info);
  } catch (err) {
    return sendTeamError(res, '[v1/invites GET]', err, 'Could not load invite.');
  }
});

router.post('/v1/invites/accept', async (req, res) => {
  try {
    const ctx = await resolveTeamFromJwt(req.headers.authorization);
    if (!ctx) return res.status(401).json({ error: 'Sign in to accept this invite.' });
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: '"token" is required.' });
    const result = await acceptInvite(ctx.userId, ctx.userEmail, token);
    return res.json({ ok: true, ...result });
  } catch (err) {
    return sendTeamError(res, '[v1/invites/accept]', err, 'Could not accept invite.');
  }
});

// ── Data ingestion (API-key-scoped) ───────────────────────────────────────────
//
// Body: { templateId: <uuid>, data: <any JSON> }
// Auth: X-API-Key: tc_live_…   (or Authorization: Bearer tc_live_…)
//
// Normalises the payload to the CanonicalDocument IR using the SAME parser the
// app's /parse-json route uses, verifies the template belongs to the key's
// team, then upserts the payload onto template_bindings.last_payload for
// (team, template). Existing mapping columns on that row are preserved.
router.post('/v1/ingest', async (req, res) => {
  try {
    const rawKey = extractApiKey(req);
    if (!rawKey) return res.status(401).json({ error: 'API key required (X-API-Key header).' });

    const teamId = await resolveTeamFromApiKey(rawKey);
    if (!teamId) return res.status(403).json({ error: 'Invalid or revoked API key.' });

    // A team can hold a key issued while on Business but later downgrade — keep
    // the capability check live on every request, not just at issue time.
    if (!planAllows(await getTeamPlan(teamId), 'api')) {
      return res.status(403).json({ error: 'API access requires the Business plan.' });
    }

    const { templateId, data } = req.body || {};
    if (!templateId)        return res.status(400).json({ error: '"templateId" is required.' });
    if (data === undefined) return res.status(400).json({ error: '"data" is required.' });

    const sb = getSupabaseAdmin();
    if (!sb) return res.status(503).json({ error: 'Server not configured for Supabase.' });

    // Tenant isolation: the template must belong to the key's team.
    const { data: tpl, error: tplErr } = await sb
      .from('templates')
      .select('id, team_id, body_json')
      .eq('id', templateId)
      .maybeSingle();
    if (tplErr) throw tplErr;
    if (!tpl || tpl.team_id !== teamId) {
      return res.status(404).json({ error: 'Template not found for this team.' });
    }

    // Normalise → CanonicalDocument IR (same path as POST /parse-json).
    let ir;
    try {
      ir = parseDataSource(data, 'application/json');
    } catch (e) {
      return res.status(422).json({ error: `Could not parse data: ${e.message}` });
    }

    // Load any existing binding so we can validate against its saved mapping.
    const { data: binding } = await sb
      .from('template_bindings')
      .select('field_mapping')
      .eq('team_id', teamId)
      .eq('template_id', templateId)
      .maybeSingle();

    const fieldMapping = binding?.field_mapping || {};
    const elements     = collectTemplateElements(tpl.body_json);
    const validation   = validateBindings(elements, ir, fieldMapping);

    // Store latest payload. Only these columns are written, so existing mapping
    // columns are preserved on update and default to '{}' on first insert.
    const { error: upErr } = await sb.from('template_bindings').upsert(
      {
        team_id:        teamId,
        template_id:    templateId,
        last_payload:   ir,
        last_ingest_at: new Date().toISOString(),
        updated_at:     new Date().toISOString(),
      },
      { onConflict: 'team_id,template_id' },
    );
    if (upErr) throw upErr;

    return res.json({
      ok:          true,
      templateId,
      bound:       !!binding, // false → app needs a one-time link/mapping
      fields:      Object.keys(ir.fields).length,
      collections: Object.fromEntries(
        Object.entries(ir.collections).map(([k, c]) => [k, c.rows.length]),
      ),
      warnings:    ir.source?.warnings || [],
      validation,
    });
  } catch (err) {
    console.error('[v1/ingest]', err);
    return res.status(500).json({ error: err.message || 'Ingestion failed.' });
  }
});

// ── DEV-ONLY plan switch (stand-in for Stripe checkout) ───────────────────────
//
// Lets a signed-in user set their own team's plan, so the full gating
// experience is testable before billing exists. DISABLED unless
// ALLOW_PLAN_SELF_SERVICE=true — in production the Stripe webhook is the only
// thing that may write teams.plan.
//
// Body: { plan: 'free' | 'pro' | 'business' }
router.post('/v1/plan', async (req, res) => {
  if (process.env.ALLOW_PLAN_SELF_SERVICE !== 'true') {
    return res.status(403).json({ error: 'Plan changes are handled through billing.' });
  }
  try {
    const ctx = await resolveTeamFromJwt(req.headers.authorization);
    if (!ctx) return res.status(401).json({ error: 'Authentication required.' });

    const plan = String(req.body?.plan || '').toLowerCase();
    if (!PLAN_ORDER.includes(plan)) {
      return res.status(400).json({ error: `plan must be one of: ${PLAN_ORDER.join(', ')}` });
    }

    const sb = getSupabaseAdmin();
    if (!sb) return res.status(503).json({ error: 'Server not configured for Supabase.' });

    const { error } = await sb.from('teams').update({ plan }).eq('id', ctx.teamId);
    if (error) throw error;

    return res.json({ plan, name: getPlan(plan).name });
  } catch (err) {
    console.error('[v1/plan]', err);
    return res.status(500).json({ error: err.message || 'Could not change plan.' });
  }
});

module.exports = router;
