'use strict';

/**
 * backend/supabaseAdmin.js
 *
 * Shared, lazily-created Supabase service-role client for server-side code
 * that must bypass RLS (key resolution, ingest, usage). Same configuration
 * pattern as analytics.js — kept in its own module so multiple features can
 * reuse one client without duplicating the setup.
 *
 * Returns null when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set
 * (e.g. local dev), so callers can degrade gracefully instead of throwing.
 *
 * The service-role key bypasses RLS — keep it secret, never expose it to the
 * client, and only ever resolve tenant scope (team_id) server-side.
 */

const { createClient } = require('@supabase/supabase-js');

let admin = null;

function getAdmin() {
  if (admin) return admin;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

module.exports = { getAdmin };
