'use strict';

/**
 * backend/cloud/runHistory.js
 *
 * Durable run persistence (P8) — replaces the in-memory run map so runs survive
 * restarts and can be listed per team. Thin Supabase helpers; always team-scoped.
 */

const TABLE = 'cloud_runs';
// hcl is intentionally excluded from the public projection (large; server-only).
// The build_* handle is included so the reconciler (and getRun) can resolve a run
// from its CodeBuild build — see CLOUD_RUN_RECONCILIATION_ARCHITECTURE.md.
const PUBLIC = 'id, kind, status, simulated, plan, outputs, error, name, connection_id, deployment_id, build_id, build_region, result_key, build_started_at, created_at';

async function createRun(sb, teamId, { connectionId = null, deploymentId = null, name = null, hcl = null, status = 'running', kind = 'plan', plan = null, simulated = false }) {
  const { data, error } = await sb
    .from(TABLE)
    // A run created directly in a build state ('running' = plan/drift) has its build
    // attempt begin now; stamp build_started_at so the reconciler anchors on the
    // build attempt, not row creation (see setBuildHandle / CLOUD_RUN_RECONCILIATION §5).
    .insert({
      team_id: teamId, connection_id: connectionId, deployment_id: deploymentId, name, hcl, status, kind, plan, simulated,
      build_started_at: status === 'running' ? new Date().toISOString() : null,
    })
    .select(PUBLIC)
    .single();
  if (error) throw error;
  return data;
}

/**
 * The last successfully applied run for a deployment (incl. hcl, for re-planning
 * against live state). This is what "the deployment" resolves to at run time.
 * null if nothing was ever applied for it.
 */
async function latestAppliedForDeployment(sb, teamId, deploymentId) {
  const { data, error } = await sb
    .from(TABLE)
    .select(`${PUBLIC}, hcl`)
    .eq('team_id', teamId)
    .eq('deployment_id', deploymentId)
    .eq('status', 'applied')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** The most recent drift check for a deployment (public projection). */
async function latestDriftForDeployment(sb, teamId, deploymentId) {
  const { data, error } = await sb
    .from(TABLE)
    .select(PUBLIC)
    .eq('team_id', teamId)
    .eq('deployment_id', deploymentId)
    .eq('kind', 'drift')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** The most recent workload deploy for a deployment (public projection). */
async function latestDeployForDeployment(sb, teamId, deploymentId) {
  const { data, error } = await sb
    .from(TABLE)
    .select(PUBLIC)
    .eq('team_id', teamId)
    .eq('deployment_id', deploymentId)
    .eq('kind', 'deploy')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Connection-scoped variants — the last applied run / drift check across ALL of a
 * connection's deployments. Kept for the connection-addressed drift GET and the
 * Phase 2 worker, which still sweep at connection granularity.
 */
async function latestApplied(sb, teamId, connectionId) {
  const { data, error } = await sb
    .from(TABLE)
    .select(`${PUBLIC}, hcl`)
    .eq('team_id', teamId)
    .eq('connection_id', connectionId)
    .eq('status', 'applied')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function latestDrift(sb, teamId, connectionId) {
  const { data, error } = await sb
    .from(TABLE)
    .select(PUBLIC)
    .eq('team_id', teamId)
    .eq('connection_id', connectionId)
    .eq('kind', 'drift')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
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

/**
 * Persist the durable build handle on a run — the immediate next step after
 * StartBuild (CLOUD_RUN_RECONCILIATION_ARCHITECTURE.md §6). It does NOT set
 * build_started_at: that is stamped at the build-phase TRANSITION (createRun for
 * plan/drift; the applying update for apply/deploy), so it is present even when a
 * crash lands in the StartBuild → setBuildHandle window — which is exactly the
 * null-handle orphan the reconciler must still be able to age out correctly.
 */
async function setBuildHandle(sb, teamId, id, { buildId, region, resultKey }) {
  return updateRun(sb, teamId, id, {
    build_id: buildId,
    build_region: region,
    result_key: resultKey,
  });
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

module.exports = {
  createRun, getRun, updateRun, setBuildHandle, listRuns,
  latestApplied, latestDrift,
  latestAppliedForDeployment, latestDriftForDeployment, latestDeployForDeployment,
};
