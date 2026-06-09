import { createClient } from '@supabase/supabase-js';

// Server-only client. Uses the service_role key, which bypasses RLS so the
// sync route can write match results. NEVER import this into a client
// component — it would leak the service key to the browser.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
