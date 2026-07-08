'use strict';

/**
 * routes/cloudAgent.js
 *
 * Local-agent Phase 1 (CLOUD_LOCAL_AGENT_ARCHITECTURE.md): turn a repo's app
 * understanding into a reviewable cloud template. The `mapdoc` CLI scans the repo
 * locally and posts the SANITIZED app understanding here (it never sends source or
 * secrets, and it never touches the cloud). We infer a lint-clean blueprint and
 * save it as a cloud template, which the user then opens in the builder to review,
 * adjust, and apply. Nothing is deployed; this only proposes infra on the canvas.
 *
 *   POST /v1/cloud/agent/analyze  { app }  → { templateId, name, blueprint }
 */

const express = require('express');

const { httpError, sendError, requireTeam } = require('../lib/apiAuth');
const { inferBlueprint } = require('../agent/inferBlueprint');

const router = express.Router();

router.post('/v1/cloud/agent/analyze', async (req, res) => {
  try {
    const { teamId, sb } = await requireTeam(req);
    const app = req.body && req.body.app;
    if (!app || typeof app !== 'object') throw httpError(400, 'app (the repo understanding) is required.');

    const blueprint = inferBlueprint(app);
    const name = `${app.name || 'app'} (from repo)`;
    const { data, error } = await sb
      .from('templates')
      .insert({ team_id: teamId, name, environment: 'cloud', body_json: blueprint })
      .select('id')
      .single();
    if (error) throw error;

    res.status(201).json({ templateId: data.id, name, blueprint });
  } catch (err) {
    sendError(res, '[cloud/agent analyze]', err);
  }
});

module.exports = router;
