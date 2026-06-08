/**
 * src/services/config.ts
 * Central configuration for all service modules.
 * Uses Vite's environment variable convention (VITE_ prefix).
 */
import { supabase } from './supabaseClient';

export const API_BASE =
  import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

/**
 * Authorization header for backend calls. The server uses the bearer token
 * to derive who/which-team is exporting (tamper-proof usage tracking), so
 * export requests must carry it. Returns {} when signed out.
 */
export async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
