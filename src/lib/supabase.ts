import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Present only when the build was given Supabase keys. Without them the app
 * runs in "local mode": no login, data kept in this browser.
 */
export const supabase: SupabaseClient | null = url && key
  ? createClient(url, key, {
    auth: {
      // PKCE puts the email-link code in ?code= instead of the #hash, which the hash router owns.
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
  : null;

export const cloudEnabled = supabase !== null;

/** Where email links (confirm, reset password) should send people back to. */
export const appUrl = () => `${window.location.origin}${window.location.pathname}`;
