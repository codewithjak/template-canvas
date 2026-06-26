'use strict';

/**
 * routes/cloudArchitect.js
 *
 * LLM architect for the Visual Cloud Builder (P10):
 *   POST /v1/cloud/architect  { intent, patterns:[{id,title,description}], provider }
 *                             → { patternId, region, name, rationale }
 *
 * The server only PICKS a pattern; the client assembles the vetted blueprint.
 * Gated by requireTeam (auth + plan); per-tier metering is a follow-up (see
 * ai-feature-gating). Mounted by index.js (one additive `app.use` line).
 */

const express = require('express');

const { httpError, sendError, requireTeam } = require('../lib/apiAuth');
const { selectPattern } = require('../cloud/llm/architect');

const router = express.Router();

router.post('/v1/cloud/architect', async (req, res) => {
  try {
    await requireTeam(req);
    const { intent, patterns, provider } = req.body || {};
    if (!intent || !Array.isArray(patterns) || patterns.length === 0) {
      throw httpError(400, 'intent and a non-empty patterns list are required.');
    }
    const choice = await selectPattern({ intent, patterns, provider });
    res.json(choice);
  } catch (err) {
    sendError(res, '[cloud/architect]', err);
  }
});

module.exports = router;
