'use strict';

/**
 * backend/cloud/deployments.js
 *
 * Persistence for cloud_deployments — the per-account registry of live infras
 * (CLOUD_BUILDER_DEPLOYMENTS_ARCHITECTURE.md). A deployment is a template applied
 * to a connection; it owns one Terraform state key, which is what lets a single
 * account hold many infras without their state colliding.
 *
 * Thin Supabase helpers, always team-scoped. Service-role only (RLS on, no
 * client policies), like connections / runs.
 */

const TABLE = 'cloud_deployments';
const COLS = 'id, team_id, connection_id, template_id, name, status, state_key, last_run_id, created_at, updated_at';

/**
 * The S3 state key for a deployment: its pinned override (migrated legacy
 * deployments) or the derived, per-deployment key. Keeping this here means the
 * runner never re-derives the key from the connection alone.
 */
function stateKeyFor(deployment) {
  if (deployment.state_key) return deployment.state_key;
  return `state/${deployment.connection_id}/${deployment.id}.tfstate`;
}

async function getDeployment(sb, teamId, id) {
  const { data, error } = await sb
    .from(TABLE)
    .select(COLS)
    .eq('team_id', teamId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function listByConnection(sb, teamId, connectionId) {
  const { data, error } = await sb
    .from(TABLE)
    .select(COLS)
    .eq('team_id', teamId)
    .eq('connection_id', connectionId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

/** Match a deployment by its (connection, template) identity. templateId null =
 *  the connection's default deployment. */
async function findByIdentity(sb, teamId, connectionId, templateId = null) {
  let q = sb
    .from(TABLE)
    .select(COLS)
    .eq('team_id', teamId)
    .eq('connection_id', connectionId);
  q = templateId == null ? q.is('template_id', null) : q.eq('template_id', templateId);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Resolve the deployment for a (connection, template), creating it on first use.
 * The unique indexes on (connection_id) where template_id is null and on
 * (connection_id, template_id) make this safe under a race: a concurrent insert
 * loses, and we re-read the winner.
 */
async function findOrCreate(sb, teamId, { connectionId, templateId = null, name = 'Untitled' }) {
  const existing = await findByIdentity(sb, teamId, connectionId, templateId);
  if (existing) return existing;

  const { data, error } = await sb
    .from(TABLE)
    .insert({ team_id: teamId, connection_id: connectionId, template_id: templateId, name })
    .select(COLS)
    .single();
  if (!error) return data;

  // Unique-violation => a concurrent create won; return that row.
  if (error.code === '23505') return findByIdentity(sb, teamId, connectionId, templateId);
  throw error;
}

async function updateDeployment(sb, teamId, id, patch) {
  const { data, error } = await sb
    .from(TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('team_id', teamId)
    .eq('id', id)
    .select(COLS)
    .single();
  if (error) throw error;
  return data;
}

module.exports = { stateKeyFor, getDeployment, listByConnection, findByIdentity, findOrCreate, updateDeployment };
