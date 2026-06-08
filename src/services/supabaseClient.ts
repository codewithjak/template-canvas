/**
 * src/services/supabaseClient.ts
 * Single shared Supabase browser client.
 *
 * The Supabase client is the source of truth for the session: it persists
 * the session, silently refreshes the access token, and (PKCE flow) exchanges
 * the OAuth code on the callback URL. React only ever reflects this state.
 */
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Missing Supabase env vars. Copy .env.example to .env.local and set ' +
      'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see SETUP_AUTH.md).',
  )
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
})
