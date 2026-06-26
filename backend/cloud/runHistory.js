'use strict';

/**
 * backend/cloud/runHistory.js
 *
 * Durable run persistence (P8) — replaces the in-memory run map so runs survive
 * restarts and can be listed per team. Thin Supabase helpers; always team-scoped.
 */

const TABLE = 'cloud_runs';
// hcl is intentionally excluded from the public projection (large; server-only).
const PUBLIC = 'id, status, simulated, plan, outputs, error, name, connection_id, created_at';

async function createRun(sb, teamId, { connectionId = null, name = null, hcl = null, status = 'running', plan = null, simulated = false }) {
  const { data, error } = await sb
    .from(TABLE)
    .insert({ team_id: teamId, connection_id: connectionId, name, hcl, status, plan, simulated })
    .select(PUBLIC)
    .single();
  if (error) throw error;
  return data;
}

/** Full row incl. hcl — for server-side use (apply re-runs the stored HCL). */
async function getRun(sb, teamId, id) {
  const { data, error } = await sb
    .from(TABLE)
    .select(`${PUBLIC}, hcl`)
    .eq('team_id', teamId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function updateRun(sb, teamId, id, patch) {
  const { data, error } = await sb
    .from(TABLE)
    .update(patch)
    .eq('team_id', teamId)
    .eq('id', id)
    .select(PUBLIC)
    .single();
  if (error) throw error;
  return data;
}

async function listRuns(sb, teamId, limit = 20) {
  const { data, error } = await sb
    .from(TABLE)
    .select(PUBLIC)
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

module.exports = { createRun, getRun, updateRun, listRuns };
