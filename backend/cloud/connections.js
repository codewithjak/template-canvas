'use strict';

/**
 * backend/cloud/connections.js
 *
 * Persistence for cloud_connections (P5). Thin Supabase helpers so the route
 * stays small. Always scoped by team_id — every query filters on it.
 */

const { randomUUID } = require('crypto');

const TABLE = 'cloud_connections';
const PUBLIC_COLS = 'id, provider, region, status, role_arn, account_id, state_bucket, lock_table, runner_project, deploy_project, deploy_role_arn, created_at';

async function createConnection(sb, teamId, { provider = 'aws', region = 'us-east-1' }) {
  const { data, error } = await sb
    .from(TABLE)
    .insert({ team_id: teamId, provider, region, external_id: randomUUID(), status: 'pending' })
    .select(`${PUBLIC_COLS}, external_id`)
    .single();
  if (error) throw error;
  return data;
}

async function listConnections(sb, teamId) {
  const { data, error } = await sb
    .from(TABLE)
    .select(PUBLIC_COLS)
    .eq('team_id', teamId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/** Full row (incl. external_id) for server-side use like verify. */
async function getConnection(sb, teamId, id) {
  const { data, error } = await sb
    .from(TABLE)
    .select(`${PUBLIC_COLS}, external_id`)
    .eq('team_id', teamId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function updateConnection(sb, teamId, id, patch) {
  const { data, error } = await sb
    .from(TABLE)
    .update(patch)
    .eq('team_id', teamId)
    .eq('id', id)
    .select(PUBLIC_COLS)
    .single();
  if (error) throw error;
  return data;
}

async function deleteConnection(sb, teamId, id) {
  const { error } = await sb.from(TABLE).delete().eq('team_id', teamId).eq('id', id);
  if (error) throw error;
}

module.exports = {
  createConnection,
  listConnections,
  getConnection,
  updateConnection,
  deleteConnection,
};
